import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Image, FlatList, ScrollView,
  StyleSheet, Alert, Clipboard, Dimensions, Linking,
} from "react-native";
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
  const [connectionState, setConnectionState] = useState("connected");
  const isGuest = !getToken;
  const debounceRef = useRef(null);
  const toastRef = useRef(null);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }

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
    socket.on("add-duplicate", (title) => showToast(`"${title}" is already queued — counted as a vote`));
    socket.on("song-removed-by-votes", () => showToast("Song removed — too many downvotes"));
    socket.on("permission-error", (msg) => showToast(msg));

    // --- Connection state & auto-rejoin ---
    const handleDisconnect = () => setConnectionState("reconnecting");
    const handleReconnect = () => {
      setConnectionState("connected");
      // Re-join the lobby with the same user name so host status is reclaimed
      socket.emit("join-lobby", { code, name: user?.name });
    };
    socket.on("disconnect", handleDisconnect);
    socket.on("connect", handleReconnect);
    socket.io.on("reconnect_attempt", () => setConnectionState("reconnecting"));

    return () => {
      socket.off("lobby-state");
      socket.off("queue-updated");
      socket.off("users-updated");
      socket.off("now-playing");
      socket.off("add-error");
      socket.off("add-duplicate");
      socket.off("song-removed-by-votes");
      socket.off("permission-error");
      socket.off("disconnect", handleDisconnect);
      socket.off("connect", handleReconnect);
      socket.io.off("reconnect_attempt");
    };
  }, [code, user?.name]);

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

      {/* Reconnecting banner */}
      {connectionState === "reconnecting" && (
        <View style={s.reconnectBanner}>
          <Text style={s.reconnectText}>Reconnecting...</Text>
        </View>
      )}

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <View style={s.titleRow}>
              <Text style={s.headerTitle}>PARTYTIME</Text>
              {isHost ? (
                <Text style={s.hostLabel}>"HOST"</Text>
              ) : isGuest ? (
                <Text style={s.guestLabel}>"GUEST"</Text>
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
                  <Text style={s.npLabel}>"NOW PLAYING"</Text>
                  <Text style={s.npTitle} numberOfLines={1}>{nowPlaying.title}</Text>
                  <Text style={s.npArtist} numberOfLines={1}>{nowPlaying.artist}</Text>
                  {nowPlaying.addedBy && (
                    <Text style={s.npAddedBy}>via {nowPlaying.addedBy}</Text>
                  )}
                </View>
                {isHost && (
                  <TouchableOpacity style={s.skipBtn} onPress={skip} activeOpacity={0.7}>
                    <Text style={s.skipText}>SKIP</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Play / Pause controls */}
              {nowPlaying.spotifyId && !isGuest && (
                <View style={s.playerControls}>
                  <TouchableOpacity
                    style={s.playBtn}
                    onPress={async () => {
                      try {
                        const token = await getToken();
                        await fetch("https://api.spotify.com/v1/me/player/play", {
                          method: "PUT",
                          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                          body: JSON.stringify({ uris: [`spotify:track:${nowPlaying.spotifyId}`] }),
                        });
                      } catch { showToast("Open Spotify to connect a device"); }
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={s.playBtnIcon}>▶</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.pauseBtn}
                    onPress={async () => {
                      try {
                        const token = await getToken();
                        await fetch("https://api.spotify.com/v1/me/player/pause", {
                          method: "PUT",
                          headers: { Authorization: `Bearer ${token}` },
                        });
                      } catch {}
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={s.pauseBtnIcon}>❚❚</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <View style={s.npEmpty}>
              {queue.length > 0 && isHost ? (
                <>
                  <Text style={s.npEmptyLabel}>"QUEUE READY"</Text>
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

        {/* Search Tab */}
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

        {/* Liked Tab (host only) */}
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

        {/* Playlists Tab (host only) */}
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

        {/* Queue */}
        <View style={s.queueHeader}>
          <Text style={s.queueLabel}>"UP NEXT"</Text>
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

  // Toast
  toast: {
    position: "absolute", top: 50, left: 20, right: 20, zIndex: 100,
    backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(42,42,42,0.5)",
    borderRadius: 20, padding: 14, alignItems: "center",
  },
  toastText: { color: "#fff", fontSize: 13, fontWeight: "300", letterSpacing: 0.3 },

  // Reconnect banner
  reconnectBanner: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 99,
    backgroundColor: "rgba(212, 136, 74, 0.15)",
    borderBottomWidth: 1, borderBottomColor: "rgba(212, 136, 74, 0.4)",
    paddingVertical: 8, alignItems: "center",
  },
  reconnectText: {
    color: "#D4884A", fontSize: 12, fontWeight: "400", letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800", fontFamily: "monospace", letterSpacing: 1 },
  hostLabel: { color: "#c96442", fontSize: 9, fontFamily: "monospace", letterSpacing: 2 },
  guestLabel: { color: "rgba(136,136,136,0.6)", fontSize: 9, fontFamily: "monospace", letterSpacing: 2 },
  codeText: { color: "rgba(136,136,136,0.6)", fontSize: 11, fontFamily: "monospace", letterSpacing: 4, marginTop: 4 },
  codeTap: { color: "rgba(136,136,136,0.3)" },
  leaveText: { color: "rgba(136,136,136,0.5)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1.5 },

  // Users
  usersRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 20 },
  userChip: { backgroundColor: "#161616", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  userChipText: { color: "rgba(136,136,136,0.7)", fontSize: 10, fontFamily: "monospace", letterSpacing: 0.5 },

  // Now Playing
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
  skipBtn: {
    borderWidth: 1, borderColor: "rgba(42,42,42,0.5)", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  skipText: { color: "rgba(136,136,136,0.6)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1.5 },
  playerControls: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  playBtn: {
    flex: 1, backgroundColor: "#c96442", borderRadius: 14,
    paddingVertical: 12, alignItems: "center", justifyContent: "center",
    flexDirection: "row", gap: 8,
  },
  playBtnIcon: { color: "#fff", fontSize: 14 },
  pauseBtn: {
    backgroundColor: "rgba(42,42,42,0.5)", borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 20, alignItems: "center",
  },
  pauseBtnIcon: { color: "rgba(136,136,136,0.7)", fontSize: 12 },
  npEmpty: { alignItems: "center", paddingVertical: 8 },
  npEmptyLabel: { color: "rgba(136,136,136,0.4)", fontSize: 11, fontFamily: "monospace", letterSpacing: 2, marginBottom: 12 },
  npEmptyText: { color: "rgba(136,136,136,0.3)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 },
  playNextBtn: { backgroundColor: "#c96442", paddingHorizontal: 32, paddingVertical: 12, borderRadius: 14 },
  playNextText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Tabs
  tabs: {
    flexDirection: "row", backgroundColor: "#161616", borderRadius: 20,
    padding: 4, marginBottom: 12, gap: 4,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 14, alignItems: "center" },
  tabActive: { backgroundColor: "#222" },
  tabText: { color: "rgba(136,136,136,0.5)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1 },
  tabTextActive: { color: "#fff" },

  // Search
  searchInput: {
    backgroundColor: "#161616", borderWidth: 1, borderColor: "rgba(42,42,42,0.5)",
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14,
    color: "#fff", fontSize: 14, marginBottom: 8,
  },
  searchingText: { color: "rgba(136,136,136,0.4)", fontSize: 12, fontFamily: "monospace", textAlign: "center", paddingVertical: 8 },

  // Song rows
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

  // Queue
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

  // Shared
  loadingText: { color: "rgba(136,136,136,0.4)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1, textAlign: "center", paddingVertical: 40 },
  emptyText: { color: "rgba(136,136,136,0.2)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1, textAlign: "center", paddingVertical: 40 },
  backBtn: { paddingVertical: 8, marginBottom: 4 },
  backText: { color: "rgba(136,136,136,0.5)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1 },
});
