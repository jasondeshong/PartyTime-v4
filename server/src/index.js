import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";

const app = express();
const httpServer = createServer(app);
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.CLIENT_URL,
].filter(Boolean);

const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGINS },
});

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// Rate limits — per IP
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many search requests — slow down" },
});
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth requests — slow down" },
});
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — slow down" },
});
app.use("/api/", generalLimiter);

// Supabase client — prefer service role key (bypasses RLS) so server can write.
// Falls back to anon key for local dev; warn if service key is missing in production.
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "⚠️  SUPABASE_SERVICE_ROLE_KEY not set — server is using anon key. " +
    "RLS lockdown will prevent writes once policies are applied."
  );
}
// Pass Node's native fetch explicitly — @supabase/supabase-js@2.101.1's
// default fetch path drops the Authorization header in Node, causing
// service_role requests to hit RLS as if they were anon.
const supabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
  global: { fetch: (...args) => fetch(...args) },
});

// Spotify token management
let spotifyToken = null;
let spotifyTokenExpiry = 0;

async function getSpotifyToken() {
  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;

  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    console.error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET env vars");
    throw new Error("Spotify credentials not configured");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.SPOTIFY_CLIENT_ID +
            ":" +
            process.env.SPOTIFY_CLIENT_SECRET
        ).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();

  if (data.error) {
    console.error("Spotify client credentials error:", data.error, data.error_description);
    throw new Error(`Spotify auth failed: ${data.error_description || data.error}`);
  }

  spotifyToken = data.access_token;
  spotifyTokenExpiry = Date.now() + data.expires_in * 1000 - 60000;
  return spotifyToken;
}

// In-memory state
const lobbyUsers = new Map(); // code -> [{ id, name }]
const lobbyHosts = new Map(); // code -> host userName (persists across disconnects)
const userVotes = new Map(); // "code:songId" -> Map(socketId -> "up"|"down")
const playedSongs = new Map(); // code -> Map(spotifyId -> timestamp)
const PLAYED_COOLDOWN_MS = 30 * 60 * 1000; // 30 minute cooldown before a song can be re-added

// --- Analytics event tracking ---
async function trackEvent(venueId, lobbyCode, eventType, payload = {}) {
  try {
    const { error } = await supabase.from("analytics_events").insert({
      venue_id: venueId || null,
      lobby_code: lobbyCode,
      event_type: eventType,
      payload,
    });
    if (error) {
      console.error(`Analytics trackEvent failed [${eventType}]:`, error.message);
    }
  } catch (err) {
    console.error(`Analytics trackEvent exception [${eventType}]:`, err.message);
  }
}

// Resolve venue_id from lobby_code (cached per-session in memory)
const lobbyVenueMap = new Map(); // code -> venueId | null
async function getVenueIdForLobby(code) {
  if (lobbyVenueMap.has(code)) return lobbyVenueMap.get(code);
  const { data } = await supabase
    .from("venues")
    .select("id")
    .eq("lobby_code", code)
    .single();
  const venueId = data?.id || null;
  lobbyVenueMap.set(code, venueId);
  return venueId;
}

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const SPOTIFY_SCOPES = [
  "streaming",
  "app-remote-control",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-library-read",
  "user-library-modify",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

// --- Auth middleware: verify Spotify token and attach user email ---
async function requireSpotifyAuth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing authorization token" });

  try {
    const profileRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!profileRes.ok) return res.status(401).json({ error: "Invalid token" });
    const profile = await profileRes.json();
    req.userEmail = profile.email;
    req.userId = profile.id;
    next();
  } catch {
    res.status(401).json({ error: "Token verification failed" });
  }
}

// --- REST routes ---

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Spotify OAuth: redirect to Spotify login
app.get("/api/auth/login", authLimiter, (_req, res) => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
  });
  res.redirect("https://accounts.spotify.com/authorize?" + params);
});

// Spotify OAuth: exchange code for tokens
app.post("/api/auth/callback", authLimiter, async (req, res) => {
  const { code, redirectUri } = req.body;
  if (!code) return res.status(400).json({ error: "Missing code" });

  // Use provided redirectUri (mobile) or fall back to env (web)
  const callbackUri = redirectUri || process.env.SPOTIFY_REDIRECT_URI;

  if (!callbackUri) {
    console.error("Auth callback: no redirect URI provided and SPOTIFY_REDIRECT_URI not set");
    return res.status(400).json({ error: "No redirect URI configured" });
  }

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.SPOTIFY_CLIENT_ID +
              ":" +
              process.env.SPOTIFY_CLIENT_SECRET
          ).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: callbackUri,
      }),
    });
    const tokens = await tokenRes.json();

    if (tokens.error) {
      console.error("Spotify token exchange error:", tokens.error, tokens.error_description);
      const status = tokens.error === "invalid_grant" ? 401 : 400;
      return res.status(status).json({
        error: tokens.error_description || tokens.error,
        code: tokens.error,
      });
    }

    const profileRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    if (profile.error) {
      console.error("Spotify profile fetch error:", profile.error);
      return res.status(502).json({ error: "Failed to fetch Spotify profile" });
    }

    res.json({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      user: {
        id: profile.id,
        name: profile.display_name,
        image: profile.images?.[0]?.url || null,
        premium: profile.product === "premium",
      },
    });
  } catch (err) {
    console.error("Auth callback error:", err);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// Spotify OAuth: refresh token
app.post("/api/auth/refresh", authLimiter, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: "Missing refresh token" });

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.SPOTIFY_CLIENT_ID +
              ":" +
              process.env.SPOTIFY_CLIENT_SECRET
          ).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const tokens = await tokenRes.json();

    if (tokens.error) {
      console.error("Spotify refresh error:", tokens.error, tokens.error_description);
      const status = tokens.error === "invalid_grant" ? 401 : 400;
      return res.status(status).json({
        error: tokens.error_description || tokens.error,
        code: tokens.error,
      });
    }

    res.json({
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
    });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

// Spotify search
app.get("/api/spotify/search", searchLimiter, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ tracks: [] });

  try {
    const token = await getSpotifyToken();
    const spotRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await spotRes.json();
    const tracks = (data.tracks?.items || []).map((t) => ({
      spotifyId: t.id,
      title: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      album: t.album.name,
      albumArt: t.album.images[1]?.url || t.album.images[0]?.url || "",
      previewUrl: t.preview_url,
      duration: t.duration_ms,
    }));
    res.json({ tracks });
  } catch (err) {
    console.error("Spotify search error:", err);
    res.status(500).json({ error: "Spotify search failed" });
  }
});

// Get user's liked songs (requires user token)
app.get("/api/spotify/liked", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const offset = req.query.offset || 0;
    const spotRes = await fetch(
      `https://api.spotify.com/v1/me/tracks?limit=20&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await spotRes.json();
    const tracks = (data.items || []).map((item) => {
      const t = item.track;
      return {
        spotifyId: t.id,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(", "),
        album: t.album.name,
        albumArt: t.album.images[1]?.url || t.album.images[0]?.url || "",
        previewUrl: t.preview_url,
        duration: t.duration_ms,
      };
    });
    res.json({ tracks, total: data.total, hasMore: data.next !== null });
  } catch (err) {
    console.error("Liked songs error:", err);
    res.status(500).json({ error: "Failed to fetch liked songs" });
  }
});

// Get user's playlists
app.get("/api/spotify/playlists", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const spotRes = await fetch(
      "https://api.spotify.com/v1/me/playlists?limit=50",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await spotRes.json();
    const playlists = (data.items || []).map((p) => ({
      id: p.id,
      name: p.name,
      image: p.images?.[0]?.url || "",
      trackCount: p.tracks.total,
      owner: p.owner.display_name,
    }));
    res.json({ playlists });
  } catch (err) {
    console.error("Playlists error:", err);
    res.status(500).json({ error: "Failed to fetch playlists" });
  }
});

// Get tracks from a playlist
app.get("/api/spotify/playlists/:id/tracks", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const offset = req.query.offset || 0;
    const spotRes = await fetch(
      `https://api.spotify.com/v1/playlists/${req.params.id}/tracks?limit=20&offset=${offset}&fields=items(track(id,name,artists,album,duration_ms,preview_url)),total,next`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await spotRes.json();
    const tracks = (data.items || [])
      .filter((item) => item.track)
      .map((item) => {
        const t = item.track;
        return {
          spotifyId: t.id,
          title: t.name,
          artist: t.artists.map((a) => a.name).join(", "),
          album: t.album.name,
          albumArt: t.album.images?.[1]?.url || t.album.images?.[0]?.url || "",
          previewUrl: t.preview_url,
          duration: t.duration_ms,
        };
      });
    res.json({ tracks, total: data.total, hasMore: data.next !== null });
  } catch (err) {
    console.error("Playlist tracks error:", err);
    res.status(500).json({ error: "Failed to fetch playlist tracks" });
  }
});

// Create lobby
app.post("/api/lobbies", async (_req, res) => {
  const code = generateCode();
  const { error } = await supabase
    .from("lobbies")
    .insert({ code, now_playing: null });

  if (error) {
    console.error("Supabase insert error:", error);
    return res.status(500).json({ error: "Failed to create lobby" });
  }

  lobbyUsers.set(code, []);
  playedSongs.set(code, new Map());
  res.json({ code });
});

// --- Venue CRUD (B2B) ---

// Create venue with permanent lobby
app.post("/api/venues", requireSpotifyAuth, async (req, res) => {
  const { name, slug, settings } = req.body;
  const ownerId = req.userId;
  if (!ownerId) {
    return res.status(400).json({ error: "Could not determine your Spotify ID" });
  }
  if (!name || !slug) {
    return res.status(400).json({ error: "Missing name or slug" });
  }

  // Validate slug format: lowercase alphanumeric + hyphens
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return res.status(400).json({ error: "Slug must be lowercase letters, numbers, and hyphens" });
  }

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from("venues")
    .select("id")
    .eq("slug", slug)
    .single();
  if (existing) {
    return res.status(409).json({ error: "Slug already taken" });
  }

  // Create a permanent lobby for this venue
  const code = generateCode();
  const { error: lobbyError } = await supabase
    .from("lobbies")
    .insert({ code, now_playing: null });
  if (lobbyError) {
    console.error("Venue lobby creation error:", lobbyError);
    return res.status(500).json({ error: "Failed to create venue lobby" });
  }
  lobbyUsers.set(code, []);
  playedSongs.set(code, new Map());

  const { data: venue, error } = await supabase
    .from("venues")
    .insert({
      name,
      slug,
      owner_spotify_id: ownerId,
      lobby_code: code,
      settings: settings || {},
    })
    .select()
    .single();

  if (error) {
    console.error("Venue creation error:", error, "ownerId:", ownerId);
    return res.status(500).json({ error: `Venue insert failed: ${error.message || error.code}` });
  }

  // Cache the mapping
  lobbyVenueMap.set(code, venue.id);

  res.json({
    id: venue.id,
    name: venue.name,
    slug: venue.slug,
    lobbyCode: venue.lobby_code,
    settings: venue.settings,
    createdAt: venue.created_at,
  });
});

// List venues owned by the authenticated user
app.get("/api/venues/by-owner", requireSpotifyAuth, async (req, res) => {
  const { data: venues, error } = await supabase
    .from("venues")
    .select("*")
    .eq("owner_spotify_id", req.userId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: "Failed to fetch venues" });

  res.json(
    (venues || []).map((v) => ({
      id: v.id,
      name: v.name,
      slug: v.slug,
      lobbyCode: v.lobby_code,
      settings: v.settings,
      createdAt: v.created_at,
    }))
  );
});

// Resolve venue by slug
app.get("/api/venues/:slug", async (req, res) => {
  const { data: venue, error } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", req.params.slug)
    .single();

  if (error || !venue) {
    return res.status(404).json({ error: "Venue not found" });
  }

  res.json({
    id: venue.id,
    name: venue.name,
    slug: venue.slug,
    lobbyCode: venue.lobby_code,
    settings: venue.settings,
    createdAt: venue.created_at,
  });
});

// Update venue settings
app.put("/api/venues/:id", requireSpotifyAuth, async (req, res) => {
  const { data: existing } = await supabase
    .from("venues")
    .select("owner_spotify_id")
    .eq("id", req.params.id)
    .single();
  if (!existing) return res.status(404).json({ error: "Venue not found" });
  if (existing.owner_spotify_id !== req.userId) {
    return res.status(403).json({ error: "Not your venue" });
  }

  const { name, settings } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (settings) updates.settings = settings;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const { data: venue, error } = await supabase
    .from("venues")
    .update(updates)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error || !venue) {
    return res.status(500).json({ error: "Update failed" });
  }

  res.json({
    id: venue.id,
    name: venue.name,
    slug: venue.slug,
    lobbyCode: venue.lobby_code,
    settings: venue.settings,
  });
});

// Delete venue
app.delete("/api/venues/:id", requireSpotifyAuth, async (req, res) => {
  const { data: venue } = await supabase
    .from("venues")
    .select("lobby_code, owner_spotify_id")
    .eq("id", req.params.id)
    .single();
  if (!venue) return res.status(404).json({ error: "Venue not found" });
  if (venue.owner_spotify_id !== req.userId) {
    return res.status(403).json({ error: "Not your venue" });
  }

  const { error } = await supabase
    .from("venues")
    .delete()
    .eq("id", req.params.id);

  if (error) {
    return res.status(500).json({ error: "Failed to delete venue" });
  }

  // Clean up the venue's lobby code from cache
  if (venue?.lobby_code) {
    lobbyVenueMap.delete(venue.lobby_code);
  }

  res.json({ success: true });
});

// Start venue lobby — creates a lobby and marks venue active
app.post("/api/venues/:id/start", requireSpotifyAuth, async (req, res) => {
  const { data: venue } = await supabase
    .from("venues")
    .select("owner_spotify_id, lobby_code, settings, name")
    .eq("id", req.params.id)
    .single();
  if (!venue) return res.status(404).json({ error: "Venue not found" });
  if (venue.owner_spotify_id !== req.userId) {
    return res.status(403).json({ error: "Not your venue" });
  }

  let lobbyCode = venue.lobby_code;

  // Create a lobby if one doesn't exist
  if (!lobbyCode) {
    lobbyCode = generateCode();
    const { error: lobbyError } = await supabase
      .from("lobbies")
      .insert({ code: lobbyCode, now_playing: null });
    if (lobbyError) {
      return res.status(500).json({ error: "Failed to create lobby" });
    }
  }

  lobbyUsers.set(lobbyCode, []);
  playedSongs.set(lobbyCode, new Map());

  const newSettings = { ...(venue.settings || {}), active: true };
  await supabase
    .from("venues")
    .update({ lobby_code: lobbyCode, settings: newSettings })
    .eq("id", req.params.id);

  lobbyVenueMap.set(lobbyCode, req.params.id);

  res.json({ lobbyCode, active: true });
});

// Stop venue lobby — deactivates and kicks everyone
app.post("/api/venues/:id/stop", requireSpotifyAuth, async (req, res) => {
  const { data: venue } = await supabase
    .from("venues")
    .select("owner_spotify_id, lobby_code, settings")
    .eq("id", req.params.id)
    .single();
  if (!venue) return res.status(404).json({ error: "Venue not found" });
  if (venue.owner_spotify_id !== req.userId) {
    return res.status(403).json({ error: "Not your venue" });
  }

  // Notify all clients in the lobby
  if (venue.lobby_code) {
    io.to(venue.lobby_code).emit("lobby-closed");
    // Clean up in-memory state
    lobbyUsers.delete(venue.lobby_code);
    lobbyHosts.delete(venue.lobby_code);
    playedSongs.delete(venue.lobby_code);
    for (const key of userVotes.keys()) {
      if (key.startsWith(venue.lobby_code + ":")) userVotes.delete(key);
    }
    lobbyVenueMap.delete(venue.lobby_code);
    // Clean up DB
    await supabase.from("queue").delete().eq("lobby_code", venue.lobby_code);
    await supabase.from("lobbies").delete().eq("code", venue.lobby_code);
  }

  const newSettings = { ...(venue.settings || {}), active: false };
  await supabase
    .from("venues")
    .update({ lobby_code: null, settings: newSettings })
    .eq("id", req.params.id);

  res.json({ active: false });
});

// --- Analytics query endpoints (B2B) ---

async function requireVenueOwner(req, res, next) {
  const { data: venue } = await supabase
    .from("venues")
    .select("owner_spotify_id")
    .eq("id", req.params.id)
    .single();
  if (!venue) return res.status(404).json({ error: "Venue not found" });
  if (venue.owner_spotify_id !== req.userId) {
    return res.status(403).json({ error: "Not your venue" });
  }
  next();
}

// Overview: combined stats
app.get("/api/venues/:id/analytics/overview", requireSpotifyAuth, requireVenueOwner, async (req, res) => {
  const venueId = req.params.id;
  const since = req.query.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events, error } = await supabase
      .from("analytics_events")
      .select("event_type, payload, created_at")
      .eq("venue_id", venueId)
      .gte("created_at", since);

    if (error) throw error;

    const songsPlayed = events.filter((e) => e.event_type === "song_played").length;
    const songsAdded = events.filter((e) => e.event_type === "song_added").length;
    const userJoins = events.filter((e) => e.event_type === "user_joined").length;
    const votes = events.filter((e) => e.event_type === "vote_cast").length;
    const skips = events.filter((e) => e.event_type === "song_skipped").length;
    const uniqueUsers = new Set(
      events
        .filter((e) => e.event_type === "user_joined" && e.payload?.userName)
        .map((e) => e.payload.userName)
    ).size;

    res.json({
      since,
      songsPlayed,
      songsAdded,
      totalJoins: userJoins,
      uniqueUsers,
      totalVotes: votes,
      totalSkips: skips,
    });
  } catch (err) {
    console.error("Analytics overview error:", err);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// Peak hours: activity by hour of day
app.get("/api/venues/:id/analytics/peak-hours", requireSpotifyAuth, requireVenueOwner, async (req, res) => {
  const venueId = req.params.id;
  const since = req.query.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events, error } = await supabase
      .from("analytics_events")
      .select("created_at")
      .eq("venue_id", venueId)
      .gte("created_at", since);

    if (error) throw error;

    const hours = new Array(24).fill(0);
    for (const e of events) {
      const hour = new Date(e.created_at).getUTCHours();
      hours[hour]++;
    }

    res.json({
      since,
      hours: hours.map((count, hour) => ({ hour, count })),
    });
  } catch (err) {
    console.error("Analytics peak-hours error:", err);
    res.status(500).json({ error: "Failed to fetch peak hours" });
  }
});

// Participation: user join/leave patterns
app.get("/api/venues/:id/analytics/participation", requireSpotifyAuth, requireVenueOwner, async (req, res) => {
  const venueId = req.params.id;
  const since = req.query.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events, error } = await supabase
      .from("analytics_events")
      .select("event_type, payload, created_at")
      .eq("venue_id", venueId)
      .in("event_type", ["user_joined", "user_left"])
      .gte("created_at", since);

    if (error) throw error;

    // Group by day
    const daily = {};
    for (const e of events) {
      const day = e.created_at.split("T")[0];
      if (!daily[day]) daily[day] = { joins: 0, leaves: 0, uniqueUsers: new Set() };
      if (e.event_type === "user_joined") {
        daily[day].joins++;
        if (e.payload?.userName) daily[day].uniqueUsers.add(e.payload.userName);
      } else {
        daily[day].leaves++;
      }
    }

    const days = Object.entries(daily)
      .map(([date, d]) => ({ date, joins: d.joins, leaves: d.leaves, uniqueUsers: d.uniqueUsers.size }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ since, days });
  } catch (err) {
    console.error("Analytics participation error:", err);
    res.status(500).json({ error: "Failed to fetch participation" });
  }
});

// Genre trends: genre breakdown from played songs
app.get("/api/venues/:id/analytics/genre-trends", requireSpotifyAuth, requireVenueOwner, async (req, res) => {
  const venueId = req.params.id;
  const since = req.query.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events, error } = await supabase
      .from("analytics_events")
      .select("payload")
      .eq("venue_id", venueId)
      .eq("event_type", "song_played")
      .gte("created_at", since);

    if (error) throw error;

    const genres = {};
    for (const e of events) {
      const genre = e.payload?.genre || "unknown";
      genres[genre] = (genres[genre] || 0) + 1;
    }

    const sorted = Object.entries(genres)
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ since, genres: sorted });
  } catch (err) {
    console.error("Analytics genre-trends error:", err);
    res.status(500).json({ error: "Failed to fetch genre trends" });
  }
});

// Songs played count
app.get("/api/venues/:id/analytics/songs-played", requireSpotifyAuth, requireVenueOwner, async (req, res) => {
  const venueId = req.params.id;
  const since = req.query.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events, error } = await supabase
      .from("analytics_events")
      .select("payload, created_at")
      .eq("venue_id", venueId)
      .eq("event_type", "song_played")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const songs = events.map((e) => ({
      title: e.payload?.title || "Unknown",
      artist: e.payload?.artist || "Unknown",
      spotifyId: e.payload?.spotifyId || null,
      playedAt: e.created_at,
    }));

    res.json({ since, total: songs.length, songs });
  } catch (err) {
    console.error("Analytics songs-played error:", err);
    res.status(500).json({ error: "Failed to fetch songs played" });
  }
});

// Top songs: most queued/played songs
app.get("/api/venues/:id/analytics/top-songs", requireSpotifyAuth, requireVenueOwner, async (req, res) => {
  const venueId = req.params.id;
  const since = req.query.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events, error } = await supabase
      .from("analytics_events")
      .select("payload")
      .eq("venue_id", venueId)
      .in("event_type", ["song_played", "song_added"])
      .gte("created_at", since);

    if (error) throw error;

    const songCounts = {};
    for (const e of events) {
      const key = e.payload?.spotifyId;
      if (!key) continue;
      if (!songCounts[key]) {
        songCounts[key] = {
          spotifyId: key,
          title: e.payload.title || "Unknown",
          artist: e.payload.artist || "Unknown",
          count: 0,
        };
      }
      songCounts[key].count++;
    }

    const sorted = Object.values(songCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    res.json({ since, songs: sorted });
  } catch (err) {
    console.error("Analytics top-songs error:", err);
    res.status(500).json({ error: "Failed to fetch top songs" });
  }
});

// Session duration: avg/median session length from join/leave pairs
app.get("/api/venues/:id/analytics/session-duration", requireSpotifyAuth, requireVenueOwner, async (req, res) => {
  const venueId = req.params.id;
  const since = req.query.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events } = await supabase
      .from("analytics_events")
      .select("event_type, payload, created_at")
      .eq("venue_id", venueId)
      .in("event_type", ["user_joined", "user_left"])
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    const sessions = {};
    for (const e of events || []) {
      const name = e.payload?.userName;
      if (!name) continue;
      if (e.event_type === "user_joined") {
        if (!sessions[name]) sessions[name] = [];
        sessions[name].push({ joined: new Date(e.created_at), left: null });
      } else if (e.event_type === "user_left" && sessions[name]?.length) {
        const last = sessions[name][sessions[name].length - 1];
        if (!last.left) last.left = new Date(e.created_at);
      }
    }

    const durations = [];
    for (const userSessions of Object.values(sessions)) {
      for (const s of userSessions) {
        if (s.joined && s.left) {
          durations.push((s.left - s.joined) / 60000);
        }
      }
    }

    durations.sort((a, b) => a - b);
    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const median = durations.length ? durations[Math.floor(durations.length / 2)] : 0;
    const buckets = { under5: 0, "5to15": 0, "15to30": 0, "30plus": 0 };
    for (const d of durations) {
      if (d < 5) buckets.under5++;
      else if (d < 15) buckets["5to15"]++;
      else if (d < 30) buckets["15to30"]++;
      else buckets["30plus"]++;
    }

    res.json({ since, totalSessions: durations.length, avgMinutes: Math.round(avg), medianMinutes: Math.round(median), buckets });
  } catch (err) {
    console.error("Analytics session-duration error:", err);
    res.status(500).json({ error: "Failed to fetch session duration" });
  }
});

// Retention: returning vs new users by day
app.get("/api/venues/:id/analytics/retention", requireSpotifyAuth, requireVenueOwner, async (req, res) => {
  const venueId = req.params.id;
  const since = req.query.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events } = await supabase
      .from("analytics_events")
      .select("payload, created_at")
      .eq("venue_id", venueId)
      .eq("event_type", "user_joined")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    const firstSeen = {};
    const dayData = {};

    for (const e of events || []) {
      const name = e.payload?.userName;
      if (!name) continue;
      const day = e.created_at.slice(0, 10);
      if (!firstSeen[name]) firstSeen[name] = day;
      if (!dayData[day]) dayData[day] = { newUsers: 0, returning: 0 };
      if (firstSeen[name] === day) dayData[day].newUsers++;
      else dayData[day].returning++;
    }

    const days = Object.entries(dayData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d, total: d.newUsers + d.returning }));

    const totalUnique = Object.keys(firstSeen).length;
    const returners = Object.values(firstSeen).filter((d, _, arr) => {
      const name = Object.keys(firstSeen).find((k) => firstSeen[k] === d);
      return (events || []).filter((e) => e.payload?.userName === name).length > 1;
    }).length;

    res.json({ since, totalUnique, returningUsers: returners, retentionRate: totalUnique ? Math.round((returners / totalUnique) * 100) : 0, days });
  } catch (err) {
    console.error("Analytics retention error:", err);
    res.status(500).json({ error: "Failed to fetch retention" });
  }
});

// Engagement: vote rate, add rate, avg interactions per user
app.get("/api/venues/:id/analytics/engagement", requireSpotifyAuth, requireVenueOwner, async (req, res) => {
  const venueId = req.params.id;
  const since = req.query.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events } = await supabase
      .from("analytics_events")
      .select("event_type, payload")
      .eq("venue_id", venueId)
      .in("event_type", ["user_joined", "vote_cast", "song_added"])
      .gte("created_at", since);

    const users = new Set();
    const voters = new Set();
    const adders = new Set();
    let totalVotes = 0;
    let totalAdds = 0;

    for (const e of events || []) {
      const name = e.payload?.userName || e.payload?.addedBy || e.payload?.voter;
      if (e.event_type === "user_joined" && name) users.add(name);
      if (e.event_type === "vote_cast") { voters.add(name); totalVotes++; }
      if (e.event_type === "song_added") { adders.add(name); totalAdds++; }
    }

    const total = users.size || 1;
    res.json({
      since,
      totalUsers: users.size,
      voteRate: Math.round((voters.size / total) * 100),
      addRate: Math.round((adders.size / total) * 100),
      avgVotesPerUser: Math.round((totalVotes / total) * 10) / 10,
      avgAddsPerUser: Math.round((totalAdds / total) * 10) / 10,
      totalVotes,
      totalAdds,
    });
  } catch (err) {
    console.error("Analytics engagement error:", err);
    res.status(500).json({ error: "Failed to fetch engagement" });
  }
});

// Crowd timeline: lobby size over time in 15-min buckets
app.get("/api/venues/:id/analytics/crowd-timeline", requireSpotifyAuth, requireVenueOwner, async (req, res) => {
  const venueId = req.params.id;
  const since = req.query.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events } = await supabase
      .from("analytics_events")
      .select("event_type, payload, created_at")
      .eq("venue_id", venueId)
      .in("event_type", ["user_joined", "user_left"])
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    const buckets = {};
    for (const e of events || []) {
      const d = new Date(e.created_at);
      const key = `${d.toISOString().slice(0, 10)} ${String(d.getUTCHours()).padStart(2, "0")}:${d.getUTCMinutes() < 15 ? "00" : d.getUTCMinutes() < 30 ? "15" : d.getUTCMinutes() < 45 ? "30" : "45"}`;
      if (!buckets[key]) buckets[key] = { time: key, joins: 0, leaves: 0, userCount: 0 };
      if (e.event_type === "user_joined") buckets[key].joins++;
      else buckets[key].leaves++;
      if (e.payload?.userCount != null) buckets[key].userCount = Math.max(buckets[key].userCount, e.payload.userCount);
    }

    const timeline = Object.values(buckets).sort((a, b) => a.time.localeCompare(b.time));
    res.json({ since, timeline });
  } catch (err) {
    console.error("Analytics crowd-timeline error:", err);
    res.status(500).json({ error: "Failed to fetch crowd timeline" });
  }
});

// Queue health: avg queue depth, dry-queue incidents
app.get("/api/venues/:id/analytics/queue-health", requireSpotifyAuth, requireVenueOwner, async (req, res) => {
  const venueId = req.params.id;
  const since = req.query.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events } = await supabase
      .from("analytics_events")
      .select("event_type, payload, created_at")
      .eq("venue_id", venueId)
      .in("event_type", ["song_added", "song_played", "song_skipped"])
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    let adds = 0, plays = 0, skips = 0;
    const addTimes = [];
    for (const e of events || []) {
      if (e.event_type === "song_added") { adds++; addTimes.push(new Date(e.created_at)); }
      if (e.event_type === "song_played") plays++;
      if (e.event_type === "song_skipped") skips++;
    }

    let avgTimeBetweenAdds = 0;
    if (addTimes.length > 1) {
      let totalGap = 0;
      for (let i = 1; i < addTimes.length; i++) {
        totalGap += (addTimes[i] - addTimes[i - 1]) / 60000;
      }
      avgTimeBetweenAdds = Math.round(totalGap / (addTimes.length - 1));
    }

    res.json({
      since,
      totalAdds: adds,
      totalPlays: plays,
      totalSkips: skips,
      skipRate: plays ? Math.round((skips / plays) * 100) : 0,
      avgMinutesBetweenAdds: avgTimeBetweenAdds,
    });
  } catch (err) {
    console.error("Analytics queue-health error:", err);
    res.status(500).json({ error: "Failed to fetch queue health" });
  }
});

// CSV export of all analytics
app.get("/api/venues/:id/analytics/export", requireSpotifyAuth, requireVenueOwner, async (req, res) => {
  const venueId = req.params.id;
  const since = req.query.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: events } = await supabase
      .from("analytics_events")
      .select("event_type, payload, created_at")
      .eq("venue_id", venueId)
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    const { data: venue } = await supabase
      .from("venues")
      .select("name, slug")
      .eq("id", venueId)
      .single();

    let csv = `PartyTime Analytics Export — ${venue?.name || "Venue"}\n`;
    csv += `Period: ${since} to ${new Date().toISOString()}\n\n`;
    csv += `Timestamp,Event Type,User,Song Title,Song Artist,Details\n`;

    for (const e of events || []) {
      const p = e.payload || {};
      const user = p.userName || p.addedBy || p.voter || p.removedBy || "";
      const title = (p.title || "").replace(/,/g, ";");
      const artist = (p.artist || "").replace(/,/g, ";");
      const details = (p.direction || p.spotifyId || "").replace(/,/g, ";");
      csv += `${e.created_at},${e.event_type},${user},${title},${artist},${details}\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${venue?.slug || "venue"}-analytics.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("Analytics export error:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

// --- Helper: load lobby from Supabase ---
async function getLobby(code) {
  const { data, error } = await supabase
    .from("lobbies")
    .select("*")
    .eq("code", code)
    .single();

  if (error || !data) return null;

  const { data: songs } = await supabase
    .from("queue")
    .select("*")
    .eq("lobby_code", code)
    .order("votes", { ascending: false });

  // Check if this lobby belongs to a venue
  const venueId = await getVenueIdForLobby(code);
  let venueName = null;
  if (venueId) {
    const { data: venue } = await supabase
      .from("venues")
      .select("name, slug")
      .eq("id", venueId)
      .single();
    if (venue) venueName = venue.name;
  }

  return {
    code: data.code,
    nowPlaying: data.now_playing,
    venueName,
    queue: (songs || []).map((s) => ({
      id: s.id,
      spotifyId: s.spotify_id,
      title: s.title,
      artist: s.artist,
      album: s.album,
      albumArt: s.album_art,
      previewUrl: s.preview_url,
      duration: s.duration,
      votes: s.votes,
      addedBy: s.added_by,
    })),
    users: lobbyUsers.get(code) || [],
  };
}

// --- Socket.io events ---
io.on("connection", (socket) => {
  let currentLobby = null;
  let userName = null;

  socket.on("join-lobby", async ({ code, name }) => {
    const lobby = await getLobby(code);
    if (!lobby) {
      socket.emit("error", "Lobby not found");
      return;
    }

    // Check if this is a venue lobby that's inactive
    const venueId = await getVenueIdForLobby(code);
    if (venueId) {
      const { data: venue } = await supabase
        .from("venues")
        .select("settings")
        .eq("id", venueId)
        .single();
      if (venue && venue.settings?.active === false) {
        socket.emit("error", "This venue's lobby isn't active right now");
        return;
      }
    }
    socket.join(code);
    currentLobby = code;
    userName = name;

    if (!lobbyUsers.has(code)) lobbyUsers.set(code, []);
    const users = lobbyUsers.get(code);
    if (!users.some((u) => u.id === socket.id)) {
      users.push({ id: socket.id, name });
    }

    if (!playedSongs.has(code)) playedSongs.set(code, new Map());

    // First user to join claims host. Host is tracked by userName and persists
    // across disconnects — reconnecting with the same name reclaims host.
    if (!lobbyHosts.has(code)) {
      lobbyHosts.set(code, name);
    }
    const hostName = lobbyHosts.get(code);
    const usersWithHost = users.map((u) => ({ ...u, isHost: u.name === hostName }));

    lobby.users = usersWithHost;
    lobby.hostName = hostName;
    socket.emit("lobby-state", lobby);
    io.to(code).emit("users-updated", usersWithHost);

    // Analytics: user joined
    const venueId = await getVenueIdForLobby(code);
    trackEvent(venueId, code, "user_joined", { userName: name, userCount: users.length });
  });

  socket.on("add-song", async ({ code, song }) => {
    if (!song.spotifyId) return;

    // Check if on cooldown (30 minutes since last play)
    const played = playedSongs.get(code);
    if (played && played.has(song.spotifyId)) {
      const playedAt = played.get(song.spotifyId);
      const remaining = PLAYED_COOLDOWN_MS - (Date.now() - playedAt);
      if (remaining > 0) {
        const mins = Math.ceil(remaining / 60000);
        socket.emit("add-error", `"${song.title || "This song"}" was recently played — available again in ${mins} min`);
        return;
      } else {
        played.delete(song.spotifyId);
      }
    }

    // Check if already in queue — upvote instead
    const lobby = await getLobby(code);
    if (!lobby) return;

    const existing = lobby.queue.find((s) => s.spotifyId === song.spotifyId);
    if (existing) {
      // Treat as upvote
      const voteKey = `${code}:${existing.id}`;
      if (!userVotes.has(voteKey)) userVotes.set(voteKey, new Map());
      const songVotes = userVotes.get(voteKey);

      if (songVotes.get(socket.id) !== "up") {
        const prev = songVotes.get(socket.id);
        const delta = prev ? 2 : 1;
        await supabase.rpc("increment_votes", { song_id: existing.id, delta });
        songVotes.set(socket.id, "up");
      }

      const updated = await getLobby(code);
      if (updated) io.to(code).emit("queue-updated", updated.queue);
      socket.emit("add-duplicate", { title: existing.title, songId: existing.id });
      return;
    }

    // Also check if currently playing
    if (lobby.nowPlaying?.spotifyId === song.spotifyId) {
      socket.emit("add-error", "This song is currently playing");
      return;
    }

    const id = crypto.randomUUID();
    const { error } = await supabase.from("queue").insert({
      id,
      lobby_code: code,
      spotify_id: song.spotifyId,
      title: song.title,
      artist: song.artist,
      album: song.album || null,
      album_art: song.albumArt || null,
      preview_url: song.previewUrl || null,
      duration: song.duration || null,
      votes: 0,
      added_by: userName,
    });

    if (error) {
      console.error("Add song error:", error);
      return;
    }

    // Analytics: song added
    const venueId = await getVenueIdForLobby(code);
    trackEvent(venueId, code, "song_added", {
      spotifyId: song.spotifyId,
      title: song.title,
      artist: song.artist,
      addedBy: userName,
    });

    const refreshed = await getLobby(code);
    if (!refreshed) return;

    // Auto-play if nothing is playing and this is the first song
    if (!refreshed.nowPlaying && refreshed.queue.length === 1) {
      const firstSong = refreshed.queue[0];
      await supabase.from("queue").delete().eq("id", firstSong.id);
      await supabase
        .from("lobbies")
        .update({ now_playing: firstSong })
        .eq("code", code);

      if (played) played.set(firstSong.spotifyId, Date.now());

      // Analytics: song started playing
      trackEvent(venueId, code, "song_played", {
        spotifyId: firstSong.spotifyId,
        title: firstSong.title,
        artist: firstSong.artist,
      });

      const updated = await getLobby(code);
      io.to(code).emit("now-playing", firstSong);
      io.to(code).emit("queue-updated", updated?.queue || []);
    } else {
      io.to(code).emit("queue-updated", refreshed.queue);
    }
  });

  socket.on("vote", async ({ code, songId, direction }) => {
    const voteKey = `${code}:${songId}`;
    if (!userVotes.has(voteKey)) userVotes.set(voteKey, new Map());
    const songVotes = userVotes.get(voteKey);

    const prevDirection = songVotes.get(socket.id);

    if (prevDirection === direction) {
      socket.emit("vote-error", "Already voted");
      return;
    }

    let delta;
    if (prevDirection) {
      delta = direction === "up" ? 2 : -2;
    } else {
      delta = direction === "up" ? 1 : -1;
    }

    const { error } = await supabase.rpc("increment_votes", {
      song_id: songId,
      delta,
    });

    if (error) {
      console.error("Vote error:", error);
      return;
    }

    songVotes.set(socket.id, direction);

    // Analytics: vote cast
    const venueId = await getVenueIdForLobby(code);
    trackEvent(venueId, code, "vote_cast", { songId, direction });

    // Check for auto-remove: if downvotes >= 80% of lobby users, remove song
    const users = lobbyUsers.get(code) || [];
    const threshold = Math.ceil(users.length * 0.8);
    let downvoteCount = 0;
    for (const dir of songVotes.values()) {
      if (dir === "down") downvoteCount++;
    }

    if (downvoteCount >= threshold && users.length >= 2) {
      await supabase.from("queue").delete().eq("id", songId);
      userVotes.delete(voteKey);
      const lobby = await getLobby(code);
      if (lobby) {
        io.to(code).emit("queue-updated", lobby.queue);
        io.to(code).emit("song-removed-by-votes", songId);
      }
      return;
    }

    const lobby = await getLobby(code);
    if (lobby) io.to(code).emit("queue-updated", lobby.queue);
  });

  socket.on("remove-song", async ({ code, songId }) => {
    if (lobbyHosts.get(code) !== userName) {
      socket.emit("permission-error", "Only the host can remove songs");
      return;
    }
    await supabase.from("queue").delete().eq("id", songId);
    userVotes.delete(`${code}:${songId}`);

    const venueId = await getVenueIdForLobby(code);
    trackEvent(venueId, code, "song_removed", { songId, removedBy: userName });

    const lobby = await getLobby(code);
    if (lobby) io.to(code).emit("queue-updated", lobby.queue);
  });

  socket.on("skip", async (code) => {
    // Host-only: verify this socket's userName matches the lobby's host
    if (lobbyHosts.get(code) !== userName) {
      socket.emit("permission-error", "Only the host can skip songs");
      return;
    }

    const lobby = await getLobby(code);
    if (!lobby) return;

    // Analytics: song skipped (the currently playing song)
    const venueId = await getVenueIdForLobby(code);
    if (lobby.nowPlaying) {
      trackEvent(venueId, code, "song_skipped", {
        spotifyId: lobby.nowPlaying.spotifyId,
        title: lobby.nowPlaying.title,
        artist: lobby.nowPlaying.artist,
      });
    }

    let nowPlaying = null;
    if (lobby.queue.length > 0) {
      nowPlaying = lobby.queue[0];
      await supabase.from("queue").delete().eq("id", nowPlaying.id);
      userVotes.delete(`${code}:${nowPlaying.id}`);
    }

    // Track played song
    if (nowPlaying?.spotifyId) {
      const played = playedSongs.get(code);
      if (played) played.set(nowPlaying.spotifyId, Date.now());

      // Analytics: next song started playing
      trackEvent(venueId, code, "song_played", {
        spotifyId: nowPlaying.spotifyId,
        title: nowPlaying.title,
        artist: nowPlaying.artist,
      });
    }

    await supabase
      .from("lobbies")
      .update({ now_playing: nowPlaying })
      .eq("code", code);

    const updated = await getLobby(code);
    io.to(code).emit("now-playing", nowPlaying);
    io.to(code).emit("queue-updated", updated?.queue || []);
  });

  // Rejoin: re-send full lobby state (for app returning from background / socket reconnect)
  socket.on("rejoin", async (code) => {
    if (!code) return;
    socket.join(code);
    currentLobby = code;

    if (userName) {
      const users = lobbyUsers.get(code);
      if (users && !users.some((u) => u.id === socket.id)) {
        users.push({ id: socket.id, name: userName });
        const hostName = lobbyHosts.get(code);
        const usersWithHost = users.map((u) => ({ ...u, isHost: u.name === hostName }));
        io.to(code).emit("users-updated", usersWithHost);
      }
    }

    const lobby = await getLobby(code);
    if (lobby) socket.emit("lobby-state", lobby);
  });

  socket.on("disconnect", async () => {
    if (currentLobby) {
      const users = lobbyUsers.get(currentLobby);
      let filtered = [];
      if (users) {
        filtered = users.filter((u) => u.id !== socket.id);
        lobbyUsers.set(currentLobby, filtered);
      }

      // Host role persists — not auto-transferred. Reconnecting with the same
      // name reclaims host. If host never comes back, lobby has no active host
      // until cleanup or explicit handoff.
      const hostName = lobbyHosts.get(currentLobby);
      const usersWithHost = filtered.map((u) => ({ ...u, isHost: u.name === hostName }));
      io.to(currentLobby).emit("users-updated", usersWithHost);

      // Analytics: user left
      const venueId = await getVenueIdForLobby(currentLobby);
      trackEvent(venueId, currentLobby, "user_left", {
        userName,
        userCount: filtered.length,
      });
    }
  });
});

// --- Lobby cleanup: delete ephemeral lobbies older than 24 hours (skip venue lobbies) ---
async function cleanupLobbies() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Get venue lobby codes to exclude from cleanup
  const { data: venues } = await supabase.from("venues").select("lobby_code");
  const venueCodes = new Set((venues || []).map((v) => v.lobby_code).filter(Boolean));

  const { data: old } = await supabase
    .from("lobbies")
    .select("code")
    .lt("created_at", cutoff);

  if (old && old.length > 0) {
    // Filter out venue lobbies — those are permanent
    const codes = old.map((l) => l.code).filter((c) => !venueCodes.has(c));
    if (codes.length === 0) return;

    await supabase.from("queue").delete().in("lobby_code", codes);
    await supabase.from("lobbies").delete().in("code", codes);
    codes.forEach((c) => {
      lobbyUsers.delete(c);
      lobbyHosts.delete(c);
      playedSongs.delete(c);
      for (const key of userVotes.keys()) {
        if (key.startsWith(c + ":")) userVotes.delete(key);
      }
    });
    console.log(`Cleaned up ${codes.length} expired lobbies`);
  }
}

setInterval(cleanupLobbies, 60 * 60 * 1000);
cleanupLobbies();

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
