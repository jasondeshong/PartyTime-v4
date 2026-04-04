import { useState } from "react";
import useSpotifyAuth from "./useSpotifyAuth";
import socket from "./socket";
import api from "./api";
import Lobby from "./Lobby";

export default function App() {
  const { user, loading, login, logout, getToken, isLoggedIn } = useSpotifyAuth();
  const [lobbyCode, setLobbyCode] = useState("");
  const [activeLobby, setActiveLobby] = useState(null);
  const [initialState, setInitialState] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState("");

  function joinLobby(code, host) {
    setError("");
    socket.connect();
    socket.emit("join-lobby", { code, name: user.name });

    socket.once("error", (msg) => {
      setError(msg);
      socket.disconnect();
    });

    socket.once("lobby-state", (lobby) => {
      setInitialState(lobby);
      setIsHost(host);
      setActiveLobby(code);
    });
  }

  async function createLobby() {
    setError("");
    try {
      const res = await api("/api/lobbies", { method: "POST" });
      const { code } = await res.json();
      joinLobby(code, true);
    } catch {
      setError("Failed to create lobby. Is the server running?");
    }
  }

  function handleJoin() {
    const code = lobbyCode.trim().toUpperCase();
    if (!code) return;
    joinLobby(code, false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Login screen
  if (!isLoggedIn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg p-4">
        <h1 className="text-4xl font-bold text-white mb-1 tracking-tight">PartyTime</h1>
        <p className="text-muted mb-10">Collaborative playlists, democratized.</p>

        <button
          onClick={login}
          className="flex items-center gap-3 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold py-3 px-8 rounded-full transition"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          Login with Spotify
        </button>
      </div>
    );
  }

  // Lobby view
  if (activeLobby) {
    return (
      <Lobby
        code={activeLobby}
        isHost={isHost}
        user={user}
        initialState={initialState}
        getToken={getToken}
        onLeave={() => {
          socket.disconnect();
          setActiveLobby(null);
          setInitialState(null);
        }}
      />
    );
  }

  // Home screen
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg p-4">
      <div className="flex items-center gap-3 mb-10">
        {user.image && (
          <img src={user.image} alt="" className="w-8 h-8 rounded-full" />
        )}
        <span className="text-muted text-sm">{user.name}</span>
        <button
          onClick={logout}
          className="text-muted hover:text-white text-xs underline transition"
        >
          Logout
        </button>
      </div>

      <h1 className="text-4xl font-bold text-white mb-1 tracking-tight">PartyTime</h1>
      <p className="text-muted mb-10">Create or join a lobby.</p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={createLobby}
          className="bg-accent hover:bg-accent-hover text-white font-semibold py-3 rounded-xl transition"
        >
          Create a Lobby
        </button>

        <div className="flex items-center gap-2 my-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-muted text-xs">or join one</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Lobby code"
            value={lobbyCode}
            onChange={(e) => setLobbyCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            className="flex-1 bg-surface border border-border rounded-xl px-4 py-3 text-white placeholder-muted focus:outline-none focus:border-accent text-center font-mono tracking-widest"
          />
          <button
            onClick={handleJoin}
            className="bg-surface-light hover:bg-border text-white font-semibold py-3 px-6 rounded-xl transition"
          >
            Join
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center mt-1">{error}</p>
        )}
      </div>
    </div>
  );
}
