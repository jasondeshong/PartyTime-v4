import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Image, FlatList, ScrollView,
  StyleSheet, Clipboard, Dimensions, Linking, AppState,
} from "react-native";
import * as SpotifyRemote from "expo-spotify-app-remote";
import socket from "./socket";
import api from "./api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function LobbyScreen({ code, isHost, user, initialState, getToken, onLeave }) {
  const [queue, setQueue] = useState(initialState?.queue || []);
  const [users, setUsers] = useState(initialState?.users || []);
  const [nowPlaying, setNowPlaying] = useState(initialState?.nowPlaying || null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [myVotes, setMyVotes] = useState({});
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState("search");
  const [likedSongs, setLikedSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const isGuest = !getToken;
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [saved, setSaved] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const debounceRef = useRef(null);
  const toastRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const nowPlayingRef = useRef(nowPlaying);
  const skipFiredRef = useRef(null);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }

  // Keep nowPlayingRef in sync
  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
    setSaved(false);
    skipFiredRef.current = null;
  }, [nowPlaying?.spotifyId]);

  // --- Spotify App Remote connection + player state subscription ---
  useEffect(() => {
    if (isGuest || !getToken) return;

    let playerSub;
    let connSub;

    async function connectRemote() {
      try {
        const token = await getToken();
        if (!token) return;
        await SpotifyRemote.connect(token);
        setRemoteConnected(true);

        // Subscribe to real-time player state (no polling needed)
        await SpotifyRemote.subscribeToPlayerState();
        playerSub = SpotifyRemote.addPlayerStateListener((state) => {
          setIsPlaying(!state.isPaused);
          setDuration(state.durationMs || 0);
          setPosition(state.positionMs || 0);
          if (state.durationMs) {
            setProgress(state.positionMs / state.durationMs);
          }
          // Auto-advance: song ended
          if (state.isPaused && state.durationMs > 0 && state.positionMs >= state.durationMs - 1500) {
            const np = nowPlayingRef.current;
            if (np?.spotifyId && skipFiredRef.current !== np.spotifyId) {
              skipFiredRef.current = np.spotifyId;
              socket.emit("skip", code);
            }
          }
        });

        connSub = SpotifyRemote.addConnectionListener((event) => {
          setRemoteConnected(event.connected);
          if (!event.connected) {
            // Try to reconnect
            setTimeout(async () => {
              try {
                const t = await getToken();
                if (t) await SpotifyRemote.connect(t);
              } catch {}
            }, 2000);
          }
        });
      } catch {
        setRemoteConnected(false);
        showToast("Open Spotify once, then come back");
      }
    }

    connectRemote();

    return () => {
      playerSub?.remove();
      connSub?.remove();
      SpotifyRemote.unsubscribeFromPlayerState().catch(() => {});
      SpotifyRemote.disconnect().catch(() => {});
    };
  }, [isGuest]);

  // AppState: reconnect when returning from background
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        if (!socket.connected) socket.connect();
        socket.emit("rejoin", code);
        // Reconnect App Remote if needed
        if (!isGuest && getToken && !remoteConnected) {
          try {
            const token = await getToken();
            if (token) await SpotifyRemote.connect(token);
          } catch {}
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [code, isGuest, remoteConnected]);

  // Save to library
  async function saveToLibrary() {
    if (!getToken || !nowPlaying?.spotifyId || saved) return;
    try {
      const token = await getToken();
      const res = await fetch("https://api.spotify.com/v1/me/tracks", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [nowPlaying.spotifyId] }),
      });
      if (res.ok || res.status === 200) {
        setSaved(true);
        showToast(`"${nowPlaying.title}" saved to library`);
      } else {
        showToast("Couldn't save — try again");
      }
    } catch {
      showToast("Couldn't save — try again");
    }
  }

  // Play via App Remote (no app switching)
  async function handlePlay() {
    if (!getToken || !nowPlaying?.spotifyId) return;
    try {
      await SpotifyRemote.play(`spotify:track:${nowPlaying.spotifyId}`);
      setIsPlaying(true);
    } catch {
      // Fallback: try reconnecting first
      try {
        const token = await getToken();
        await SpotifyRemote.connect(token);
        await SpotifyRemote.play(`spotify:track:${nowPlaying.spotifyId}`);
        setIsPlaying(true);
        setRemoteConnected(true);
      } catch {
        showToast("Open Spotify once, then come back");
      }
    }
  }

  async function handlePause() {
    try {
      await SpotifyRemote.pause();
      setIsPlaying(false);
    } catch {}
  }

  // Auto-play when now playing changes
  useEffect(() => {
    if (isGuest || !nowPlaying?.spotifyId || !getToken) return;
    const t = setTimeout(() => handlePlay(), 300);
    return () => clearTimeout(t);
  }, [nowPlaying?.spotifyId]);

  useEffect(() => {
    socket.on("lobby-state", (lobby) => {
      setQueue(lobby.queue);
      setUsers(lobby.users);
      setNowPlaying(lobby.nowPlaying);
    });
    socket.on("queue-updated", (q) => setQueue(q));
    socket.on("users-updated", (u) => setUsers(u));
    socket.on("now-playing", (np) => setNowPlaying(np));
    socket.on("add-error", (msg) => showToast(msg));
    socket.on("add-duplicate", ({ title, songId }) => {
      showToast(`"${title}" is already queued — counted as a vote`);
      if (songId) setMyVotes((v) => ({ ...v, [songId]: "up" }));
    });
    socket.on("song-removed-by-votes", () => showToast("Song removed — too many downvotes"));
    socket.on("lobby-closed", () => {
      showToast("Host left — lobby closed");
      setTimeout(onLeave, 2000);
    });

    return () => {
      socket.off("lobby-state");
      socket.off("queue-updated");
      socket.off("users-updated");
      socket.off("now-playing");
      socket.off("add-error");
      socket.off("add-duplicate");
      socket.off("song-removed-by-votes");
      socket.off("lobby-closed");
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
    if (myVotes[songId] === direction) return;
    setMyVotes((v) => ({ ...v, [songId]: direction }));
    socket.emit("vote", { code, songId, direction });
  }

  function removeSong(songId) {
    socket.emit("remove-song", { code, songId });
  }

  function skip() {
    socket.emit("skip", code);
  }

  function copyCode() {
    Clipboard.setString(code);
    showToast("Code copied!");
  }

  function fmt(ms) {
    if (!ms) return "0:00";
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }

  function SongRow({ song }) {
    return (
      <TouchableOpacity style={s.songRow} onPress={() => addSong(song)} activeOpacity={0.6}>
        {song.albumArt ? (
          <Image source={{ uri: song.albumArt }} style={s.songArt} />
        ) : (
          <View style={[s.songArt, { backgroundColor: "#2a2a2a" }]} />
        )}
        <View style={s.songInfo}>
          <Text style={s.songTitle} numberOfLines={1}>{song.title}</Text>
          <Text style={s.songArtist} numberOfLines={1}>{song.artist}</Text>
        </View>
        <Text style={s.songDuration}>{fmt(song.duration)}</Text>
      </TouchableOpacity>
    );
  }

  function QueueItem({ song, index }) {
    return (
      <View style={s.queueItem}>
        <Text style={s.queueNum}>{index + 1}</Text>
        {song.albumArt ? (
          <Image source={{ uri: song.albumArt }} style={s.songArt} />
        ) : (
          <View style={[s.songArt, { backgroundColor: "#2a2a2a" }]} />
        )}
        <View style={s.songInfo}>
          <Text style={s.songTitle} numberOfLines={1}>{song.title}</Text>
          <Text style={s.songArtist} numberOfLines={1}>
            {song.artist}
            {song.addedBy ? <Text style={s.addedBy}> {song.addedBy}</Text> : null}
          </Text>
        </View>
        <View style={s.voteGroup}>
          <TouchableOpacity onPress={() => vote(song.id, "up")} style={s.voteBtn}>
            <Text style={[s.voteArrow, myVotes[song.id] === "up" && s.voteUp]}>▲</Text>
          </TouchableOpacity>
          <Text style={s.voteCount}>{song.votes}</Text>
          <TouchableOpacity onPress={() => vote(song.id, "down")} style={s.voteBtn}>
            <Text style={[s.voteArrow, myVotes[song.id] === "down" && s.voteDown]}>▼</Text>
          </TouchableOpacity>
        </View>
        {isHost && (
          <TouchableOpacity onPress={() => removeSong(song.id)} style={s.removeBtn}>
            <Text style={s.removeText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Toast */}
      {toast && (
        <View style={s.toast}>
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <View style={s.titleRow}>
              <Text style={s.headerTitle}>PARTYTIME</Text>
              {isHost ? (
                <Text style={s.hostLabel}>HOST</Text>
              ) : isGuest ? (
                <Text style={s.guestLabel}>GUEST</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={copyCode}>
              <Text style={s.codeText}>{code} <Text style={s.codeTap}>tap to copy</Text></Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onLeave}>
            <Text style={s.leaveText}>LEAVE</Text>
          </TouchableOpacity>
        </View>

        {/* Users */}
        <View style={s.usersRow}>
          {users.map((u) => (
            <View key={u.id} style={s.userChip}>
              <Text style={s.userChipText}>{u.name}</Text>
            </View>
          ))}
        </View>

        {/* Now Playing */}
        <View style={s.nowPlaying}>
          {nowPlaying ? (
            <>
              <View style={s.npRow}>
                {nowPlaying.albumArt && (
                  <Image source={{ uri: nowPlaying.albumArt }} style={s.npArt} />
                )}
                <View style={s.npInfo}>
                  <Text style={s.npLabel}>NOW PLAYING</Text>
                  <Text style={s.npTitle} numberOfLines={1}>{nowPlaying.title}</Text>
                  <Text style={s.npArtist} numberOfLines={1}>{nowPlaying.artist}</Text>
                  {nowPlaying.addedBy && (
                    <Text style={s.npAddedBy}>via {nowPlaying.addedBy}</Text>
                  )}
                </View>
                {!isGuest && (
                  <TouchableOpacity style={[s.saveBtn, saved && s.saveBtnSaved]} onPress={saveToLibrary} activeOpacity={0.7}>
                    <Text style={[s.saveBtnIcon, saved && s.saveBtnIconSaved]}>{saved ? "✓" : "+"}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Player controls */}
              {nowPlaying.spotifyId && !isGuest && (
                <View style={s.playerControls}>
                  <View style={s.progressRow}>
                    <Text style={s.progressTime}>{fmt(position)}</Text>
                    <View style={s.progressTrack}>
                      <View style={[s.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
                    </View>
                    <Text style={s.progressTime}>{fmt(duration)}</Text>
                  </View>
                  <View style={s.controlsRow}>
                    <TouchableOpacity
                      style={s.playBtn}
                      onPress={isPlaying ? handlePause : handlePlay}
                      activeOpacity={0.8}
                    >
                      <Text style={s.playBtnIcon}>{isPlaying ? "❚❚" : "▶"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.skipControlBtn}
                      onPress={skip}
                      activeOpacity={0.7}
                    >
                      <Text style={s.skipControlText}>▶▶</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {nowPlaying.spotifyId && isGuest && progress > 0 && (
                <View style={s.progressRowGuest}>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
                  </View>
                </View>
              )}
            </>
          ) : (
            <View style={s.npEmpty}>
              {queue.length > 0 && isHost ? (
                <>
                  <Text style={s.npEmptyLabel}>QUEUE READY</Text>
                  <TouchableOpacity style={s.playNextBtn} onPress={skip} activeOpacity={0.8}>
                    <Text style={s.playNextText}>Play Next</Text>
                  </TouchableOpacity>
                </>
              ) : queue.length > 0 ? (
                <Text style={s.npEmptyText}>Waiting for host to start</Text>
              ) : (
                <Text style={s.npEmptyText}>Search and add a song to start</Text>
              )}
            </View>
          )}
        </View>

        {/* Tabs */}
        <View style={s.tabs}>
          {(isGuest ? ["search"] : ["search", "liked", "playlists"]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.tab, tab === t && s.tabActive]}
              onPress={() => { setTab(t); setSelectedPlaylist(null); }}
            >
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === "search" && (
          <View>
            <TextInput
              style={s.searchInput}
              placeholder="Search Spotify..."
              placeholderTextColor="#888"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              returnKeyType="search"
            />
            {searching && <Text style={s.searchingText}>Searching...</Text>}
            {results.map((song) => (
              <SongRow key={song.spotifyId} song={song} />
            ))}
          </View>
        )}

        {tab === "liked" && !isGuest && (
          <View>
            {loadingLibrary ? (
              <Text style={s.loadingText}>Loading...</Text>
            ) : likedSongs.length === 0 ? (
              <Text style={s.emptyText}>No liked songs found</Text>
            ) : (
              likedSongs.map((song) => (
                <SongRow key={song.spotifyId} song={song} />
              ))
            )}
          </View>
        )}

        {tab === "playlists" && !isGuest && (
          <View>
            {loadingLibrary ? (
              <Text style={s.loadingText}>Loading...</Text>
            ) : selectedPlaylist ? (
              <>
                <TouchableOpacity
                  style={s.backBtn}
                  onPress={() => { setSelectedPlaylist(null); setPlaylistTracks([]); }}
                >
                  <Text style={s.backText}>← {selectedPlaylist.name}</Text>
                </TouchableOpacity>
                {playlistTracks.map((song) => (
                  <SongRow key={song.spotifyId} song={song} />
                ))}
              </>
            ) : playlists.length === 0 ? (
              <Text style={s.emptyText}>No playlists found</Text>
            ) : (
              playlists.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={s.songRow}
                  onPress={() => loadPlaylistTracks(p)}
                  activeOpacity={0.6}
                >
                  {p.image ? (
                    <Image source={{ uri: p.image }} style={s.songArt} />
                  ) : (
                    <View style={[s.songArt, { backgroundColor: "#2a2a2a" }]} />
                  )}
                  <View style={s.songInfo}>
                    <Text style={s.songTitle} numberOfLines={1}>{p.name}</Text>
                    <Text style={s.songArtist}>{p.trackCount} tracks</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <View style={s.queueHeader}>
          <Text style={s.queueLabel}>UP NEXT</Text>
          {queue.length > 0 && (
            <Text style={s.queueCount}>{queue.length} track{queue.length !== 1 ? "s" : ""}</Text>
          )}
        </View>
        {queue.length === 0 ? (
          <Text style={s.emptyText}>Nothing here yet</Text>
        ) : (
          queue.map((song, i) => (
            <QueueItem key={song.id} song={song} index={i} />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 60 },
  toast: {
    position: "absolute", top: 50, left: 20, right: 20, zIndex: 100,
    backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(42,42,42,0.5)",
    borderRadius: 20, padding: 14, alignItems: "center",
  },
  toastText: { color: "#fff", fontSize: 13, fontWeight: "300", letterSpacing: 0.3 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800", fontFamily: "monospace", letterSpacing: 1 },
  hostLabel: { color: "#c96442", fontSize: 9, fontFamily: "monospace", letterSpacing: 2 },
  guestLabel: { color: "rgba(136,136,136,0.6)", fontSize: 9, fontFamily: "monospace", letterSpacing: 2 },
  codeText: { color: "rgba(136,136,136,0.6)", fontSize: 11, fontFamily: "monospace", letterSpacing: 4, marginTop: 4 },
  codeTap: { color: "rgba(136,136,136,0.3)" },
  leaveText: { color: "rgba(136,136,136,0.5)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1.5 },
  usersRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 20 },
  userChip: { backgroundColor: "#161616", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  userChipText: { color: "rgba(136,136,136,0.7)", fontSize: 10, fontFamily: "monospace", letterSpacing: 0.5 },
  nowPlaying: {
    backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(42,42,42,0.5)",
    borderRadius: 20, padding: 16, marginBottom: 20,
  },
  npRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  npArt: { width: 56, height: 56, borderRadius: 14 },
  npInfo: { flex: 1 },
  npLabel: { color: "#c96442", fontSize: 9, fontWeight: "700", letterSpacing: 2, marginBottom: 3, fontFamily: "monospace" },
  npTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  npArtist: { color: "rgba(136,136,136,0.7)", fontSize: 13 },
  npAddedBy: { color: "rgba(136,136,136,0.3)", fontSize: 11, marginTop: 2, fontFamily: "monospace" },
  saveBtn: {
    borderWidth: 1, borderColor: "rgba(42,42,42,0.5)", borderRadius: 14,
    width: 36, height: 36, alignItems: "center", justifyContent: "center",
  },
  saveBtnSaved: { borderColor: "#c96442" },
  saveBtnIcon: { color: "rgba(136,136,136,0.6)", fontSize: 20, fontWeight: "300", marginTop: -1 },
  saveBtnIconSaved: { color: "#c96442", fontSize: 16 },
  playerControls: { marginTop: 14 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  progressRowGuest: { marginTop: 12 },
  progressTime: { color: "rgba(136,136,136,0.4)", fontSize: 9, fontFamily: "monospace", width: 32, textAlign: "center" },
  progressTrack: { flex: 1, height: 3, backgroundColor: "rgba(42,42,42,0.5)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#c96442", borderRadius: 2 },
  controlsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  playBtn: {
    flex: 1, backgroundColor: "#c96442", borderRadius: 14,
    paddingVertical: 12, alignItems: "center",
  },
  playBtnIcon: { color: "#fff", fontSize: 16 },
  skipControlBtn: {
    backgroundColor: "rgba(42,42,42,0.5)", borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 20, alignItems: "center",
  },
  skipControlText: { color: "rgba(136,136,136,0.7)", fontSize: 12 },
  npEmpty: { alignItems: "center", paddingVertical: 8 },
  npEmptyLabel: { color: "rgba(136,136,136,0.4)", fontSize: 11, fontFamily: "monospace", letterSpacing: 2, marginBottom: 12 },
  npEmptyText: { color: "rgba(136,136,136,0.3)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 },
  playNextBtn: { backgroundColor: "#c96442", paddingHorizontal: 32, paddingVertical: 12, borderRadius: 14 },
  playNextText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  tabs: {
    flexDirection: "row", backgroundColor: "#161616", borderRadius: 20,
    padding: 4, marginBottom: 12, gap: 4,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 14, alignItems: "center" },
  tabActive: { backgroundColor: "#222" },
  tabText: { color: "rgba(136,136,136,0.5)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1 },
  tabTextActive: { color: "#fff" },
  searchInput: {
    backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(42,42,42,0.5)",
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12,
    color: "#fff", fontSize: 15, marginBottom: 8,
  },
  searchingText: { color: "rgba(136,136,136,0.4)", fontSize: 12, fontFamily: "monospace", textAlign: "center", paddingVertical: 8 },
  songRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: "rgba(42,42,42,0.3)",
  },
  songArt: { width: 40, height: 40, borderRadius: 12 },
  songInfo: { flex: 1 },
  songTitle: { color: "#fff", fontSize: 14 },
  songArtist: { color: "rgba(136,136,136,0.5)", fontSize: 12 },
  songDuration: { color: "rgba(136,136,136,0.25)", fontSize: 10, fontFamily: "monospace" },
  queueHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4, marginBottom: 12 },
  queueLabel: { color: "rgba(136,136,136,0.5)", fontSize: 9, fontFamily: "monospace", letterSpacing: 2 },
  queueCount: { color: "rgba(136,136,136,0.3)", fontSize: 10, fontFamily: "monospace" },
  queueItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#161616", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
  },
  queueNum: { color: "rgba(136,136,136,0.25)", fontSize: 10, width: 16, textAlign: "center", fontFamily: "monospace" },
  addedBy: { color: "rgba(136,136,136,0.25)", fontFamily: "monospace" },
  voteGroup: { flexDirection: "row", alignItems: "center", gap: 2 },
  voteBtn: { padding: 8 },
  voteArrow: { color: "rgba(136,136,136,0.3)", fontSize: 11 },
  voteUp: { color: "#c96442" },
  voteDown: { color: "#f87171" },
  voteCount: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "monospace", width: 20, textAlign: "center" },
  removeBtn: { padding: 6 },
  removeText: { color: "rgba(136,136,136,0.2)", fontSize: 12 },
  loadingText: { color: "rgba(136,136,136,0.4)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1, textAlign: "center", paddingVertical: 40 },
  emptyText: { color: "rgba(136,136,136,0.2)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1, textAlign: "center", paddingVertical: 40 },
  backBtn: { paddingVertical: 8, marginBottom: 4 },
  backText: { color: "rgba(136,136,136,0.5)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1 },
});
