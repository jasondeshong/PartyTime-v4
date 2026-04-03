import { useState, useEffect } from "react";
import socket from "./socket";
import mockSongs from "./mockSongs";

export default function Lobby({ code, isHost, userName, initialState }) {
  const [queue, setQueue] = useState(initialState?.queue || []);
  const [users, setUsers] = useState(initialState?.users || []);
  const [nowPlaying, setNowPlaying] = useState(initialState?.nowPlaying || null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    socket.on("lobby-state", (lobby) => {
      setQueue(lobby.queue);
      setUsers(lobby.users);
      setNowPlaying(lobby.nowPlaying);
    });
    socket.on("queue-updated", (q) => setQueue(q));
    socket.on("users-updated", (u) => setUsers(u));
    socket.on("now-playing", (np) => setNowPlaying(np));

    return () => {
      socket.off("lobby-state");
      socket.off("queue-updated");
      socket.off("users-updated");
      socket.off("now-playing");
    };
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    const q = search.toLowerCase();
    setResults(
      mockSongs.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q)
      )
    );
  }, [search]);

  function addSong(song) {
    socket.emit("add-song", { code, song });
    setSearch("");
    setResults([]);
  }

  function vote(songId, direction) {
    socket.emit("vote", { code, songId, direction });
  }

  function removeSong(songId) {
    socket.emit("remove-song", { code, songId });
  }

  function skip() {
    socket.emit("skip", code);
  }

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col min-h-screen p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-accent">PartyTime</h1>
          <p className="text-gray-400 text-sm flex items-center gap-2">
            Lobby:{" "}
            <button
              onClick={copyCode}
              className="font-mono text-white tracking-wider hover:text-accent transition"
              title="Copy lobby code"
            >
              {code}
            </button>
            {copied && <span className="text-green-400 text-xs">Copied!</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isHost && (
            <span className="bg-accent/20 text-accent text-xs font-semibold px-3 py-1 rounded-full">
              HOST
            </span>
          )}
          <span className="text-gray-400 text-sm">{userName}</span>
        </div>
      </div>

      {/* Users online */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-gray-500 text-xs">In lobby:</span>
        {users.map((u) => (
          <span
            key={u.id}
            className="bg-surface text-gray-300 text-xs px-2 py-1 rounded-full"
          >
            {u.name}
          </span>
        ))}
      </div>

      {/* Now Playing */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Now Playing
        </h2>
        {nowPlaying ? (
          <div className="bg-gradient-to-r from-accent/20 to-surface border border-accent/30 rounded-lg px-4 py-4 flex items-center gap-3">
            <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold truncate">{nowPlaying.title}</p>
              <p className="text-gray-400 text-sm truncate">
                {nowPlaying.artist}
                {nowPlaying.addedBy && (
                  <span className="text-gray-500 ml-2">added by {nowPlaying.addedBy}</span>
                )}
              </p>
            </div>
            {isHost && (
              <button
                onClick={skip}
                className="bg-accent/20 hover:bg-accent/40 text-accent font-semibold text-sm px-4 py-2 rounded-lg transition"
              >
                Skip
              </button>
            )}
          </div>
        ) : (
          <div className="bg-surface border border-gray-700 rounded-lg px-4 py-4 text-center">
            <p className="text-gray-500 text-sm">
              {queue.length > 0 && isHost
                ? "Ready to start!"
                : "Nothing playing"}
            </p>
            {queue.length > 0 && isHost && (
              <button
                onClick={skip}
                className="mt-2 bg-accent hover:bg-accent/80 text-white font-semibold text-sm px-6 py-2 rounded-lg transition"
              >
                Play Next
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <input
          type="text"
          placeholder="Search for a song..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-accent"
        />
        {results.length > 0 && (
          <ul className="absolute z-10 w-full mt-1 bg-surface border border-gray-700 rounded-lg overflow-hidden shadow-lg">
            {results.map((song, i) => (
              <li key={i}>
                <button
                  onClick={() => addSong(song)}
                  className="w-full text-left px-4 py-3 hover:bg-accent/20 transition flex justify-between items-center"
                >
                  <span>
                    <span className="text-white">{song.title}</span>
                    <span className="text-gray-400 ml-2 text-sm">{song.artist}</span>
                  </span>
                  <span className="text-accent text-xl">+</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Queue */}
      <h2 className="text-lg font-semibold text-gray-300 mb-3">
        Up Next {queue.length > 0 && <span className="text-gray-500 text-sm font-normal">({queue.length})</span>}
      </h2>
      {queue.length === 0 ? (
        <p className="text-gray-500 text-center py-8">
          No songs yet. Search and add one!
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {queue.map((song, i) => (
            <li
              key={song.id}
              className="flex items-center bg-surface rounded-lg px-4 py-3 gap-3"
            >
              <span className="text-gray-500 text-sm w-6 text-center font-mono">
                {i + 1}
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-white truncate">{song.title}</p>
                <p className="text-gray-400 text-sm truncate">
                  {song.artist}
                  {song.addedBy && (
                    <span className="text-gray-500 ml-2">
                      added by {song.addedBy}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => vote(song.id, "up")}
                  className="text-green-400 hover:text-green-300 px-2 py-1 transition text-lg"
                >
                  ▲
                </button>
                <span className="text-white font-semibold w-8 text-center">
                  {song.votes}
                </span>
                <button
                  onClick={() => vote(song.id, "down")}
                  className="text-red-400 hover:text-red-300 px-2 py-1 transition text-lg"
                >
                  ▼
                </button>
              </div>

              {isHost && (
                <button
                  onClick={() => removeSong(song.id)}
                  className="text-gray-500 hover:text-red-400 ml-1 transition"
                  title="Remove song"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
