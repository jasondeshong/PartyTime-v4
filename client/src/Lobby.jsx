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
  const [volume, setVolume] = useState(80);
  const [myVotes, setMyVotes] = useState({});
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState("search"); // "search" | "liked" | "playlists"
  const [likedSongs, setLikedSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const debounceRef = useRef(null);
  const toastRef = useRef(null);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2500);
  }

  const handleTrackEnd = useCallback(() => {
    socket.emit("skip", code);
  }, [code]);

  const { isReady, isPlaying, position, duration, play, pause, togglePlay, seek, player } = useSpotifyPlayer({
    getToken,
    enabled: isHost && user.premium,
    onTrackEnd: handleTrackEnd,
  });

  // Auto-play when now playing changes (host only)
  useEffect(() => {
    if (isHost && isReady && nowPlaying?.spotifyId) {
      play(`spotify:track:${nowPlaying.spotifyId}`);
    }
    if (isHost && isReady && !nowPlaying) {
      pause();
    }
  }, [nowPlaying?.spotifyId, isReady, isHost]);

  useEffect(() => {
    if (player) player.setVolume(volume / 100);
  }, [volume, player]);

  useEffect(() => {
    socket.on("lobby-state", (lobby) => {
      setQueue(lobby.queue);
      setUsers(lobby.users);
      setNowPlaying(lobby.nowPlaying);
    });
    socket.on("queue-updated", (q) => setQueue(q));
    socket.on("users-updated", (u) => setUsers(u));
    socket.on("now-playing", (np) => setNowPlaying(np));
    socket.on("vote-error", () => {});
    socket.on("add-error", (msg) => showToast(msg));
    socket.on("add-duplicate", (title) => showToast(`"${title}" already queued — voted up`));
    socket.on("song-removed-by-votes", () => showToast("Song removed by votes"));

    return () => {
      socket.off("lobby-state");
      socket.off("queue-updated");
      socket.off("users-updated");
      socket.off("now-playing");
      socket.off("vote-error");
      socket.off("add-error");
      socket.off("add-duplicate");
      socket.off("song-removed-by-votes");
    };
  }, []);

  useEffect(() => {
    if (tab !== "search" || !search.trim()) {
      if (tab === "search") setResults([]);
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
  }, [search, tab]);

  async function loadLikedSongs() {
    setLoadingLibrary(true);
    try {
      const token = await getToken();
      const res = await api("/api/spotify/liked", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLikedSongs(data.tracks || []);
    } catch {
      setLikedSongs([]);
    }
    setLoadingLibrary(false);
  }

  async function loadPlaylists() {
    setLoadingLibrary(true);
    try {
      const token = await getToken();
      const res = await api("/api/spotify/playlists", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPlaylists(data.playlists || []);
    } catch {
      setPlaylists([]);
    }
    setLoadingLibrary(false);
  }

  async function loadPlaylistTracks(playlist) {
    setSelectedPlaylist(playlist);
    setLoadingLibrary(true);
    try {
      const token = await getToken();
      const res = await api(`/api/spotify/playlists/${playlist.id}/tracks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPlaylistTracks(data.tracks || []);
    } catch {
      setPlaylistTracks([]);
    }
    setLoadingLibrary(false);
  }

  useEffect(() => {
    if (tab === "liked" && likedSongs.length === 0) loadLikedSongs();
    if (tab === "playlists" && playlists.length === 0) loadPlaylists();
  }, [tab]);

  function addSong(song) {
    socket.emit("add-song", { code, song });
    if (tab === "search") {
      setSearch("");
      setResults([]);
    }
  }

  function vote(songId, direction) {
    const prev = myVotes[songId];
    if (prev === direction) return;
    setMyVotes((v) => ({ ...v, [songId]: direction }));
    socket.emit("vote", { code, songId, direction });
  }

  function removeSong(songId) {
    socket.emit("remove-song", { code, songId });
    setMyVotes((v) => {
      const next = { ...v };
      delete next[songId];
      return next;
    });
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

  function SongRow({ song, onAdd }) {
    return (
      <button
        onMouseDown={(e) => { e.preventDefault(); onAdd(song); }}
        onTouchEnd={(e) => { e.preventDefault(); onAdd(song); }}
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
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-bg px-4 pt-3 pb-6 max-w-lg mx-auto safe-bottom">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-surface border border-border text-white text-sm px-4 py-2 rounded-xl shadow-2xl z-50 animate-fade-in">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
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
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
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
      <div className="mb-4">
        {nowPlaying ? (
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              {nowPlaying.albumArt && (
                <img src={nowPlaying.albumArt} alt="" className="w-14 h-14 rounded-lg shadow-lg flex-shrink-0" />
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
                  className="text-muted hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg border border-border hover:border-muted transition flex-shrink-0"
                >
                  Skip
                </button>
              )}
            </div>

            {/* Playback controls for host with Premium (desktop SDK) */}
            {isHost && user.premium && isReady && (
              <div className="mt-2">
                <div
                  className="group relative w-full h-2 bg-border rounded-full cursor-pointer mb-2 touch-none"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    seek(Math.floor(pct * duration));
                  }}
                  onTouchEnd={(e) => {
                    const touch = e.changedTouches[0];
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
                    seek(Math.floor(pct * duration));
                  }}
                >
                  <div
                    className="absolute left-0 top-0 h-full bg-accent rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition"
                    style={{ left: `calc(${progress}% - 7px)` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted/50 text-[10px] tabular-nums">{formatDuration(position)}</span>
                  <button
                    onClick={togglePlay}
                    className="text-white hover:text-accent transition p-1 active:scale-95"
                  >
                    {isPlaying ? (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  <span className="text-muted/50 text-[10px] tabular-nums">{formatDuration(duration)}</span>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted flex-shrink-0">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    {volume > 0 && <path d="M15.54 8.46a5 5 0 010 7.07" />}
                    {volume > 50 && <path d="M19.07 4.93a10 10 0 010 14.14" />}
                  </svg>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="flex-1 h-1 bg-border rounded-full appearance-none cursor-pointer accent-accent"
                  />
                </div>
              </div>
            )}

            {/* Spotify embed: show when SDK not ready (mobile) or for non-host/non-premium */}
            {nowPlaying.spotifyId && (!isHost || !user.premium || !isReady) && (
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
            <p className="text-muted/50 text-sm">
              {queue.length > 0 ? "Queue ready" : "Search and add a song to start"}
            </p>
          </div>
        )}
      </div>

      {/* Add Songs: Tabs */}
      <div className="flex items-center gap-1 mb-3 bg-surface rounded-xl p-1">
        {[
          { id: "search", label: "Search" },
          { id: "liked", label: "Liked" },
          { id: "playlists", label: "Playlists" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSelectedPlaylist(null); }}
            className={`flex-1 text-xs font-medium py-2 rounded-lg transition ${
              tab === t.id
                ? "bg-surface-light text-white"
                : "text-muted hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search Tab */}
      {tab === "search" && (
        <div className="relative mb-4">
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
            <ul className="absolute z-10 w-full mt-1 bg-surface border border-border rounded-xl overflow-hidden shadow-2xl max-h-72 overflow-y-auto">
              {results.map((song) => (
                <li key={song.spotifyId} className="border-b border-border/50 last:border-0">
                  <SongRow song={song} onAdd={addSong} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Liked Songs Tab */}
      {tab === "liked" && (
        <div className="mb-4">
          {loadingLibrary ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : likedSongs.length === 0 ? (
            <p className="text-muted/50 text-center py-8 text-sm">No liked songs found</p>
          ) : (
            <ul className="bg-surface border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              {likedSongs.map((song) => (
                <li key={song.spotifyId} className="border-b border-border/50 last:border-0">
                  <SongRow song={song} onAdd={addSong} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Playlists Tab */}
      {tab === "playlists" && (
        <div className="mb-4">
          {loadingLibrary ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : selectedPlaylist ? (
            <>
              <button
                onClick={() => { setSelectedPlaylist(null); setPlaylistTracks([]); }}
                className="flex items-center gap-2 text-muted hover:text-white text-sm mb-3 transition"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M10 4L6 8l4 4" />
                </svg>
                {selectedPlaylist.name}
              </button>
              {playlistTracks.length === 0 ? (
                <p className="text-muted/50 text-center py-8 text-sm">No tracks</p>
              ) : (
                <ul className="bg-surface border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  {playlistTracks.map((song) => (
                    <li key={song.spotifyId} className="border-b border-border/50 last:border-0">
                      <SongRow song={song} onAdd={addSong} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : playlists.length === 0 ? (
            <p className="text-muted/50 text-center py-8 text-sm">No playlists found</p>
          ) : (
            <ul className="bg-surface border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              {playlists.map((p) => (
                <li key={p.id} className="border-b border-border/50 last:border-0">
                  <button
                    onClick={() => loadPlaylistTracks(p)}
                    className="w-full text-left px-3 py-2.5 hover:bg-surface-light active:bg-surface-light transition flex items-center gap-3"
                  >
                    {p.image ? (
                      <img src={p.image} alt="" className="w-10 h-10 rounded-md flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-border flex-shrink-0 flex items-center justify-center">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{p.name}</p>
                      <p className="text-muted text-xs truncate">{p.trackCount} tracks</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
        <p className="text-muted/40 text-center py-8 text-sm">
          Queue is empty
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {queue.map((song, i) => (
            <li
              key={song.id}
              className="flex items-center bg-surface rounded-xl px-3 py-2.5 gap-2.5 group"
            >
              <span className="text-muted/40 text-xs w-4 text-center font-mono flex-shrink-0">
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

              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => vote(song.id, "up")}
                  className={`p-2 transition ${myVotes[song.id] === "up" ? "text-green-400" : "text-muted hover:text-green-400"}`}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 3L3 10h10L8 3z"/>
                  </svg>
                </button>
                <span className="text-white text-xs font-medium w-6 text-center tabular-nums">
                  {song.votes}
                </span>
                <button
                  onClick={() => vote(song.id, "down")}
                  className={`p-2 transition ${myVotes[song.id] === "down" ? "text-red-400" : "text-muted hover:text-red-400"}`}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 13L3 6h10L8 13z"/>
                  </svg>
                </button>
              </div>

              {isHost && (
                <button
                  onClick={() => removeSong(song.id)}
                  className="text-muted/30 hover:text-red-400 active:text-red-400 transition md:opacity-0 md:group-hover:opacity-100 flex-shrink-0 p-1"
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
