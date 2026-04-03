import { useState } from "react";
import socket from "./socket";
import Lobby from "./Lobby";

export default function App() {
  const [name, setName] = useState("");
  const [lobbyCode, setLobbyCode] = useState("");
  const [activeLobby, setActiveLobby] = useState(null);
  const [initialState, setInitialState] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState("");

  function joinLobby(code, host) {
    setError("");
    socket.connect();
    socket.emit("join-lobby", { code, name: name.trim() });

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
    if (!name.trim()) {
      setError("Enter your name first");
      return;
    }
    setError("");
    try {
      const res = await fetch("/api/lobbies", { method: "POST" });
      const { code } = await res.json();
      joinLobby(code, true);
    } catch {
      setError("Failed to create lobby. Is the server running?");
    }
  }

  function handleJoin() {
    if (!name.trim()) {
      setError("Enter your name first");
      return;
    }
    const code = lobbyCode.trim().toUpperCase();
    if (!code) return;
    joinLobby(code, false);
  }

  if (activeLobby) {
    return <Lobby code={activeLobby} isHost={isHost} userName={name.trim()} initialState={initialState} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-5xl font-bold mb-2 text-accent">PartyTime</h1>
      <p className="text-gray-400 mb-8">Collaborative playlists, democratized.</p>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-surface border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent text-center"
        />

        <button
          onClick={createLobby}
          className="bg-accent hover:bg-accent/80 text-white font-semibold py-3 px-6 rounded-lg transition"
        >
          Create a Lobby
        </button>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter lobby code"
            value={lobbyCode}
            onChange={(e) => setLobbyCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            className="flex-1 bg-surface border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent"
          />
          <button
            onClick={handleJoin}
            className="bg-accent-alt hover:bg-accent-alt/80 text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            Join
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}
      </div>
    </div>
  );
}
