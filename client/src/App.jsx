import { useState, useEffect } from "react";
import useSpotifyAuth from "./useSpotifyAuth";
import socket from "./socket";
import api from "./api";
import Lobby from "./Lobby";
import VenueDashboard from "./VenueDashboard";

const LOBBY_KEY = "pt_lobby";
const GUEST_KEY = "pt_guest";

function getSavedLobby() {
  try { return JSON.parse(sessionStorage.getItem(LOBBY_KEY)); } catch { return null; }
}

function getSavedGuest() {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY)); } catch { return null; }
}

export default function App() {
  const { user: spotifyUser, loading, login, logout, getToken, isLoggedIn } = useSpotifyAuth();
  const [guestName, setGuestName] = useState("");
  const [lobbyCode, setLobbyCode] = useState("");
  const [activeLobby, setActiveLobby] = useState(null);
  const [initialState, setInitialState] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [user, setUser] = useState(null); // { name, image?, premium?, isGuest }
  const [error, setError] = useState("");
  const [mode, setMode] = useState(null); // null | "host" | "guest"
  const [venue, setVenue] = useState(null); // { name, slug, lobbyCode } if URL is /:slug
  const [venueLoading, setVenueLoading] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  // Detect venue slug in URL (e.g. /mollys-pub or /mollys-pub/analytics) and resolve it
  useEffect(() => {
    const path = window.location.pathname.slice(1);
    const [slug, section] = path.split("/");
    if (slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setVenueLoading(true);
      api(`/api/venues/${slug}`)
        .then((res) => res.ok ? res.json() : Promise.reject(res.status))
        .then((data) => {
          setVenue(data);
          setLobbyCode(data.lobbyCode);
          if (section === "analytics") setShowDashboard(true);
        })
        .catch((status) => {
          if (status === 404) setError(`No venue at /${slug}`);
        })
        .finally(() => setVenueLoading(false));
    }
  }, []);

  // Restore session on load
  useEffect(() => {
    if (loading) return;

    const saved = getSavedLobby();
    if (saved) {
      // Restore user context
      if (saved.isHost && isLoggedIn && spotifyUser) {
        setUser({ ...spotifyUser, isGuest: false });
        setMode("host");
        joinLobby(saved.code, true, spotifyUser.name);
      } else if (!saved.isHost) {
        const guest = getSavedGuest();
        if (guest) {
          setUser({ name: guest.name, isGuest: true });
          setMode("guest");
          joinLobby(saved.code, false, guest.name);
        }
      }
    } else if (isLoggedIn && spotifyUser) {
      // Logged in but no active lobby — show home as host
      setUser({ ...spotifyUser, isGuest: false });
      setMode("host");
    }
  }, [loading, isLoggedIn]);

  function joinLobby(code, host, name) {
    setError("");
    if (!socket.connected) socket.connect();
    socket.emit("join-lobby", { code, name });

    socket.once("error", (msg) => {
      setError(msg);
      socket.disconnect();
      sessionStorage.removeItem(LOBBY_KEY);
    });

    socket.once("lobby-state", (lobby) => {
      setInitialState(lobby);
      setIsHost(host);
      setActiveLobby(code);
      sessionStorage.setItem(LOBBY_KEY, JSON.stringify({ code, isHost: host }));
    });
  }

  async function createLobby() {
    setError("");
    try {
      const res = await api("/api/lobbies", { method: "POST" });
      const { code } = await res.json();
      joinLobby(code, true, user.name);
    } catch {
      setError("Failed to create lobby. Is the server running?");
    }
  }

  function handleJoinAsGuest() {
    const name = guestName.trim();
    const code = lobbyCode.trim().toUpperCase();
    if (!name || !code) return;
    const guest = { name, isGuest: true };
    setUser(guest);
    setMode("guest");
    localStorage.setItem(GUEST_KEY, JSON.stringify({ name }));
    joinLobby(code, false, name);
  }

  function handleHostJoin() {
    const code = lobbyCode.trim().toUpperCase();
    if (!code) return;
    joinLobby(code, false, user.name);
  }

  function handleLeave() {
    socket.disconnect();
    setActiveLobby(null);
    setInitialState(null);
    sessionStorage.removeItem(LOBBY_KEY);
  }

  function handleLogout() {
    logout();
    setUser(null);
    setMode(null);
    sessionStorage.removeItem(LOBBY_KEY);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Active lobby
  if (activeLobby && user) {
    return (
      <Lobby
        code={activeLobby}
        isHost={isHost}
        user={user}
        initialState={initialState}
        getToken={user.isGuest ? null : getToken}
        onLeave={handleLeave}
      />
    );
  }

  // Host home (logged in via Spotify)
  if (mode === "host" && user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg p-6">
        <div className="flex items-center gap-3 mb-16">
          {user.image && <img src={user.image} alt="" className="w-7 h-7 rounded-full" />}
          <span className="text-muted/60 text-[12px] font-mono">{user.name}</span>
          <button onClick={handleLogout} className="text-muted/30 hover:text-white text-[10px] font-mono tracking-wider transition">
            LOGOUT
          </button>
        </div>

        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight font-mono">PARTYTIME</h1>
        <p className="text-muted/40 text-[11px] font-mono tracking-wider mb-14">"CREATE OR JOIN"</p>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={createLobby} className="bg-accent hover:bg-accent-hover text-white font-semibold py-3.5 rounded-2xl transition text-sm">
            Create a Lobby
          </button>

          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-muted/30 text-[10px] font-mono tracking-wider">OR</span>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="LOBBY CODE"
              value={lobbyCode}
              onChange={(e) => setLobbyCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleHostJoin()}
              className="flex-1 bg-surface border border-border/50 rounded-2xl px-4 py-3.5 text-white placeholder-muted/30 focus:outline-none focus:border-accent/30 text-center font-mono tracking-[0.3em] text-sm"
            />
            <button onClick={handleHostJoin} className="bg-surface-light hover:bg-border text-white font-semibold py-3.5 px-6 rounded-2xl transition text-sm">
              Join
            </button>
          </div>

          {error && <p className="text-red-400/80 text-[11px] font-mono text-center mt-2 tracking-wide">{error}</p>}
        </div>
      </div>
    );
  }

  // Venue analytics dashboard — URL is partytime.app/mollys-pub/analytics
  if (venue && showDashboard) {
    return (
      <VenueDashboard
        venueId={venue.id}
        venueName={venue.name}
        onBack={() => {
          window.history.pushState({}, "", `/${venue.slug}`);
          setShowDashboard(false);
        }}
      />
    );
  }

  // Venue landing — URL is partytime.app/mollys-pub
  if (venueLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (venue) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg p-6">
        <p className="text-muted/40 text-[10px] font-mono tracking-wider mb-2 uppercase">Welcome to</p>
        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight font-mono">{venue.name}</h1>
        <p className="text-muted/40 text-[11px] font-mono tracking-wider mb-14">"POWERED BY PARTYTIME"</p>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <input
            type="text"
            placeholder="Your name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoinAsGuest()}
            className="bg-surface border border-border/50 rounded-2xl px-4 py-3.5 text-white placeholder-muted/30 focus:outline-none focus:border-accent/30 text-center text-sm"
          />
          <button
            onClick={handleJoinAsGuest}
            className="bg-accent hover:bg-accent-hover text-white font-semibold py-3.5 rounded-2xl transition text-sm"
          >
            Join {venue.name}
          </button>

          {error && <p className="text-red-400/80 text-[11px] font-mono text-center mt-2 tracking-wide">{error}</p>}
        </div>
      </div>
    );
  }

  // Landing page — choose host or guest
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg p-6">
      <h1 className="text-3xl font-bold text-white mb-1 tracking-tight font-mono">PARTYTIME</h1>
      <p className="text-muted/40 text-[11px] font-mono tracking-wider mb-14">"COLLABORATIVE PLAYLISTS, DEMOCRATIZED"</p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        {/* Host option */}
        <button
          onClick={login}
          className="flex items-center justify-center gap-3 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold py-3.5 rounded-2xl transition text-sm"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          Host with Spotify
        </button>

        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-border/50" />
          <span className="text-muted/30 text-[10px] font-mono tracking-wider">OR JOIN AS GUEST</span>
          <div className="flex-1 h-px bg-border/50" />
        </div>

        {/* Guest option */}
        <input
          type="text"
          placeholder="Your name"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          className="bg-surface border border-border/50 rounded-2xl px-4 py-3.5 text-white placeholder-muted/30 focus:outline-none focus:border-accent/30 text-center text-sm"
        />
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="LOBBY CODE"
            value={lobbyCode}
            onChange={(e) => setLobbyCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoinAsGuest()}
            className="flex-1 bg-surface border border-border/50 rounded-2xl px-4 py-3.5 text-white placeholder-muted/30 focus:outline-none focus:border-accent/30 text-center font-mono tracking-[0.3em] text-sm"
          />
          <button
            onClick={handleJoinAsGuest}
            className="bg-surface-light hover:bg-border text-white font-semibold py-3.5 px-6 rounded-2xl transition text-sm"
          >
            Join
          </button>
        </div>

        {error && <p className="text-red-400/80 text-[11px] font-mono text-center mt-2 tracking-wide">{error}</p>}
      </div>
    </div>
  );
}
