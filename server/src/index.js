import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
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

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Spotify token management
let spotifyToken = null;
let spotifyTokenExpiry = 0;

async function getSpotifyToken() {
  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;

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
  spotifyToken = data.access_token;
  spotifyTokenExpiry = Date.now() + data.expires_in * 1000 - 60000;
  return spotifyToken;
}

// In-memory state
const lobbyUsers = new Map(); // code -> [{ id, name }]
const userVotes = new Map(); // "code:songId" -> Map(socketId -> "up"|"down")
const playedSongs = new Map(); // code -> Set of spotifyIds (tracks already played)

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
].join(" ");

// --- REST routes ---

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Spotify OAuth: redirect to Spotify login
app.get("/api/auth/login", (_req, res) => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
  });
  res.redirect("https://accounts.spotify.com/authorize?" + params);
});

// Spotify OAuth: exchange code for tokens
app.post("/api/auth/callback", async (req, res) => {
  const { code, redirectUri } = req.body;
  if (!code) return res.status(400).json({ error: "Missing code" });

  // Use provided redirectUri (mobile) or fall back to env (web)
  const callbackUri = redirectUri || process.env.SPOTIFY_REDIRECT_URI;

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
      return res.status(400).json({ error: tokens.error_description });
    }

    const profileRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

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
app.post("/api/auth/refresh", async (req, res) => {
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
app.get("/api/spotify/search", async (req, res) => {
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
  playedSongs.set(code, new Set());
  res.json({ code });
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

  return {
    code: data.code,
    nowPlaying: data.now_playing,
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
    socket.join(code);
    currentLobby = code;
    userName = name;

    if (!lobbyUsers.has(code)) lobbyUsers.set(code, []);
    const users = lobbyUsers.get(code);
    if (!users.some((u) => u.id === socket.id)) {
      users.push({ id: socket.id, name });
    }

    if (!playedSongs.has(code)) playedSongs.set(code, new Set());

    lobby.users = users;
    socket.emit("lobby-state", lobby);
    io.to(code).emit("users-updated", users);
  });

  socket.on("add-song", async ({ code, song }) => {
    if (!song.spotifyId) return;

    // Check if already played in this lobby
    const played = playedSongs.get(code);
    if (played && played.has(song.spotifyId)) {
      socket.emit("add-error", `"${song.title || "This song"}" was already played — available again next session`);
      return;
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
      socket.emit("add-duplicate", existing.title);
      return;
    }

    // Also check if currently playing
    if (lobby.nowPlaying?.spotifyId === song.spotifyId) {
      socket.emit("add-error", "This song is currently playing — sit tight");
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

      if (played) played.add(firstSong.spotifyId);

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
    await supabase.from("queue").delete().eq("id", songId);
    userVotes.delete(`${code}:${songId}`);
    const lobby = await getLobby(code);
    if (lobby) io.to(code).emit("queue-updated", lobby.queue);
  });

  socket.on("skip", async (code) => {
    const lobby = await getLobby(code);
    if (!lobby) return;

    let nowPlaying = null;
    if (lobby.queue.length > 0) {
      nowPlaying = lobby.queue[0];
      await supabase.from("queue").delete().eq("id", nowPlaying.id);
      userVotes.delete(`${code}:${nowPlaying.id}`);
    }

    // Track played song
    if (nowPlaying?.spotifyId) {
      const played = playedSongs.get(code);
      if (played) played.add(nowPlaying.spotifyId);
    }

    await supabase
      .from("lobbies")
      .update({ now_playing: nowPlaying })
      .eq("code", code);

    const updated = await getLobby(code);
    io.to(code).emit("now-playing", nowPlaying);
    io.to(code).emit("queue-updated", updated?.queue || []);
  });

  socket.on("disconnect", () => {
    if (currentLobby) {
      const users = lobbyUsers.get(currentLobby);
      if (users) {
        const filtered = users.filter((u) => u.id !== socket.id);
        lobbyUsers.set(currentLobby, filtered);
        io.to(currentLobby).emit("users-updated", filtered);
      }
    }
  });
});

// --- Lobby cleanup: delete lobbies older than 24 hours ---
async function cleanupLobbies() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: old } = await supabase
    .from("lobbies")
    .select("code")
    .lt("created_at", cutoff);

  if (old && old.length > 0) {
    const codes = old.map((l) => l.code);
    await supabase.from("queue").delete().in("lobby_code", codes);
    await supabase.from("lobbies").delete().in("code", codes);
    codes.forEach((c) => {
      lobbyUsers.delete(c);
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
