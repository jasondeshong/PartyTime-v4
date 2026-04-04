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
  const [myVotes, setMyVotes] = useState({});
  const [toast, setToast] = useState(null);
  const isGuest = !getToken;
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
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }

  const handleTrackEnd = useCallback(() => {
    socket.emit("skip", code);
  }, [code]);

  // SDK only works on desktop browsers — disable on mobile/tablet
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // SDK still used for auto-advance on desktop (Premium host)
  const { isReady, play, pause } = useSpotifyPlayer({
    getToken,
    enabled: isHost && user.premium && !isMobile,
    onTrackEnd: handleTrackEnd,
  });

  // Auto-play via SDK when now playing changes (host desktop only)
  useEffect(() => {
    if (isHost && isReady && nowPlaying?.spotifyId) {
      play(`spotify:track:${nowPlaying.spotifyId}`);
    }
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
    socket.on("vote-error", () => {});
    socket.on("add-error", (msg) => showToast(msg));
    socket.on("add-duplicate", (title) => showToast(`"${title}" is already queued — counted as a vote`));
    socket.on("song-removed-by-votes", () => showToast("Song removed — too many downvotes"));

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
    if (isGuest) return;
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

  function SongRow({ song, onAdd }) {
    return (
      <button
        onMouseDown={(e) => { e.preventDefault(); onAdd(song); }}
        onTouchEnd={(e) => { e.preventDefault(); onAdd(song); }}
        className="w-full text-left px-3 py-2.5 hover:bg-surface-light active:bg-surface-light transition flex items-center gap-3"
      >
        {song.albumArt && (
          <img src={song.albumArt} alt="" className="w-10 h-10 rounded-xl flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm truncate">{song.title}</p>
          <p className="text-muted/50 text-xs truncate">{song.artist}</p>
        </div>
        <span className="text-muted/25 text-[10px] font-mono flex-shrink-0">
          {formatDuration(song.duration)}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-bg px-4 pt-3 pb-6 max-w-lg mx-auto safe-bottom">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-surface border border-border/50 text-white text-[13px] px-5 py-2.5 rounded-2xl shadow-2xl z-50 animate-fade-in font-light tracking-wide">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-white tracking-tight font-mono">PARTYTIME</h1>
            {isHost ? (
              <span className="text-accent text-[9px] font-mono tracking-[0.2em]">"HOST"</span>
            ) : isGuest ? (
              <span className="text-muted text-[9px] font-mono tracking-[0.2em]">"GUEST"</span>
            ) : null}
          </div>
          <button
            onClick={copyCode}
            className="text-muted/60 text-[11px] font-mono tracking-[0.3em] hover:text-white transition mt-1 block"
            title="Copy lobby code"
          >
            {code} {copied ? <span className="text-accent">copied</span> : <span className="text-muted/30">tap to copy</span>}
          </button>
        </div>
        <button
          onClick={onLeave}
          className="text-muted/50 hover:text-white text-[11px] font-mono tracking-wider transition"
        >
          LEAVE
        </button>
      </div>

      {/* Users */}
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        {users.map((u) => (
          <span
            key={u.id}
            className="bg-surface text-muted/70 text-[10px] font-mono px-2.5 py-1 rounded-lg tracking-wide"
          >
            {u.name}
          </span>
        ))}
      </div>

      {/* Now Playing */}
      <div className="mb-5">
        {nowPlaying ? (
          <div className="bg-surface border border-border/50 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              {nowPlaying.albumArt && (
                <img src={nowPlaying.albumArt} alt="" className="w-14 h-14 rounded-xl shadow-lg flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[9px] text-accent font-mono tracking-[0.2em] mb-1">"NOW PLAYING"</p>
                <p className="text-white font-semibold truncate text-[15px]">{nowPlaying.title}</p>
                <p className="text-muted/70 text-sm truncate">{nowPlaying.artist}</p>
                {nowPlaying.addedBy && (
                  <p className="text-muted/30 text-[11px] font-mono mt-0.5">via {nowPlaying.addedBy}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isHost && (
                  <button
                    onClick={skip}
                    className="text-muted/60 hover:text-white text-[11px] font-mono tracking-wider px-3 py-1.5 rounded-lg border border-border/50 hover:border-muted/50 transition"
                  >
                    SKIP
                  </button>
                )}
                {nowPlaying.spotifyId && (
                  <a
                    href={`https://open.spotify.com/track/${nowPlaying.spotifyId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1DB954] hover:text-[#1ed760] transition p-1.5 opacity-70 hover:opacity-100"
                    title="Open in Spotify"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                  </a>
                )}
              </div>
            </div>

            {/* Spotify embed player */}
            {nowPlaying.spotifyId && (
              <iframe
                key={nowPlaying.spotifyId}
                src={`https://open.spotify.com/embed/track/${nowPlaying.spotifyId}?utm_source=generator&theme=0`}
                width="100%"
                height="152"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="eager"
                className="rounded-xl"
              />
            )}
          </div>
        ) : (
          <div className="bg-surface border border-border/50 rounded-2xl p-6 text-center">
            {queue.length > 0 && isHost ? (
              <>
                <p className="text-muted/40 text-[11px] font-mono tracking-wider mb-3">"QUEUE READY"</p>
                <button
                  onClick={skip}
                  className="bg-accent hover:bg-accent-hover active:bg-accent-hover text-white font-semibold text-sm px-8 py-3 rounded-xl transition"
                >
                  Play Next
                </button>
              </>
            ) : queue.length > 0 ? (
              <p className="text-muted/30 text-[11px] font-mono tracking-wider">Waiting for host to start</p>
            ) : (
              <p className="text-muted/30 text-[11px] font-mono tracking-wider">Add a song to begin</p>
            )}
          </div>
        )}
      </div>

      {/* Add Songs: Tabs */}
      <div className="flex items-center gap-1 mb-3 bg-surface rounded-2xl p-1">
        {[
          { id: "search", label: "Search" },
          ...(!isGuest ? [
            { id: "liked", label: "Liked" },
            { id: "playlists", label: "Playlists" },
          ] : []),
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSelectedPlaylist(null); }}
            className={`flex-1 text-[11px] font-mono tracking-wider py-2 rounded-xl transition ${
              tab === t.id
                ? "bg-surface-light text-white"
                : "text-muted/50 hover:text-white"
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
            placeholder="Search for a song..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface border border-border/50 rounded-2xl px-4 py-3 text-white text-sm placeholder-muted/40 focus:outline-none focus:border-accent/30 transition"
          />
          {searching && (
            <div className="absolute right-4 top-3.5 text-muted/40 text-xs font-mono">...</div>
          )}
          {results.length > 0 && (
            <ul className="absolute z-10 w-full mt-1 bg-surface border border-border/50 rounded-2xl overflow-hidden shadow-2xl max-h-72 overflow-y-auto">
              {results.map((song) => (
                <li key={song.spotifyId} className="border-b border-border/30 last:border-0">
                  <SongRow song={song} onAdd={addSong} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Liked Songs Tab (host only) */}
      {tab === "liked" && !isGuest && (
        <div className="mb-4">
          {loadingLibrary ? (
            <div className="flex justify-center py-10">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : likedSongs.length === 0 ? (
            <p className="text-muted/20 text-center py-10 text-[11px] font-mono tracking-wider">No liked songs found</p>
          ) : (
            <ul className="bg-surface border border-border/50 rounded-2xl overflow-hidden max-h-64 overflow-y-auto">
              {likedSongs.map((song) => (
                <li key={song.spotifyId} className="border-b border-border/30 last:border-0">
                  <SongRow song={song} onAdd={addSong} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Playlists Tab (host only) */}
      {tab === "playlists" && !isGuest && (
        <div className="mb-4">
          {loadingLibrary ? (
            <div className="flex justify-center py-10">
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : selectedPlaylist ? (
            <>
              <button
                onClick={() => { setSelectedPlaylist(null); setPlaylistTracks([]); }}
                className="flex items-center gap-2 text-muted/50 hover:text-white text-[11px] font-mono tracking-wider mb-3 transition"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M10 4L6 8l4 4" />
                </svg>
                {selectedPlaylist.name}
              </button>
              {playlistTracks.length === 0 ? (
                <p className="text-muted/20 text-center py-10 text-[11px] font-mono tracking-wider">No tracks</p>
              ) : (
                <ul className="bg-surface border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  {playlistTracks.map((song) => (
                    <li key={song.spotifyId} className="border-b border-border/30 last:border-0">
                      <SongRow song={song} onAdd={addSong} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : playlists.length === 0 ? (
            <p className="text-muted/20 text-center py-10 text-[11px] font-mono tracking-wider">No playlists found</p>
          ) : (
            <ul className="bg-surface border border-border/50 rounded-2xl overflow-hidden max-h-64 overflow-y-auto">
              {playlists.map((p) => (
                <li key={p.id} className="border-b border-border/30 last:border-0">
                  <button
                    onClick={() => loadPlaylistTracks(p)}
                    className="w-full text-left px-3 py-2.5 hover:bg-surface-light active:bg-surface-light transition flex items-center gap-3"
                  >
                    {p.image ? (
                      <img src={p.image} alt="" className="w-10 h-10 rounded-xl flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-border/50 flex-shrink-0 flex items-center justify-center">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted/30">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{p.name}</p>
                      <p className="text-muted/40 text-[10px] font-mono truncate">{p.trackCount} tracks</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Queue */}
      <div className="flex items-center justify-between mb-3 mt-1">
        <h2 className="text-[9px] font-mono text-muted/50 tracking-[0.2em]">
          "UP NEXT"
        </h2>
        {queue.length > 0 && (
          <span className="text-muted/30 text-[10px] font-mono">{queue.length}</span>
        )}
      </div>
      {queue.length === 0 ? (
        <p className="text-muted/20 text-center py-10 text-[11px] font-mono tracking-wider">
          Nothing here yet
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {queue.map((song, i) => (
            <li
              key={song.id}
              className="flex items-center bg-surface rounded-2xl px-3 py-2.5 gap-2.5 group"
            >
              <span className="text-muted/25 text-[10px] w-4 text-center font-mono flex-shrink-0">
                {i + 1}
              </span>

              {song.albumArt && (
                <img src={song.albumArt} alt="" className="w-10 h-10 rounded-xl flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{song.title}</p>
                <p className="text-muted/50 text-xs truncate">
                  {song.artist}
                  {song.addedBy && (
                    <span className="text-muted/25 font-mono ml-1.5">via {song.addedBy}</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => vote(song.id, "up")}
                  className={`p-2 transition ${myVotes[song.id] === "up" ? "text-accent" : "text-muted/30 hover:text-accent"}`}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 3L3 10h10L8 3z"/>
                  </svg>
                </button>
                <span className="text-white/80 text-[11px] font-mono w-5 text-center tabular-nums">
                  {song.votes}
                </span>
                <button
                  onClick={() => vote(song.id, "down")}
                  className={`p-2 transition ${myVotes[song.id] === "down" ? "text-red-400" : "text-muted/30 hover:text-red-400"}`}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 13L3 6h10L8 13z"/>
                  </svg>
                </button>
              </div>

              {isHost && (
                <button
                  onClick={() => removeSong(song.id)}
                  className="text-muted/20 hover:text-red-400 active:text-red-400 transition md:opacity-0 md:group-hover:opacity-100 flex-shrink-0 p-1"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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
