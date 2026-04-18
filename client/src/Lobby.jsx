import { useState, useEffect, useRef, useCallback } from "react";
import socket from "./socket";
import api from "./api";
import useSpotifyPlayer from "./useSpotifyPlayer";
import { ShenRing, Scarab } from "./Symbols";

export default function Lobby({ code, isHost, user, initialState, getToken, onLeave }) {
  const [queue, setQueue] = useState(initialState?.queue || []);
  const [users, setUsers] = useState(initialState?.users || []);
  const [nowPlaying, setNowPlaying] = useState(initialState?.nowPlaying || null);
  const [venueName] = useState(initialState?.venueName || null);
  const [venueSlug] = useState(initialState?.venueSlug || null);
  const [venueAccentColor] = useState(initialState?.venueAccentColor || null);
  const [venueLogoUrl] = useState(initialState?.venueLogoUrl || null);
  const accent = venueAccentColor || "#D4884A";
  const displayCode = venueSlug || code;
  const joinUrl = venueSlug ? `https://party-time-v4.vercel.app/${venueSlug}` : `https://party-time-v4.vercel.app/join/${code}`;

  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [myVotes, setMyVotes] = useState({});
  const [toast, setToast] = useState(null);
  const [saved, setSaved] = useState(false);
  const [albumHistory, setAlbumHistory] = useState([]);
  const isGuest = !getToken;
  const [tab, setTab] = useState("search");
  const [likedSongs, setLikedSongs] = useState([]);
  const [likedHasMore, setLikedHasMore] = useState(true);
  const [playlists, setPlaylists] = useState([]);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [playlistTracksHasMore, setPlaylistTracksHasMore] = useState(true);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [showQR, setShowQR] = useState(false);
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

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const { isReady, play, pause } = useSpotifyPlayer({
    getToken,
    enabled: isHost && user.premium && !isMobile,
    onTrackEnd: handleTrackEnd,
  });

  useEffect(() => {
    if (isHost && isReady && nowPlaying?.spotifyId) {
      play(`spotify:track:${nowPlaying.spotifyId}`);
    }
    if (isHost && isReady && !nowPlaying) {
      pause();
    }
  }, [nowPlaying?.spotifyId, isReady, isHost]);

  useEffect(() => {
    setSaved(false);
    if (nowPlaying?.albumArt) {
      setAlbumHistory((prev) => {
        const filtered = prev.filter((a) => a.id !== nowPlaying.spotifyId);
        return [{ id: nowPlaying.spotifyId, art: nowPlaying.albumArt }, ...filtered].slice(0, 8);
      });
    }
  }, [nowPlaying?.spotifyId]);

  useEffect(() => {
    socket.on("lobby-state", (lobby) => { setQueue(lobby.queue); setUsers(lobby.users); setNowPlaying(lobby.nowPlaying); });
    socket.on("queue-updated", (q) => setQueue(q));
    socket.on("users-updated", (u) => setUsers(u));
    socket.on("now-playing", (np) => setNowPlaying(np));
    socket.on("vote-error", () => {});
    socket.on("add-error", (msg) => showToast(msg));
    socket.on("add-duplicate", ({ title, songId }) => {
      showToast(`"${title}" is already queued — counted as a vote`);
      if (songId) setMyVotes((v) => ({ ...v, [songId]: "up" }));
    });
    socket.on("song-removed-by-votes", () => showToast("Song removed — too many downvotes"));
    socket.on("lobby-closed", () => { showToast("Lobby closed"); setTimeout(onLeave, 2000); });
    socket.on("permission-error", (msg) => showToast(msg));
    return () => {
      ["lobby-state","queue-updated","users-updated","now-playing","vote-error","add-error","add-duplicate","song-removed-by-votes","lobby-closed","permission-error"].forEach((e) => socket.off(e));
    };
  }, []);

  useEffect(() => {
    if (tab !== "search" || !search.trim()) { if (tab === "search") setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api(`/api/spotify/search?q=${encodeURIComponent(search)}`);
        const data = await res.json();
        setResults(data.tracks || []);
      } catch { setResults([]); }
      setSearching(false);
    }, 300);
  }, [search, tab]);

  async function saveToLibrary() {
    if (!getToken || !nowPlaying?.spotifyId || saved) return;
    try {
      const token = await getToken();
      const res = await fetch("https://api.spotify.com/v1/me/tracks", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [nowPlaying.spotifyId] }),
      });
      if (res.ok || res.status === 200) { setSaved(true); showToast(`Saved "${nowPlaying.title}"`); }
      else showToast("Couldn't save — try again");
    } catch { showToast("Couldn't save — try again"); }
  }

  async function loadLikedSongs(offset = 0) {
    if (offset === 0) setLoadingLibrary(true);
    try {
      const token = await getToken();
      const res = await api(`/api/spotify/liked?offset=${offset}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (offset === 0) setLikedSongs(data.tracks || []);
      else setLikedSongs((prev) => [...prev, ...(data.tracks || [])]);
      setLikedHasMore(data.hasMore ?? false);
    } catch { if (offset === 0) setLikedSongs([]); }
    setLoadingLibrary(false);
  }

  async function loadPlaylists() {
    setLoadingLibrary(true);
    try {
      const token = await getToken();
      const res = await api("/api/spotify/playlists", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setPlaylists(data.playlists || []);
    } catch { setPlaylists([]); }
    setLoadingLibrary(false);
  }

  async function loadPlaylistTracks(playlist, offset = 0) {
    if (offset === 0) { setSelectedPlaylist(playlist); setLoadingLibrary(true); }
    try {
      const token = await getToken();
      const res = await api(`/api/spotify/playlists/${playlist.id}/tracks?offset=${offset}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (offset === 0) setPlaylistTracks(data.tracks || []);
      else setPlaylistTracks((prev) => [...prev, ...(data.tracks || [])]);
      setPlaylistTracksHasMore(data.hasMore ?? false);
    } catch { if (offset === 0) setPlaylistTracks([]); }
    setLoadingLibrary(false);
  }

  useEffect(() => {
    if (isGuest) return;
    if (tab === "liked" && likedSongs.length === 0) loadLikedSongs();
    if (tab === "playlists" && playlists.length === 0) loadPlaylists();
  }, [tab]);

  function addSong(song) {
    socket.emit("add-song", { code, song });
    if (tab === "search") { setSearch(""); setResults([]); }
  }
  function vote(songId, direction) {
    if (myVotes[songId] === direction) return;
    setMyVotes((v) => ({ ...v, [songId]: direction }));
    socket.emit("vote", { code, songId, direction });
  }
  function removeSong(songId) {
    socket.emit("remove-song", { code, songId });
    setMyVotes((v) => { const n = { ...v }; delete n[songId]; return n; });
  }
  function skip() { socket.emit("skip", code); }
  function copyCode() {
    navigator.clipboard.writeText(venueSlug ? joinUrl : code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  function fmt(ms) {
    if (!ms) return "0:00";
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function SongRow({ song, onAdd }) {
    return (
      <button
        onMouseDown={(e) => { e.preventDefault(); onAdd(song); }}
        className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition flex items-center gap-3 border-b border-white/5 last:border-0"
      >
        {song.albumArt && <img src={song.albumArt} alt="" className="w-10 h-10 rounded-lg flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm truncate">{song.title}</p>
          <p className="text-white/40 text-xs truncate">{song.artist}</p>
        </div>
        <span className="text-white/20 text-[10px] font-mono flex-shrink-0">{fmt(song.duration)}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#080808] px-4 pt-3 pb-6 max-w-lg mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-[#121210] border border-white/10 text-white text-[13px] px-5 py-2.5 rounded-2xl shadow-2xl z-50 font-mono tracking-wide">
          {toast}
        </div>
      )}

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center cursor-pointer" onClick={() => setShowQR(false)}>
          <div className="text-center">
            <p className="text-white text-2xl font-bold font-mono tracking-wider mb-8">{venueName || "PARTYTIME"}</p>
            <div className="bg-white p-6 rounded-2xl inline-block mb-6">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(joinUrl)}&bgcolor=FFFFFF&color=080808`} alt="QR" className="w-60 h-60" />
            </div>
            <p className="font-mono tracking-[0.4em] text-lg" style={{ color: accent }}>{displayCode}</p>
            <p className="text-white/50 text-sm mt-2 italic">Scan to join</p>
            <p className="text-white/20 text-xs mt-10 font-mono">tap anywhere to close</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-white tracking-tight font-mono">{venueName || "PARTYTIME"}</h1>
            {isHost ? (
              <span className="text-[9px] font-mono tracking-[0.2em]" style={{ color: accent }}>HOST</span>
            ) : (
              <span className="text-white/40 text-[9px] font-mono tracking-[0.2em]">GUEST</span>
            )}
          </div>
          {venueName && <p className="text-white/30 text-[10px] italic mt-0.5">powered by PartyTime</p>}
          <button onClick={copyCode} className="text-white/40 text-[11px] font-mono tracking-[0.3em] hover:text-white transition mt-1 block">
            {displayCode} {copied ? <span style={{ color: accent }}>copied</span> : <span className="text-white/20">tap to copy</span>}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowQR(true)} className="border border-white/10 rounded-lg p-1.5 hover:border-white/30 transition" title="Show QR code">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/60">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/><rect x="18" y="14" width="3" height="1"/><rect x="14" y="18" width="1" height="3"/>
            </svg>
          </button>
          <button onClick={onLeave} className="text-white/30 hover:text-white text-[11px] font-mono tracking-wider transition">LEAVE</button>
        </div>
      </div>

      {/* Venue logo */}
      {venueLogoUrl && (
        <div className="flex justify-center mb-4">
          <img src={venueLogoUrl} alt="" className="h-10 object-contain opacity-70" />
        </div>
      )}

      {/* Users */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {users.map((u) => (
          <span key={u.id} className="bg-[#121210] border border-white/8 text-white/50 text-[10px] font-mono px-2.5 py-1 rounded-lg tracking-wide whitespace-nowrap flex-shrink-0">
            {u.name}
          </span>
        ))}
      </div>

      {/* Now Playing */}
      <div className="mb-4">
        {nowPlaying ? (
          <div className="bg-[#121210] border border-white/8 rounded-2xl p-4 overflow-visible">
            {/* Jukebox carousel */}
            <div className="relative flex items-center justify-center h-32 mb-3 overflow-visible" style={{ perspective: "800px" }}>
              {/* Upcoming — left */}
              {queue.slice(0, 3).reverse().map((song, i) => {
                const idx = Math.min(queue.length, 3) - 1 - i;
                if (!song.albumArt) return null;
                return (
                  <img key={`up-${song.id}`} src={song.albumArt} alt=""
                    className="absolute w-24 h-24 rounded-xl"
                    style={{
                      transform: `translateX(${-90 - idx * 16}px) translateY(${8 + idx * 3}px) rotateY(75deg) scale(${0.65 - idx * 0.06})`,
                      opacity: 0.45 - idx * 0.12,
                      zIndex: 3 - idx,
                    }}
                  />
                );
              })}
              {/* Center */}
              {(nowPlaying?.albumArt || albumHistory[0]?.art) && (
                <img src={nowPlaying?.albumArt || albumHistory[0]?.art} alt=""
                  className="relative w-28 h-28 rounded-xl z-10 transition-all duration-500"
                  style={{ boxShadow: `0 8px 32px ${accent}40`, opacity: nowPlaying ? 1 : 0.5 }}
                />
              )}
              {/* Played — right */}
              {albumHistory.slice(nowPlaying ? 1 : 0, (nowPlaying ? 1 : 0) + 3).map((album, i) => (
                <img key={`pl-${album.id}`} src={album.art} alt=""
                  className="absolute w-24 h-24 rounded-xl"
                  style={{
                    transform: `translateX(${90 + i * 16}px) translateY(${8 + i * 3}px) rotateY(-75deg) scale(${0.65 - i * 0.06})`,
                    opacity: 0.45 - i * 0.12,
                    zIndex: 2 - i,
                  }}
                />
              ))}
            </div>

            {/* Track info */}
            <div className="text-center mb-2">
              <p className="text-[9px] font-mono tracking-[0.2em] mb-1" style={{ color: accent }}>NOW PLAYING</p>
              <p className="text-white font-semibold truncate text-[15px]">{nowPlaying.title}</p>
              <p className="text-white/50 text-sm truncate italic">{nowPlaying.artist}</p>
              {nowPlaying.addedBy && <p className="text-white/20 text-[11px] font-mono mt-0.5">queued by {nowPlaying.addedBy}</p>}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 mt-2">
              {!isGuest && (
                <button onClick={saveToLibrary} className="w-9 h-9 rounded-xl border border-white/10 hover:border-white/20 transition flex items-center justify-center" title="Save to library">
                  <ShenRing size={20} color={saved ? accent : "rgba(255,255,255,0.4)"} filled={saved} />
                </button>
              )}
              {isHost && (
                <button onClick={skip} className="flex-1 py-2 rounded-xl font-mono text-sm tracking-wider transition hover:opacity-80"
                  style={{ backgroundColor: accent, color: "#080808" }}>
                  Skip ▶▶
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[#121210] border border-white/8 rounded-2xl p-6 text-center">
            {queue.length > 0 && isHost ? (
              <>
                <p className="text-white/30 text-[11px] font-mono tracking-wider mb-3">QUEUE READY</p>
                <button onClick={skip} className="text-sm font-semibold px-8 py-3 rounded-xl transition hover:opacity-80" style={{ backgroundColor: accent, color: "#080808" }}>
                  Play Next
                </button>
              </>
            ) : queue.length > 0 ? (
              <p className="text-white/20 text-[11px] font-mono tracking-wider">Waiting for host to start</p>
            ) : (
              <p className="text-white/20 text-[11px] font-mono tracking-wider">Add a song to begin</p>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-3 border-b border-white/8 pb-2">
        {[
          { id: "search", label: "Search" },
          ...(!isGuest ? [{ id: "liked", label: "Liked" }, { id: "playlists", label: "Playlists" }] : []),
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSelectedPlaylist(null); }}
            className={`flex-1 text-[11px] font-mono tracking-wider py-2 rounded-lg transition ${tab === t.id ? "text-white bg-white/5" : "text-white/30 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      {tab === "search" && (
        <div className="relative mb-4">
          <input
            type="text"
            placeholder="Search Spotify..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#121210] border border-white/8 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-white/20 transition font-mono"
          />
          {searching && <div className="absolute right-4 top-3.5 text-white/30 text-xs font-mono">...</div>}
          {results.length > 0 && (
            <ul className="absolute z-10 w-full mt-1 bg-[#121210] border border-white/10 rounded-xl overflow-hidden shadow-2xl max-h-72 overflow-y-auto">
              {results.map((song) => (
                <li key={song.spotifyId}><SongRow song={song} onAdd={addSong} /></li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Liked */}
      {tab === "liked" && !isGuest && (
        <div className="mb-4">
          {loadingLibrary ? (
            <div className="flex justify-center py-10"><div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accent, borderTopColor: "transparent" }} /></div>
          ) : likedSongs.length === 0 ? (
            <p className="text-white/20 text-center py-10 text-[11px] font-mono">No liked songs</p>
          ) : (
            <>
              <ul className="bg-[#121210] border border-white/8 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                {likedSongs.map((song) => (<li key={song.spotifyId}><SongRow song={song} onAdd={addSong} /></li>))}
              </ul>
              {likedHasMore && (
                <button onClick={() => loadLikedSongs(likedSongs.length)} className="w-full mt-2 py-2.5 border border-white/8 rounded-xl text-xs font-mono hover:border-white/20 transition" style={{ color: accent }}>Load More</button>
              )}
            </>
          )}
        </div>
      )}

      {/* Playlists */}
      {tab === "playlists" && !isGuest && (
        <div className="mb-4">
          {loadingLibrary ? (
            <div className="flex justify-center py-10"><div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accent, borderTopColor: "transparent" }} /></div>
          ) : selectedPlaylist ? (
            <>
              <button onClick={() => { setSelectedPlaylist(null); setPlaylistTracks([]); }} className="text-white/40 hover:text-white text-[11px] font-mono mb-3 transition">
                ← {selectedPlaylist.name}
              </button>
              <ul className="bg-[#121210] border border-white/8 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                {playlistTracks.map((song) => (<li key={song.spotifyId}><SongRow song={song} onAdd={addSong} /></li>))}
              </ul>
              {playlistTracksHasMore && (
                <button onClick={() => loadPlaylistTracks(selectedPlaylist, playlistTracks.length)} className="w-full mt-2 py-2.5 border border-white/8 rounded-xl text-xs font-mono hover:border-white/20 transition" style={{ color: accent }}>Load More</button>
              )}
            </>
          ) : playlists.length === 0 ? (
            <p className="text-white/20 text-center py-10 text-[11px] font-mono">No playlists</p>
          ) : (
            <ul className="bg-[#121210] border border-white/8 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              {playlists.map((p) => (
                <li key={p.id} className="border-b border-white/5 last:border-0">
                  <button onClick={() => loadPlaylistTracks(p)} className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition flex items-center gap-3">
                    {p.image ? <img src={p.image} alt="" className="w-10 h-10 rounded-lg flex-shrink-0" /> : <div className="w-10 h-10 rounded-lg bg-white/5 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{p.name}</p>
                      <p className="text-white/30 text-[10px] font-mono">{p.trackCount} tracks</p>
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
        <h2 className="text-[9px] font-mono text-white/30 tracking-[0.2em]">UP NEXT</h2>
        {queue.length > 0 && <span className="text-white/20 text-[10px] font-mono">{queue.length}</span>}
      </div>
      {queue.length === 0 ? (
        <p className="text-white/15 text-center py-10 text-[11px] font-mono tracking-wider">Nothing here yet</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {queue.map((song, i) => (
            <li key={song.id} className="flex items-center bg-[#121210] border-b border-white/5 px-3 py-2.5 gap-2.5 group rounded-lg">
              <span className="text-white/15 text-[10px] w-4 text-center font-mono flex-shrink-0">{i + 1}</span>
              {song.albumArt && <img src={song.albumArt} alt="" className="w-10 h-10 rounded-lg flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{song.title}</p>
                <p className="text-white/40 text-xs truncate">
                  {song.artist}
                  {song.addedBy && <span className="text-white/15 font-mono ml-1.5">queued by {song.addedBy}</span>}
                </p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button onClick={() => vote(song.id, "up")} className={`p-2 transition ${myVotes[song.id] === "up" ? "" : "text-white/20 hover:text-white/60"}`} style={myVotes[song.id] === "up" ? { color: accent } : {}}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3L3 10h10L8 3z"/></svg>
                </button>
                <span className="text-white/60 text-[11px] font-mono w-5 text-center">{song.votes}</span>
                <button onClick={() => vote(song.id, "down")} className={`p-2 transition ${myVotes[song.id] === "down" ? "text-red-400" : "text-white/20 hover:text-red-400"}`}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 13L3 6h10L8 13z"/></svg>
                </button>
              </div>
              {isHost && (
                <button onClick={() => removeSong(song.id)} className="text-white/10 hover:text-red-400 transition md:opacity-0 md:group-hover:opacity-100 flex-shrink-0 p-1">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
