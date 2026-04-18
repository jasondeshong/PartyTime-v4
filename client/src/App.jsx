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
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(null);
  const [venue, setVenue] = useState(null);
  const [venueLoading, setVenueLoading] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

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
        .catch((status) => { if (status === 404) setError(`No venue at /${slug}`); })
        .finally(() => setVenueLoading(false));
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    const saved = getSavedLobby();
    if (saved) {
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
      setUser({ ...spotifyUser, isGuest: false });
      setMode("host");
    }
  }, [loading, isLoggedIn]);

  function joinLobby(code, host, name) {
    setError("");
    if (!socket.connected) socket.connect();
    socket.emit("join-lobby", { code, name, host });
    socket.once("error", (msg) => { setError(msg); socket.disconnect(); sessionStorage.removeItem(LOBBY_KEY); });
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
    } catch { setError("Failed to create lobby. Is the server running?"); }
  }

  function handleJoinAsGuest() {
    const name = guestName.trim();
    const code = lobbyCode.trim().toUpperCase();
    if (!name || !code) return;
    setUser({ name, isGuest: true });
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
    return <div className="flex items-center justify-center min-h-screen bg-[#080808]"><div className="w-4 h-4 border-2 border-[#D4884A] border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (activeLobby && user) {
    return <Lobby code={activeLobby} isHost={isHost} user={user} initialState={initialState} getToken={user.isGuest ? null : getToken} onLeave={handleLeave} />;
  }

  if (venue && showDashboard) {
    return <VenueDashboard venueId={venue.id} venueName={venue.name} getToken={getToken} onBack={() => { window.history.pushState({}, "", `/${venue.slug}`); setShowDashboard(false); }} />;
  }

  // Scan line CSS background
  const scanLineBg = `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(240,236,228,0.02) 3px, rgba(240,236,228,0.02) 4px)`;
  const gridBg = `repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(240,236,228,0.03) 23px, rgba(240,236,228,0.03) 24px), repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(240,236,228,0.03) 23px, rgba(240,236,228,0.03) 24px)`;

  // Host home
  if (mode === "host" && user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 relative overflow-hidden" style={{ backgroundColor: "#080808" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: gridBg }} />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: scanLineBg }} />

        <div className="flex items-center gap-3 mb-12 relative z-10">
          {user.image && <img src={user.image} alt="" className="w-7 h-7 rounded-full opacity-70" />}
          <span className="text-white/40 text-[12px] font-mono">{user.name}</span>
          <button onClick={handleLogout} className="text-white/20 hover:text-white text-[10px] font-mono tracking-wider transition">LOGOUT</button>
        </div>

        {/* Logo mark */}
        <div className="relative z-10 mb-4">
          <div className="w-16 h-16 rounded-full border-2 border-[#D4884A]/30 flex items-center justify-center" style={{ boxShadow: "0 0 40px rgba(212,136,74,0.15)" }}>
            <span className="text-[#D4884A] text-2xl font-bold font-mono">♫</span>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight font-mono relative z-10">PARTYTIME</h1>
        <p className="text-white/30 text-[11px] italic mb-14 relative z-10">everyone's digital jukebox</p>

        <div className="flex flex-col gap-3 w-full max-w-xs relative z-10">
          <button onClick={createLobby} className="py-3.5 rounded-2xl transition text-sm font-semibold text-[#080808] hover:opacity-90" style={{ backgroundColor: "#D4884A", boxShadow: "0 4px 20px rgba(212,136,74,0.25)" }}>
            Create a Lobby
          </button>

          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-white/20 text-[10px] font-mono tracking-wider">or join one</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="LOBBY CODE"
              value={lobbyCode}
              onChange={(e) => setLobbyCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleHostJoin()}
              className="flex-1 bg-[#121210] border border-white/8 rounded-2xl px-4 py-3.5 text-white placeholder-white/20 focus:outline-none focus:border-[#D4884A]/30 text-center font-mono tracking-[0.3em] text-sm"
            />
            <button onClick={handleHostJoin} className="bg-[#121210] border border-white/8 hover:border-white/20 text-white font-semibold py-3.5 px-6 rounded-2xl transition text-sm">
              Join
            </button>
          </div>

          {error && <p className="text-red-400/80 text-[11px] font-mono text-center mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  // Venue loading
  if (venueLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-[#080808]"><div className="w-4 h-4 border-2 border-[#D4884A] border-t-transparent rounded-full animate-spin" /></div>;
  }

  // Venue landing
  if (venue) {
    const venueAccent = venue.settings?.accentColor || "#D4884A";
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 relative overflow-hidden" style={{ backgroundColor: "#080808" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: gridBg }} />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: scanLineBg }} />

        {venue.settings?.logoUrl && (
          <img src={venue.settings.logoUrl} alt="" className="h-12 object-contain mb-6 opacity-70 relative z-10" />
        )}

        <p className="text-white/30 text-[10px] font-mono tracking-wider mb-2 uppercase relative z-10">Welcome to</p>
        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight font-mono relative z-10">{venue.name}</h1>
        <p className="text-white/30 text-[11px] italic mb-14 relative z-10">powered by PartyTime</p>

        <div className="flex flex-col gap-3 w-full max-w-xs relative z-10">
          <input type="text" placeholder="Your name" value={guestName} onChange={(e) => setGuestName(e.target.value)}
            className="bg-[#121210] border border-white/8 rounded-2xl px-4 py-3.5 text-white placeholder-white/20 focus:outline-none text-center text-sm" />
          <button onClick={handleJoinAsGuest} className="py-3.5 rounded-2xl transition text-sm font-semibold text-[#080808] hover:opacity-90"
            style={{ backgroundColor: venueAccent, boxShadow: `0 4px 20px ${venueAccent}40` }}>
            Join the Party
          </button>

          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-white/20 text-[10px] font-mono tracking-wider">or</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <button onClick={login} className="flex items-center justify-center gap-3 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold py-3.5 rounded-2xl transition text-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            Host with Spotify
          </button>

          {error && <p className="text-red-400/80 text-[11px] font-mono text-center mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  // Landing — choose host or guest
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 relative overflow-hidden" style={{ backgroundColor: "#080808" }}>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: gridBg }} />
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: scanLineBg }} />

      <div className="relative z-10 mb-4">
        <div className="w-16 h-16 rounded-full border-2 border-[#D4884A]/30 flex items-center justify-center" style={{ boxShadow: "0 0 40px rgba(212,136,74,0.15)" }}>
          <span className="text-[#D4884A] text-2xl font-bold font-mono">♫</span>
        </div>
      </div>

      <h1 className="text-3xl font-bold text-white mb-1 tracking-tight font-mono relative z-10">PARTYTIME</h1>
      <p className="text-white/30 text-[11px] italic mb-14 relative z-10">everyone's digital jukebox</p>

      <div className="flex flex-col gap-3 w-full max-w-xs relative z-10">
        <button onClick={login} className="flex items-center justify-center gap-3 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold py-3.5 rounded-2xl transition text-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          Host with Spotify
        </button>

        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-white/8" />
          <span className="text-white/20 text-[10px] font-mono tracking-wider">OR JOIN AS GUEST</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        <input type="text" placeholder="Your name" value={guestName} onChange={(e) => setGuestName(e.target.value)}
          className="bg-[#121210] border border-white/8 rounded-2xl px-4 py-3.5 text-white placeholder-white/20 focus:outline-none text-center text-sm" />
        <div className="flex gap-2">
          <input type="text" placeholder="LOBBY CODE" value={lobbyCode} onChange={(e) => setLobbyCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoinAsGuest()}
            className="flex-1 bg-[#121210] border border-white/8 rounded-2xl px-4 py-3.5 text-white placeholder-white/20 focus:outline-none text-center font-mono tracking-[0.3em] text-sm" />
          <button onClick={handleJoinAsGuest} className="bg-[#121210] border border-white/8 hover:border-white/20 text-white font-semibold py-3.5 px-6 rounded-2xl transition text-sm">
            Join
          </button>
        </div>

        {error && <p className="text-red-400/80 text-[11px] font-mono text-center mt-2">{error}</p>}
      </div>
    </div>
  );
}
