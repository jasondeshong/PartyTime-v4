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
    socket.on("add-duplicate", (title) => showToast(`"${title}" — voted up`));
    socket.on("song-removed-by-votes", () => showToast("Song removed by votes"));

    return () => {
      socket.off("lobby-state");
      socket.off("queue-updated");
      socket.off("users-updated");
      socket.off("now-playing");
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
              <Text style={s.headerTitle}>PartyTime</Text>
              {isHost ? (
                <View style={s.hostBadge}>
                  <Text style={s.hostText}>HOST</Text>
                </View>
              ) : isGuest ? (
                <View style={s.guestBadge}>
                  <Text style={s.guestText}>GUEST</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity onPress={copyCode}>
              <Text style={s.codeText}>{code} <Text style={s.codeTap}>tap to copy</Text></Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onLeave}>
            <Text style={s.leaveText}>Leave</Text>
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
                    <Text style={s.npAddedBy}>added by {nowPlaying.addedBy}</Text>
                  )}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {isHost && (
                    <TouchableOpacity style={s.skipBtn} onPress={skip} activeOpacity={0.7}>
                      <Text style={s.skipText}>Skip</Text>
                    </TouchableOpacity>
                  )}
                  {nowPlaying.spotifyId && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`https://open.spotify.com/track/${nowPlaying.spotifyId}`)}
                      activeOpacity={0.7}
                      style={s.spotifyLink}
                    >
                      <Text style={s.spotifyLinkText}>♫</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </>
          ) : (
            <View style={s.npEmpty}>
              {queue.length > 0 && isHost ? (
                <>
                  <Text style={s.npEmptyText}>Queue ready</Text>
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
          <Text style={s.queueLabel}>UP NEXT</Text>
          {queue.length > 0 && (
            <Text style={s.queueCount}>{queue.length} track{queue.length !== 1 ? "s" : ""}</Text>
          )}
        </View>
        {queue.length === 0 ? (
          <Text style={s.emptyText}>Queue is empty</Text>
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
    backgroundColor: "#161616", borderWidth: 1, borderColor: "#2a2a2a",
    borderRadius: 14, padding: 12, alignItems: "center",
  },
  toastText: { color: "#fff", fontSize: 13 },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  hostBadge: { backgroundColor: "rgba(201,100,66,0.15)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  hostText: { color: "#c96442", fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  guestBadge: { backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  guestText: { color: "#888", fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  codeText: { color: "#888", fontSize: 11, fontFamily: "monospace", letterSpacing: 3, marginTop: 2 },
  codeTap: { color: "rgba(136,136,136,0.5)" },
  leaveText: { color: "#888", fontSize: 12 },

  // Users
  usersRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  userChip: { backgroundColor: "#161616", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  userChipText: { color: "#888", fontSize: 11 },

  // Now Playing
  nowPlaying: {
    backgroundColor: "#161616", borderWidth: 1, borderColor: "#2a2a2a",
    borderRadius: 14, padding: 16, marginBottom: 16,
  },
  npRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  npArt: { width: 56, height: 56, borderRadius: 10 },
  npInfo: { flex: 1 },
  npLabel: { color: "#c96442", fontSize: 9, fontWeight: "700", letterSpacing: 1.5, marginBottom: 2 },
  npTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  npArtist: { color: "#888", fontSize: 13 },
  npAddedBy: { color: "rgba(136,136,136,0.5)", fontSize: 11, marginTop: 2 },
  skipBtn: {
    borderWidth: 1, borderColor: "#2a2a2a", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  skipText: { color: "#888", fontSize: 13, fontWeight: "500" },
  npEmpty: { alignItems: "center" },
  npEmptyText: { color: "rgba(136,136,136,0.5)", fontSize: 13, marginBottom: 8 },
  playNextBtn: { backgroundColor: "#c96442", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  playNextText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  spotifyLink: { padding: 8 },
  spotifyLinkText: { color: "#1DB954", fontSize: 18 },

  // Tabs
  tabs: {
    flexDirection: "row", backgroundColor: "#161616", borderRadius: 14,
    padding: 4, marginBottom: 12, gap: 4,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  tabActive: { backgroundColor: "#222" },
  tabText: { color: "#888", fontSize: 12, fontWeight: "500" },
  tabTextActive: { color: "#fff" },

  // Search
  searchInput: {
    backgroundColor: "#161616", borderWidth: 1, borderColor: "#2a2a2a",
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    color: "#fff", fontSize: 14, marginBottom: 8,
  },
  searchingText: { color: "#888", fontSize: 12, textAlign: "center", paddingVertical: 8 },

  // Song rows (search results, liked, playlists)
  songRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: "rgba(42,42,42,0.5)",
  },
  songArt: { width: 40, height: 40, borderRadius: 8 },
  songInfo: { flex: 1 },
  songTitle: { color: "#fff", fontSize: 14 },
  songArtist: { color: "#888", fontSize: 12 },
  songDuration: { color: "rgba(136,136,136,0.5)", fontSize: 11 },

  // Queue
  queueHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, marginBottom: 12 },
  queueLabel: { color: "#888", fontSize: 12, fontWeight: "700", letterSpacing: 1.5 },
  queueCount: { color: "rgba(136,136,136,0.5)", fontSize: 11 },
  queueItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#161616", borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
  },
  queueNum: { color: "rgba(136,136,136,0.4)", fontSize: 11, width: 16, textAlign: "center", fontFamily: "monospace" },
  addedBy: { color: "rgba(136,136,136,0.4)" },
  voteGroup: { flexDirection: "row", alignItems: "center", gap: 2 },
  voteBtn: { padding: 8 },
  voteArrow: { color: "#888", fontSize: 12 },
  voteUp: { color: "#4ade80" },
  voteDown: { color: "#f87171" },
  voteCount: { color: "#fff", fontSize: 12, fontWeight: "600", width: 24, textAlign: "center" },
  removeBtn: { padding: 6 },
  removeText: { color: "rgba(136,136,136,0.3)", fontSize: 12 },

  // Shared
  loadingText: { color: "#888", fontSize: 13, textAlign: "center", paddingVertical: 32 },
  emptyText: { color: "rgba(136,136,136,0.4)", fontSize: 13, textAlign: "center", paddingVertical: 32 },
  backBtn: { paddingVertical: 8, marginBottom: 4 },
  backText: { color: "#888", fontSize: 13 },
});
