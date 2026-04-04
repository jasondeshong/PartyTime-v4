import { useState, useEffect, useRef, useCallback } from "react";
import socket from "./socket";
import api from "./api";
import useSpotifyPlayer from "./useSpotifyPlayer";

export default function Lobby({ code, isHost, user, initialState, getToken, onLeave }) {
  const [queue, setQueue] = useState(initialState?.queue || []);
  const [users, setUsers] = useState(initialState?.users || []);
  const [nowPlaying, setNowPlaying] = useState(initialState?.nowPlaying || null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef(null);

  const handleTrackEnd = useCallback(() => {
    socket.emit("skip", code);
  }, [code]);

  const { isReady, isPlaying, position, duration, play, pause, togglePlay, seek } = useSpotifyPlayer({
    getToken,
    enabled: isHost && user.premium,
    onTrackEnd: handleTrackEnd,
  });

  // Auto-play when now playing changes (host only)
  useEffect(() => {
    if (isHost && isReady && nowPlaying?.spotifyId) {
      play(`spotify:track:${nowPlaying.spotifyId}`);
    }
    // Pause when nothing is playing
    if (isHost && isReady && !nowPlaying) {
      pause();
    }
  }, [nowPlaying?.spotifyId, isReady, isHost]);

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
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api(`/api/spotify/search?q=${encodeURIComponent(search)}`);
        const data = await res.json();
        setResults(data.tracks || []);
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 300);
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

  function formatDuration(ms) {
    if (!ms) return "0:00";
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div className="flex flex-col min-h-screen bg-bg p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white tracking-tight">PartyTime</h1>
            {isHost && (
              <span className="bg-accent/15 text-accent text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider">
                Host
              </span>
            )}
          </div>
          <button
            onClick={copyCode}
            className="text-muted text-xs font-mono tracking-widest hover:text-white transition mt-0.5"
            title="Copy lobby code"
          >
            {code} {copied ? <span className="text-green-400">copied</span> : <span className="text-muted/50">click to copy</span>}
          </button>
        </div>
        <button
          onClick={onLeave}
          className="text-muted hover:text-white text-xs transition"
        >
          Leave
        </button>
      </div>

      {/* Users */}
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        {users.map((u) => (
          <span
            key={u.id}
            className="bg-surface text-muted text-[11px] px-2.5 py-1 rounded-md"
          >
            {u.name}
          </span>
        ))}
      </div>

      {/* Now Playing */}
      <div className="mb-5">
        {nowPlaying ? (
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              {nowPlaying.albumArt && (
                <img src={nowPlaying.albumArt} alt="" className="w-14 h-14 rounded-lg shadow-lg" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-accent font-semibold uppercase tracking-wider mb-0.5">Now Playing</p>
                <p className="text-white font-semibold truncate">{nowPlaying.title}</p>
                <p className="text-muted text-sm truncate">{nowPlaying.artist}</p>
                {nowPlaying.addedBy && (
                  <p className="text-muted/50 text-xs mt-0.5">added by {nowPlaying.addedBy}</p>
                )}
              </div>
              {isHost && (
                <button
                  onClick={skip}
                  className="text-muted hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg border border-border hover:border-muted transition"
                >
                  Skip
                </button>
              )}
            </div>

            {/* Playback controls for host with Premium */}
            {isHost && user.premium && isReady && (
              <div className="mt-2">
                {/* Timeline */}
                <div
                  className="group relative w-full h-1.5 bg-border rounded-full cursor-pointer mb-2"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    seek(Math.floor(pct * duration));
                  }}
                >
                  <div
                    className="absolute left-0 top-0 h-full bg-accent rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition"
                    style={{ left: `calc(${progress}% - 6px)` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted/50 text-[10px] tabular-nums">{formatDuration(position)}</span>
                  <button
                    onClick={togglePlay}
                    className="text-white hover:text-accent transition p-1"
                  >
                    {isPlaying ? (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  <span className="text-muted/50 text-[10px] tabular-nums">{formatDuration(duration)}</span>
                </div>
              </div>
            )}

            {/* Spotify embed fallback for non-premium or non-host */}
            {nowPlaying.spotifyId && (!isHost || !user.premium) && (
              <iframe
                src={`https://open.spotify.com/embed/track/${nowPlaying.spotifyId}?utm_source=generator&theme=0`}
                width="100%"
                height="80"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="rounded-lg"
              />
            )}
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl p-4 text-center">
            {queue.length > 0 && isHost ? (
              <>
                <p className="text-muted text-sm mb-2">Queue ready</p>
                <button
                  onClick={skip}
                  className="bg-accent hover:bg-accent-hover text-white font-semibold text-sm px-6 py-2 rounded-lg transition"
                >
                  Play Next
                </button>
              </>
            ) : (
              <p className="text-muted/50 text-sm">Nothing playing</p>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <input
          type="text"
          placeholder="Search Spotify..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface border border-border rounded-xl px-4 py-3 text-white text-sm placeholder-muted focus:outline-none focus:border-accent/50 transition"
        />
        {searching && (
          <div className="absolute right-3 top-3.5 text-muted text-xs">...</div>
        )}
        {results.length > 0 && (
          <ul className="absolute z-10 w-full mt-1 bg-surface border border-border rounded-xl overflow-hidden shadow-2xl max-h-80 overflow-y-auto">
            {results.map((song) => (
              <li key={song.spotifyId} className="border-b border-border/50 last:border-0">
                <button
                  onMouseDown={(e) => { e.preventDefault(); addSong(song); }}
                  onTouchEnd={(e) => { e.preventDefault(); addSong(song); }}
                  className="w-full text-left px-3 py-2.5 hover:bg-surface-light active:bg-surface-light transition flex items-center gap-3"
                >
                  {song.albumArt && (
                    <img src={song.albumArt} alt="" className="w-10 h-10 rounded-md flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{song.title}</p>
                    <p className="text-muted text-xs truncate">{song.artist}</p>
                  </div>
                  <span className="text-muted/50 text-xs flex-shrink-0">
                    {formatDuration(song.duration)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Queue */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider">
          Up Next
        </h2>
        {queue.length > 0 && (
          <span className="text-muted/50 text-xs">{queue.length} track{queue.length !== 1 ? "s" : ""}</span>
        )}
      </div>
      {queue.length === 0 ? (
        <p className="text-muted/40 text-center py-10 text-sm">
          Search and add songs to get started
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {queue.map((song, i) => (
            <li
              key={song.id}
              className="flex items-center bg-surface rounded-xl px-3 py-2.5 gap-3 group"
            >
              <span className="text-muted/40 text-xs w-5 text-center font-mono">
                {i + 1}
              </span>

              {song.albumArt && (
                <img src={song.albumArt} alt="" className="w-10 h-10 rounded-md flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{song.title}</p>
                <p className="text-muted text-xs truncate">
                  {song.artist}
                  {song.addedBy && (
                    <span className="text-muted/40 ml-1.5">{song.addedBy}</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => vote(song.id, "up")}
                  className="text-muted hover:text-green-400 p-1.5 transition"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3L3 10h10L8 3z" fill="currentColor"/>
                  </svg>
                </button>
                <span className="text-white text-xs font-medium w-6 text-center tabular-nums">
                  {song.votes}
                </span>
                <button
                  onClick={() => vote(song.id, "down")}
                  className="text-muted hover:text-red-400 p-1.5 transition"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 13L3 6h10L8 13z" fill="currentColor"/>
                  </svg>
                </button>
              </div>

              {isHost && (
                <button
                  onClick={() => removeSong(song.id)}
                  className="text-muted/30 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 4l8 8M12 4l-8 8"/>
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
