import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Image, FlatList, ScrollView,
  StyleSheet, Clipboard, Dimensions, Linking, AppState, Platform, Animated,
  KeyboardAvoidingView,
} from "react-native";
import * as SpotifyRemote from "expo-spotify-app-remote";

import socket from "./socket";
import api from "./api";
import { palette, fonts, radius, glow, space } from "./theme";
import { ShenRing, Scarab } from "./Symbols";
import { GlassCard, ScanLines, DotMatrix } from "./Glass";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ALBUM_SIZE = SCREEN_WIDTH * 0.48;

export default function LobbyScreen({ code, isHost, user, initialState, getToken, onLeave, onConnectSpotify }) {
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
  // isHost = playback control (skip, pause, App Remote)
  // hasToken = library access (liked, playlists, save)
  // A guest with Spotify connected: isHost=false, hasToken=true
  const hasToken = !!getToken;
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [saved, setSaved] = useState(false);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [albumHistory, setAlbumHistory] = useState([]);
  const deckAnim = useRef(new Animated.Value(0)).current;
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

  // Keep nowPlayingRef in sync + build album carousel history
  useEffect(() => {
    nowPlayingRef.current = nowPlaying;
    setSaved(false);
    skipFiredRef.current = null;
    if (nowPlaying?.albumArt) {
      setAlbumHistory((prev) => {
        const filtered = prev.filter((a) => a.spotifyId !== nowPlaying.spotifyId);
        return [{ spotifyId: nowPlaying.spotifyId, art: nowPlaying.albumArt }, ...filtered].slice(0, 5);
      });
      // Animate the deck rotation
      deckAnim.setValue(0);
      Animated.spring(deckAnim, {
        toValue: 1,
        tension: 60,
        friction: 9,
        useNativeDriver: true,
      }).start();
    }
  }, [nowPlaying?.spotifyId]);

  // --- Spotify App Remote connection + player state subscription ---
  useEffect(() => {
    if (!isHost || !getToken) return;

    let playerSub;
    let connSub;
    let linkSub;
    let cancelled = false;

    async function subscribeAfterConnect() {
      try {
        await SpotifyRemote.subscribeToPlayerState();
      } catch (e) {
        // Non-fatal — player state may still come through connection listener
      }
      playerSub = SpotifyRemote.addPlayerStateListener((state) => {
        setIsPlaying(!state.isPaused);
        setDuration(state.durationMs || 0);
        setPosition(state.positionMs || 0);
        if (state.durationMs) {
          setProgress(state.positionMs / state.durationMs);
        }
        if (state.isPaused && state.durationMs > 0 && state.positionMs >= state.durationMs - 1500) {
          const np = nowPlayingRef.current;
          if (np?.spotifyId && skipFiredRef.current !== np.spotifyId) {
            skipFiredRef.current = np.spotifyId;
            socket.emit("skip", code);
          }
        }
      });
    }

    async function connectRemote() {
      try {
        const token = await getToken();
        if (!token) {
          showToast("Spotify sign-in expired — log in again");
          return;
        }
        try {
          await SpotifyRemote.connect(token);
          if (cancelled) return;
          setRemoteConnected(true);
          await subscribeAfterConnect();
        } catch (e) {
          if (cancelled) return;
          // First connect failed — user may not have authorized App Remote yet.
          // authorizeAndPlayURI opens Spotify briefly for a one-time grant,
          // then redirects back. After that, connect() works invisibly.
          showToast("Connecting to Spotify…");
          try {
            await SpotifyRemote.authorize("");
          } catch (e2) {
            const msg = e2?.message || e2?.code || String(e2);
            console.log(`[SpotifyRemote] authorize failed: ${msg}`);
            showToast(`Spotify auth failed: ${msg}`.slice(0, 180));
          }
        }
      } catch (e) {
        const msg = e?.message || e?.code || String(e);
        showToast(`Spotify init failed: ${msg}`.slice(0, 180));
      }
    }

    // Connection state events (fires on connect/disconnect/auth-URL completion)
    connSub = SpotifyRemote.addConnectionListener(async (event) => {
      if (cancelled) return;
      setRemoteConnected(!!event.connected);
      if (event.connected) {
        await subscribeAfterConnect();
      }
    });

    // When Spotify redirects back after authorize(), extract the
    // App Remote token from the URL and complete the connection.
    linkSub = Linking.addEventListener("url", ({ url }) => {
      if (!url) return;
      SpotifyRemote.handleAuthURL(url).catch(() => {});
    });
    Linking.getInitialURL().then((url) => {
      if (url) SpotifyRemote.handleAuthURL(url).catch(() => {});
    });

    connectRemote();

    return () => {
      cancelled = true;
      playerSub?.remove();
      connSub?.remove();
      linkSub?.remove();
      SpotifyRemote.unsubscribeFromPlayerState().catch(() => {});
      SpotifyRemote.disconnect().catch(() => {});
    };
  }, [isHost]);

  // AppState: reconnect when returning from background
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        if (!socket.connected) socket.connect();
        socket.emit("rejoin", code);
        // Reconnect App Remote if needed (host only)
        if (isHost && getToken && !remoteConnected) {
          try {
            const token = await getToken();
            if (token) await SpotifyRemote.connect(token);
          } catch (e) {
            // Silent — user will see disconnected state in UI
          }
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [code, isHost, remoteConnected]);

  // Save to library (any Spotify-connected user, not just host)
  async function saveToLibrary() {
    if (!hasToken || !nowPlaying?.spotifyId || saved) return;
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
        // Analytics: track discovery (song saved at venue)
        socket.emit("song-saved", {
          code,
          spotifyId: nowPlaying.spotifyId,
          title: nowPlaying.title,
          artist: nowPlaying.artist,
        });
      } else {
        showToast("Couldn't save — try again");
      }
    } catch {
      showToast("Couldn't save — try again");
    }
  }

  // Resume if paused, otherwise start fresh
  async function handlePlay() {
    if (!getToken || !nowPlaying?.spotifyId) return;
    const uri = `spotify:track:${nowPlaying.spotifyId}`;
    try {
      // If we were paused mid-track, resume instead of restarting
      if (position > 0 && duration > 0 && position < duration - 1500) {
        await SpotifyRemote.resume();
      } else {
        await SpotifyRemote.play(uri);
      }
      setIsPlaying(true);
    } catch (e1) {
      try {
        const token = await getToken();
        await SpotifyRemote.connect(token);
        await SpotifyRemote.play(uri);
        setIsPlaying(true);
        setRemoteConnected(true);
      } catch (e2) {
        const msg = e2?.message || e2?.code || String(e2);
        showToast(`Playback failed: ${msg}`.slice(0, 180));
      }
    }
  }

  async function handlePause() {
    try {
      await SpotifyRemote.pause();
      setIsPlaying(false);
    } catch (e) {
      const msg = e?.message || e?.code || String(e);
      showToast(`Pause failed: ${msg}`.slice(0, 180));
    }
  }

  // Auto-play when now playing changes — waits for remote to be connected
  useEffect(() => {
    if (!isHost || !nowPlaying?.spotifyId || !getToken || !remoteConnected) return;
    const t = setTimeout(() => handlePlay(), 300);
    return () => clearTimeout(t);
  }, [nowPlaying?.spotifyId, remoteConnected]);

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
    if (!hasToken) return;
    if (tab === "liked" && likedSongs.length === 0) loadLikedSongs();
    if (tab === "playlists" && playlists.length === 0) loadPlaylists();
  }, [tab, hasToken]);

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
          <View style={[s.songArt, { backgroundColor: palette.glass }]} />
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
      <GlassCard intensity={20} borderRadius={radius.button + 2} style={s.queueItem}>
        <Text style={s.queueNum}>{index + 1}</Text>
        {song.albumArt ? (
          <Image source={{ uri: song.albumArt }} style={s.songArt} />
        ) : (
          <View style={[s.songArt, { backgroundColor: palette.glass }]} />
        )}
        <View style={s.songInfo}>
          <Text style={s.songTitle} numberOfLines={1}>{song.title}</Text>
          <Text style={s.songArtist} numberOfLines={1}>
            {song.artist}
            {song.addedBy ? <Text style={s.addedBy}> queued by {song.addedBy}</Text> : null}
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
      </GlassCard>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Toast */}
      {toast && (
        <GlassCard intensity={60} borderRadius={radius.pill} style={s.toast}>
          <Text style={s.toastText}>{toast}</Text>
        </GlassCard>
      )}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <View style={s.titleRow}>
              <Text style={s.headerTitle}>PARTYTIME</Text>
              {isHost ? (
                <Text style={s.hostLabel}>HOST</Text>
              ) : (
                <Text style={s.guestLabel}>GUEST</Text>
              )}
            </View>
            <TouchableOpacity onPress={copyCode}>
              <Text style={s.codeText}>{code} <Text style={s.codeTap}>tap to copy</Text></Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={onLeave}>
            <Text style={s.leaveText}>LEAVE</Text>
          </TouchableOpacity>
        </View>

        {/* Users — cartouche-shaped chips */}
        <View style={s.usersRow}>
          {users.map((u) => (
            <GlassCard key={u.id} intensity={15} borderRadius={radius.chip} style={s.userChip}>
              <Text style={s.userChipText}>{u.name}</Text>
            </GlassCard>
          ))}
        </View>

        {/* Now Playing — hero glass card with scan lines, overflow for rolodex */}
        <GlassCard intensity={35} borderRadius={radius.card} glow={glow.hero} allowOverflow style={s.nowPlaying}>
          {/* Scan-line texture overlay — subtle CRT feel */}
          <ScanLines />
          {nowPlaying ? (
            <>
              {/* Horizontal rolodex — upcoming left, playing center, played right */}
              <View style={s.rolodex}>
                {/* Upcoming (from queue) — stacked left, next song more visible */}
                {queue.slice(0, 3).reverse().map((song, i) => {
                  const idx = 2 - i;
                  // Pull closer to center so they don't clip at card edge
                  const offsetX = -(ALBUM_SIZE * 0.38) - idx * 14;
                  const offsetY = 8 + idx * 4;
                  const opacity = [0.5, 0.25, 0.12][idx] || 0.08;
                  const scale = [0.48, 0.38, 0.30][idx] || 0.26;
                  return song.albumArt ? (
                    <View
                      key={`up-${song.id}`}
                      style={[s.rolodexCard, {
                        zIndex: 3 - idx,
                        opacity,
                        transform: [
                          { translateX: offsetX },
                          { translateY: offsetY },
                          { perspective: 800 },
                          { rotateY: "42deg" },
                          { scale },
                        ],
                      }]}
                    >
                      <Image source={{ uri: song.albumArt }} style={s.rolodexImg} />
                    </View>
                  ) : null;
                })}

                {/* Now playing — winged sun disc glow halo */}
                <Animated.View
                  style={[
                    s.rolodexMain,
                    {
                      transform: [
                        { translateY: -6 },
                        { scale: deckAnim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) },
                      ],
                      opacity: deckAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                    },
                  ]}
                >
                  {nowPlaying.albumArt ? (
                    <Image source={{ uri: nowPlaying.albumArt }} style={s.rolodexMainImg} />
                  ) : (
                    <View style={[s.rolodexMainImg, { backgroundColor: palette.glass }]} />
                  )}
                </Animated.View>

                {/* Played — spines, edge-on to the right */}
                {albumHistory.slice(1, 4).map((album, i) => {
                  const offsetX = (ALBUM_SIZE * 0.58) + i * 14;
                  const offsetY = 18 + i * 4;
                  const opacity = [0.35, 0.2, 0.1][i] || 0.06;
                  const scale = [0.48, 0.42, 0.36][i] || 0.32;
                  return (
                    <View
                      key={`played-${album.spotifyId}`}
                      style={[s.rolodexCard, {
                        zIndex: 2 - i,
                        opacity,
                        transform: [
                          { translateX: offsetX },
                          { translateY: offsetY },
                          { perspective: 600 },
                          { rotateY: "-78deg" },
                          { scale },
                        ],
                      }]}
                    >
                      <Image source={{ uri: album.art }} style={s.rolodexImg} />
                    </View>
                  );
                })}
              </View>

              {/* Track info */}
              <View style={s.npInfo}>
                <Text style={s.npLabel}>NOW PLAYING</Text>
                <Text style={s.npTitle} numberOfLines={1}>{nowPlaying.title}</Text>
                <Text style={s.npArtist} numberOfLines={1}>{nowPlaying.artist}</Text>
                {nowPlaying.addedBy && (
                  <Text style={s.npAddedBy}>queued by {nowPlaying.addedBy}</Text>
                )}
              </View>

              {/* Save to library — any Spotify-connected user */}
              {hasToken && (
                <View style={s.saveRow}>
                  <TouchableOpacity onPress={saveToLibrary} activeOpacity={0.7}>
                    <ShenRing
                      size={32}
                      color={saved ? palette.amber : palette.sandstone}
                      filled={saved}
                    />
                  </TouchableOpacity>
                </View>
              )}

              {/* Player controls — host only */}
              {nowPlaying.spotifyId && isHost && (
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
                      <Text style={s.playBtnIcon}>{isPlaying ? "||" : "\u25B6"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.skipControlBtn}
                      onPress={skip}
                      activeOpacity={0.7}
                    >
                      <Text style={s.skipControlText}>{"\u25B6\u25B6"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {/* Guest progress bar (no controls) */}
              {nowPlaying.spotifyId && !isHost && progress > 0 && (
                <View style={s.progressRowGuest}>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
                  </View>
                </View>
              )}
            </>
          ) : (
            <View style={s.npEmpty}>
              {/* Dot-matrix background — exposed grid feel */}
              <DotMatrix />
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
                <Text style={s.npEmptyText}>Add a song to get the party started</Text>
              )}
            </View>
          )}
        </GlassCard>

        {/* Tabs — glass pill bar. Spotify-connected users get full tabs */}
        <GlassCard intensity={20} borderRadius={radius.pill} style={s.tabs}>
          {(hasToken ? ["search", "liked", "playlists"] : ["search"]).map((t) => (
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
        </GlassCard>

        {/* Connect Spotify banner — for guests without a token */}
        {!hasToken && onConnectSpotify && (
          <TouchableOpacity style={s.connectBanner} onPress={onConnectSpotify} activeOpacity={0.8}>
            <Text style={s.connectBannerText}>Connect Spotify</Text>
            <Text style={s.connectBannerSub}>unlock your liked songs, playlists, and save discoveries</Text>
          </TouchableOpacity>
        )}

        {tab === "search" && (
          <View>
            <GlassCard intensity={15} borderRadius={radius.button} style={s.searchCard}>
              <TextInput
                style={s.searchInput}
                placeholder="Search Spotify..."
                placeholderTextColor={palette.dust}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                returnKeyType="search"
              />
            </GlassCard>
            {searching && (
              <View style={s.searchingRow}>
                <Scarab size={16} color={palette.amber} />
                <Text style={s.searchingText}>Searching...</Text>
              </View>
            )}
            {results.map((song, i) => (
              <SongRow key={`${song.spotifyId}-r${i}`} song={song} />
            ))}
          </View>
        )}

        {tab === "liked" && hasToken && (
          <View>
            {loadingLibrary ? (
              <View style={s.loadingRow}>
                <Scarab size={20} color={palette.amber} />
              </View>
            ) : likedSongs.length === 0 ? (
              <Text style={s.emptyText}>Nothing saved yet</Text>
            ) : (
              likedSongs.map((song, i) => (
                <SongRow key={`${song.spotifyId}-l${i}`} song={song} />
              ))
            )}
          </View>
        )}

        {tab === "playlists" && hasToken && (
          <View>
            {loadingLibrary ? (
              <View style={s.loadingRow}>
                <Scarab size={20} color={palette.amber} />
              </View>
            ) : selectedPlaylist ? (
              <>
                <TouchableOpacity
                  style={s.backBtn}
                  onPress={() => { setSelectedPlaylist(null); setPlaylistTracks([]); }}
                >
                  <Text style={s.backText}>{"\u2190"} {selectedPlaylist.name}</Text>
                </TouchableOpacity>
                {playlistTracks.map((song, i) => (
                  <SongRow key={`${song.spotifyId}-p${i}`} song={song} />
                ))}
              </>
            ) : playlists.length === 0 ? (
              <Text style={s.emptyText}>No playlists yet</Text>
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
                    <View style={[s.songArt, { backgroundColor: palette.glass }]} />
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
          <Text style={s.emptyText}>Queue is empty — add a song</Text>
        ) : (
          queue.map((song, i) => (
            <QueueItem key={song.id} song={song} index={i} />
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.obsidian },
  scroll: { flex: 1 },
  scrollContent: { padding: space.md, paddingTop: 60 },

  // Toast
  toast: {
    position: "absolute", top: 50, left: 20, right: 20, zIndex: 100,
    padding: 14, alignItems: "center",
  },
  toastText: { color: palette.papyrus, fontSize: 13, fontFamily: fonts.mono, letterSpacing: 0.3 },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: space.md },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { color: palette.papyrus, fontSize: 18, fontFamily: fonts.monoBold, letterSpacing: 1.5 },
  hostLabel: { color: palette.amber, fontSize: 9, fontFamily: fonts.mono, letterSpacing: 2.5, textTransform: "uppercase" },
  guestLabel: { color: palette.sandstone, fontSize: 9, fontFamily: fonts.mono, letterSpacing: 2.5, textTransform: "uppercase" },
  codeText: { color: palette.sandstone, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 4, marginTop: space.xs },
  codeTap: { color: palette.dust },
  leaveText: { color: palette.sandstone, fontSize: 10, fontFamily: fonts.mono, letterSpacing: 1.5, textTransform: "uppercase" },

  // Users — cartouche chips
  usersRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: space.md },
  userChip: { paddingHorizontal: 10, paddingVertical: 5 },
  userChipText: { color: palette.sandstone, fontSize: 10, fontFamily: fonts.mono, letterSpacing: 0.5 },

  // Now Playing — hero glass card
  nowPlaying: {
    padding: space.lg - 4, marginBottom: space.lg - 4,
  },

  // Rolodex
  rolodex: {
    height: ALBUM_SIZE + 16,
    alignItems: "center", justifyContent: "center",
    marginBottom: space.md, overflow: "visible",
  },
  rolodexMain: {
    width: ALBUM_SIZE, height: ALBUM_SIZE,
    borderRadius: radius.albumLg, overflow: "hidden",
    zIndex: 10,
    ...glow.hero,
  },
  rolodexMainImg: {
    width: ALBUM_SIZE, height: ALBUM_SIZE, borderRadius: radius.albumLg,
  },
  rolodexCard: {
    position: "absolute",
    width: ALBUM_SIZE, height: ALBUM_SIZE,
    borderRadius: 12, overflow: "hidden",
  },
  rolodexImg: {
    width: "100%", height: "100%", borderRadius: 12,
  },

  // Track info
  npInfo: { alignItems: "center", marginBottom: space.xs },
  npLabel: { color: palette.amber, fontSize: 9, fontFamily: fonts.mono, letterSpacing: 3, marginBottom: 6, textTransform: "uppercase" },
  npTitle: { color: palette.papyrus, fontSize: 17, fontWeight: "700", textAlign: "center" },
  npArtist: { color: palette.sandstone, fontSize: 14, marginTop: 2, textAlign: "center", fontFamily: fonts.serif },
  npAddedBy: { color: palette.dust, fontSize: 11, marginTop: space.xs, fontFamily: fonts.mono, letterSpacing: 0.5 },

  // Save — shen ring with label
  saveRow: { alignItems: "center", marginTop: space.sm, marginBottom: space.xs },
  saveBtn: { alignItems: "center", gap: 4 },
  saveLabel: { color: palette.dust, fontSize: 9, fontFamily: fonts.mono, letterSpacing: 1.5, textTransform: "uppercase" },
  saveLabelSaved: { color: palette.amber },

  // Player
  playerControls: { marginTop: space.md - 4 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md - 4 },
  progressRowGuest: { marginTop: space.md - 4, paddingHorizontal: 12 },
  progressTime: { color: palette.dust, fontSize: 9, fontFamily: fonts.mono, width: 32, textAlign: "center" },
  progressTrack: { flex: 1, height: 3, backgroundColor: palette.groove, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: palette.amber, borderRadius: 2 },
  controlsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  playBtn: {
    flex: 1, backgroundColor: palette.amber, borderRadius: radius.button,
    paddingVertical: 12, alignItems: "center",
    ...glow.button,
  },
  playBtnIcon: { color: palette.papyrus, fontSize: 16, fontWeight: "700" },
  skipControlBtn: {
    backgroundColor: palette.groove, borderRadius: radius.button,
    paddingVertical: 12, paddingHorizontal: 20, alignItems: "center",
  },
  skipControlText: { color: palette.sandstone, fontSize: 12 },

  // Empty state
  npEmpty: { alignItems: "center", paddingVertical: space.lg, overflow: "hidden" },
  npEmptyLabel: { color: palette.dust, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 2.5, marginBottom: space.md - 4, textTransform: "uppercase" },
  npEmptyText: { color: palette.dust, fontSize: 14, fontFamily: fonts.serifItalic, fontStyle: "italic", marginBottom: space.sm },
  playNextBtn: {
    backgroundColor: palette.amber, paddingHorizontal: 32, paddingVertical: 12, borderRadius: radius.button,
    ...glow.button,
  },
  playNextText: { color: palette.papyrus, fontFamily: fonts.monoBold, fontWeight: "700", fontSize: 14 },

  // Tabs
  tabs: {
    flexDirection: "row", padding: space.xs, marginBottom: space.md - 4, gap: space.xs,
  },
  tab: { flex: 1, paddingVertical: space.sm, borderRadius: radius.button, alignItems: "center" },
  tabActive: { backgroundColor: palette.groove },
  tabText: { color: palette.dust, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 1, textTransform: "uppercase" },
  tabTextActive: { color: palette.papyrus },

  // Search
  searchCard: { marginBottom: space.sm },
  searchInput: {
    paddingHorizontal: space.md, paddingVertical: 12,
    color: palette.papyrus, fontSize: 15,
  },
  searchingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: space.sm },
  searchingText: { color: palette.dust, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 1 },

  // Song rows
  songRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, paddingHorizontal: space.xs,
    borderBottomWidth: 1, borderBottomColor: palette.groove,
  },
  songArt: { width: 40, height: 40, borderRadius: radius.albumSm },
  songInfo: { flex: 1 },
  songTitle: { color: palette.papyrus, fontSize: 14, fontWeight: "700" },
  songArtist: { color: palette.sandstone, fontSize: 12 },
  songDuration: { color: palette.dust, fontSize: 10, fontFamily: fonts.mono },

  // Queue
  queueHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space.xs, marginBottom: space.md - 4 },
  queueLabel: { color: palette.sandstone, fontSize: 9, fontFamily: fonts.mono, letterSpacing: 2.5, textTransform: "uppercase" },
  queueCount: { color: palette.dust, fontSize: 10, fontFamily: fonts.mono },
  queueItem: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
  },
  queueNum: { color: palette.dust, fontSize: 10, width: 14, textAlign: "center", fontFamily: fonts.mono },
  addedBy: { color: palette.dust, fontFamily: fonts.mono, fontSize: 10 },
  voteGroup: { flexDirection: "row", alignItems: "center", gap: 2 },
  voteBtn: { padding: 8 },
  voteArrow: { color: palette.dust, fontSize: 11 },
  voteUp: { color: palette.amber },
  voteDown: { color: palette.scarabRed },
  voteCount: { color: palette.papyrus, fontSize: 11, fontFamily: fonts.mono, width: 20, textAlign: "center" },
  removeBtn: { padding: 6 },
  removeText: { color: palette.dust, fontSize: 12 },
  loadingRow: { alignItems: "center", paddingVertical: space.xl },
  emptyText: { color: palette.dust, fontSize: 14, fontFamily: fonts.serifItalic, fontStyle: "italic", textAlign: "center", paddingVertical: space.xl },
  backBtn: { paddingVertical: space.sm, marginBottom: space.xs },
  backText: { color: palette.sandstone, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 1 },

  // Connect Spotify banner (guests)
  connectBanner: {
    backgroundColor: palette.spotifyGreen,
    borderRadius: radius.button,
    paddingVertical: 12,
    paddingHorizontal: space.md,
    alignItems: "center",
    marginBottom: space.md,
  },
  connectBannerText: {
    color: palette.obsidian,
    fontSize: 14,
    fontWeight: "700",
    fontFamily: fonts.monoBold,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  connectBannerSub: {
    color: "rgba(0,0,0,0.5)",
    fontSize: 10,
    fontFamily: fonts.mono,
  },
});
