import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Image, FlatList, ScrollView,
  StyleSheet, Clipboard, Dimensions, AppState, Platform, Animated,
  KeyboardAvoidingView, PanResponder, Modal, Share,
} from "react-native";
import * as SpotifyRemote from "expo-spotify-app-remote";
import QRCode from "react-native-qrcode-svg";

import socket from "./socket";
import api from "./api";
import { palette, fonts, radius, glow, space } from "./theme";
import { ShenRing, Scarab } from "./Symbols";
import { GlassCard, ScanLines, DotMatrix } from "./Glass";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ALBUM_MAIN = SCREEN_WIDTH * 0.32;
const ALBUM_SIZE = ALBUM_MAIN;
const CARD_SPACING = 16;
const JUKEBOX_CARD_COUNT = 5;

export default function LobbyScreen({ code, isHost, user, initialState, getToken, onLeave, onConnectSpotify }) {
  const [queue, setQueue] = useState(initialState?.queue || []);
  const [users, setUsers] = useState(initialState?.users || []);
  const [nowPlaying, setNowPlaying] = useState(initialState?.nowPlaying || null);
  const [venueName] = useState(initialState?.venueName || null);
  const [venueSlug] = useState(initialState?.venueSlug || null);
  const [venueLogoUrl] = useState(initialState?.venueLogoUrl || null);
  const [venueAccentColor] = useState(initialState?.venueAccentColor || null);
  const [venueNoExplicit] = useState(initialState?.venueNoExplicit || false);
  const accent = venueAccentColor || palette.amber;
  const [showQR, setShowQR] = useState(false);
  const joinUrl = venueSlug ? `https://party-time-v4.vercel.app/${venueSlug}` : `https://party-time-v4.vercel.app/join/${code}`;
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
  const [likedHasMore, setLikedHasMore] = useState(true);
  const [playlistTracksHasMore, setPlaylistTracksHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
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
  const [jukeboxActive, setJukeboxActive] = useState(false);
  const deckAnim = useRef(new Animated.Value(0)).current;
  const jukeboxPan = useRef(new Animated.Value(0)).current;
  const debounceRef = useRef(null);
  const toastRef = useRef(null);
  const scrollRef = useRef(null);
  const searchRef = useRef(null);
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
        return [{ spotifyId: nowPlaying.spotifyId, art: nowPlaying.albumArt }, ...filtered].slice(0, 8);
      });
      // Smooth jukebox swap — slide in from left, ease out
      jukeboxPan.setValue(-80);
      deckAnim.setValue(0);
      Animated.parallel([
        Animated.timing(jukeboxPan, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(deckAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [nowPlaying?.spotifyId]);

  // --- Spotify App Remote connection + player state subscription ---
  useEffect(() => {
    if (!isHost || !getToken) return;

    let playerSub;
    let connSub;
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
        console.log("[SR] connect() starting, token length:", token?.length);
        try {
          await SpotifyRemote.connect(token);
          if (cancelled) return;
          console.log("[SR] connect() succeeded!");
          setRemoteConnected(true);
          await subscribeAfterConnect();
        } catch (e) {
          if (cancelled) return;
          console.log("[SR] connect() failed:", e?.code, e?.message);
          // Connect failed — need App Remote authorization.
          // authorize() opens Spotify briefly. The native AppDelegate
          // catches the redirect URL and calls connect() immediately
          // on the SAME SPTAppRemote instance within the IPC window.
          // The authorize promise resolves when the delegate fires
          // appRemoteDidEstablishConnection.
          try {
            console.log("[SR] calling authorize()...");
            await SpotifyRemote.authorize("");
            if (cancelled) return;
            console.log("[SR] authorize() resolved — connected!");
            setRemoteConnected(true);
            await subscribeAfterConnect();
          } catch (e2) {
            const msg = e2?.message || e2?.code || String(e2);
            console.log("[SR] authorize() failed:", msg);
            showToast(`Spotify connect failed: ${msg}`.slice(0, 180));
          }
        }
      } catch (e) {
        const msg = e?.message || e?.code || String(e);
        console.log("[SR] connectRemote outer error:", msg);
        showToast(`Spotify init failed: ${msg}`.slice(0, 180));
      }
    }

    // Connection state events (fires on connect/disconnect/auth-URL completion)
    connSub = SpotifyRemote.addConnectionListener(async (event) => {
      console.log("[SR] connectionListener:", JSON.stringify(event));
      if (cancelled) return;
      setRemoteConnected(!!event.connected);
      if (event.connected) {
        await subscribeAfterConnect();
      }
    });

    connectRemote();

    return () => {
      cancelled = true;
      playerSub?.remove();
      connSub?.remove();
      // Don't pause — let current song finish naturally in Spotify.
      // When host rejoins, App Remote reconnects and auto-play resumes.
      SpotifyRemote.unsubscribeFromPlayerState().catch(() => {});
      SpotifyRemote.disconnect().catch(() => {});
    };
  }, [isHost]);

  // Poll player state as fallback — catches dropped listener connections
  useEffect(() => {
    if (!isHost || !remoteConnected) return;
    const interval = setInterval(async () => {
      try {
        const state = await SpotifyRemote.getPlayerState();
        if (state) {
          setIsPlaying(!state.isPaused);
          setDuration(state.durationMs || 0);
          setPosition(state.positionMs || 0);
          if (state.durationMs) setProgress(state.positionMs / state.durationMs);

          // Auto-advance: track ended
          if (state.isPaused && state.durationMs > 0 && state.positionMs >= state.durationMs - 1500) {
            const np = nowPlayingRef.current;
            if (np?.spotifyId && skipFiredRef.current !== np.spotifyId) {
              skipFiredRef.current = np.spotifyId;
              socket.emit("skip", code);
            }
          }
        }
      } catch {}
    }, 500);
    return () => clearInterval(interval);
  }, [isHost, remoteConnected]);

  // AppState: reconnect everything when returning from background
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === "active") {
        // Reconnect socket
        if (!socket.connected) socket.connect();
        socket.emit("rejoin", code);

        // Always reconnect App Remote on foreground (connection may have dropped)
        if (isHost && getToken) {
          try {
            const token = await getToken();
            if (token) {
              // Try connecting — if already connected this is a no-op on the native side
              await SpotifyRemote.connect(token).catch(() => {});
              setRemoteConnected(true);
              await SpotifyRemote.subscribeToPlayerState().catch(() => {});

              // Sync player state immediately
              const state = await SpotifyRemote.getPlayerState().catch(() => null);
              if (state) {
                setIsPlaying(!state.isPaused);
                setDuration(state.durationMs || 0);
                setPosition(state.positionMs || 0);
                if (state.durationMs) setProgress(state.positionMs / state.durationMs);
              }
            }
          } catch {}
        }
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [code, isHost]);

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

  async function handleResume() {
    if (!getToken || !nowPlaying?.spotifyId) return;
    try {
      await SpotifyRemote.resume();
      setIsPlaying(true);
    } catch {
      // Connection likely dropped — reconnect and resume
      try {
        const token = await getToken();
        await SpotifyRemote.connect(token);
        setRemoteConnected(true);
        await SpotifyRemote.subscribeToPlayerState().catch(() => {});
        await SpotifyRemote.resume();
        setIsPlaying(true);
      } catch (e) {
        console.log("[SR] resume after reconnect failed:", e?.message);
        showToast("Couldn't resume — try again");
      }
    }
  }

  async function handlePlayNewTrack() {
    if (!getToken || !nowPlaying?.spotifyId) return;
    const uri = `spotify:track:${nowPlaying.spotifyId}`;
    try {
      await SpotifyRemote.play(uri);
      setIsPlaying(true);
    } catch {
      try {
        const token = await getToken();
        await SpotifyRemote.connect(token);
        setRemoteConnected(true);
        await SpotifyRemote.subscribeToPlayerState().catch(() => {});
        await SpotifyRemote.play(uri);
        setIsPlaying(true);
      } catch (e) {
        console.log("[SR] play new track failed:", e?.message);
        showToast("Tap play to start — Spotify is warming up");
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

  // Auto-play when the TRACK changes (not on reconnect to same track)
  const lastAutoPlayRef = useRef(null);
  useEffect(() => {
    if (!isHost || !nowPlaying?.spotifyId || !getToken || !remoteConnected) return;
    // Only auto-play if this is a genuinely new track
    if (lastAutoPlayRef.current === nowPlaying.spotifyId) return;
    lastAutoPlayRef.current = nowPlaying.spotifyId;
    const t = setTimeout(() => handlePlayNewTrack(), 2000);
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
    socket.on("permission-error", (msg) => { console.log("[SR] permission-error:", msg); showToast(msg); });
    socket.on("lobby-closed", () => {
      showToast("Host left — lobby closed");
      setTimeout(onLeave, 2000);
    });

    socket.on("disconnect", () => {
      console.log("[SR] socket disconnected — will reconnect");
    });
    socket.on("connect", () => {
      console.log("[SR] socket reconnected — rejoining lobby");
      socket.emit("rejoin", code);
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
      socket.off("disconnect");
      socket.off("connect");
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
        const res = await api(`/api/spotify/search?q=${encodeURIComponent(search)}${venueNoExplicit ? "&noExplicit=1" : ""}`);
        const data = await res.json();
        setResults(data.tracks || []);
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 300);
  }, [search, tab]);

  async function loadLikedSongs(offset = 0) {
    if (offset === 0) setLoadingLibrary(true);
    else setLoadingMore(true);
    try {
      const token = await getToken();
      const res = await api(`/api/spotify/liked?offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (offset === 0) setLikedSongs(data.tracks || []);
      else setLikedSongs((prev) => [...prev, ...(data.tracks || [])]);
      setLikedHasMore(data.hasMore ?? false);
    } catch {
      if (offset === 0) setLikedSongs([]);
    }
    setLoadingLibrary(false);
    setLoadingMore(false);
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

  async function loadPlaylistTracks(playlist, offset = 0) {
    if (offset === 0) { setSelectedPlaylist(playlist); setLoadingLibrary(true); }
    else setLoadingMore(true);
    try {
      const token = await getToken();
      const res = await api(`/api/spotify/playlists/${playlist.id}/tracks?offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (offset === 0) setPlaylistTracks(data.tracks || []);
      else setPlaylistTracks((prev) => [...prev, ...(data.tracks || [])]);
      setPlaylistTracksHasMore(data.hasMore ?? false);
    } catch {
      if (offset === 0) setPlaylistTracks([]);
    }
    setLoadingLibrary(false);
    setLoadingMore(false);
  }

  useEffect(() => {
    if (!hasToken) return;
    if (tab === "liked" && likedSongs.length === 0) loadLikedSongs();
    if (tab === "playlists" && playlists.length === 0) loadPlaylists();
  }, [tab, hasToken]);

  function addSong(song) {
    if (!socket.connected) {
      socket.connect();
      socket.emit("rejoin", code);
    }
    socket.emit("add-song", { code, song });
    showToast(`Added "${song.title}"`);
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
    console.log("[SR] skip emitted for lobby:", code);
    socket.emit("skip", code);
  }

  // Jukebox carousel — combine upcoming + now playing + played into one deck
  const jukeboxCards = useMemo(() => {
    const upcoming = queue.slice(0, JUKEBOX_CARD_COUNT).map((s) => ({ key: `up-${s.id}`, art: s.albumArt, title: s.title, type: "upcoming" }));
    const center = nowPlaying?.albumArt
      ? [{ key: "now", art: nowPlaying.albumArt, title: nowPlaying.title, type: "playing" }]
      : albumHistory[0]
        ? [{ key: "last", art: albumHistory[0].art, title: "", type: "idle" }]
        : [{ key: "empty", art: null, title: "", type: "empty" }];
    const startIdx = nowPlaying ? 1 : 0;
    const played = albumHistory.slice(startIdx, startIdx + JUKEBOX_CARD_COUNT).map((a) => ({ key: `pl-${a.spotifyId}`, art: a.art, title: "", type: "played" }));
    return [...upcoming.reverse(), ...center, ...played];
  }, [queue, nowPlaying, albumHistory]);

  const centerIndex = useMemo(() => {
    return jukeboxCards.findIndex((c) => c.type === "playing" || c.type === "idle" || c.type === "empty");
  }, [jukeboxCards]);

  const jukeboxPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => {
      setJukeboxActive(true);
    },
    onPanResponderMove: (_, g) => {
      jukeboxPan.setValue(g.dx);
    },
    onPanResponderRelease: (_, g) => {
      setJukeboxActive(false);
      Animated.spring(jukeboxPan, {
        toValue: 0,
        tension: 80,
        friction: 12,
        useNativeDriver: true,
      }).start();
    },
  }), []);

  const displayCode = venueSlug || code;

  function copyCode() {
    Clipboard.setString(venueSlug ? `party-time-v4.vercel.app/${venueSlug}` : code);
    showToast(venueSlug ? "Link copied!" : "Code copied!");
  }

  function shareLobby() {
    const msg = venueName
      ? `Join ${venueName} on PartyTime! ${joinUrl}`
      : `Join my PartyTime lobby! Code: ${code}\n${joinUrl}`;
    Share.share({ message: msg, url: joinUrl });
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
      <View style={s.queueItem}>
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
      </View>
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
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEnabled={!jukeboxActive}
      >
        {/* Header + users in one compact block */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <View style={s.titleRow}>
              <Text style={s.headerTitle}>{venueName || "PARTYTIME"}</Text>
              {isHost ? <Text style={s.hostLabel}>HOST</Text> : <Text style={s.guestLabel}>GUEST</Text>}
            </View>
            {venueName && <Text style={s.venueSubtitle}>powered by PartyTime</Text>}
            {/* Users inline under title */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.usersScroll} contentContainerStyle={s.usersRow}>
              {users.map((u) => (
                <View key={u.id} style={s.userChip}>
                  <Text style={s.userChipText}>{u.name}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
          <View style={s.headerRight}>
            <View style={{ flexDirection: "row", gap: space.xs }}>
              <TouchableOpacity onPress={shareLobby} style={s.qrThumb}>
                <Text style={{ color: palette.papyrus, fontSize: 18 }}>↗</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowQR(true)} style={s.qrThumb}>
                <QRCode value={joinUrl} size={28} backgroundColor="transparent" color={palette.papyrus} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={onLeave}>
              <Text style={s.leaveText}>LEAVE</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Full-screen QR modal — for projecting on TV */}
        <Modal visible={showQR} animationType="fade" transparent>
          <TouchableOpacity style={s.qrModal} activeOpacity={1} onPress={() => setShowQR(false)}>
            <View style={s.qrModalCard}>
              <Text style={s.qrModalTitle}>{venueName || "PARTYTIME"}</Text>
              <QRCode value={joinUrl} size={SCREEN_WIDTH * 0.6} backgroundColor={palette.obsidian} color={palette.papyrus} />
              <Text style={s.qrModalCode}>{displayCode}</Text>
              <Text style={s.qrModalHint}>Scan to join</Text>
              <TouchableOpacity style={s.qrShareBtn} onPress={(e) => { e.stopPropagation(); shareLobby(); }} activeOpacity={0.8}>
                <Text style={s.qrShareText}>Share</Text>
              </TouchableOpacity>
              <Text style={s.qrModalTap}>tap anywhere to close</Text>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Now Playing — hero glass card with scan lines, overflow for rolodex */}
        <GlassCard intensity={35} borderRadius={radius.card} glow={{ ...glow.hero, shadowColor: accent }} allowOverflow noBorder style={s.nowPlaying}>
          <View style={[StyleSheet.absoluteFill, { borderRadius: radius.card, overflow: "hidden" }]} pointerEvents="none">
            <ScanLines />
          </View>

          {/* Venue logo */}
          {venueLogoUrl && (
            <View style={s.venueLogoRow}>
              <Image source={{ uri: venueLogoUrl }} style={s.venueLogo} resizeMode="contain" />
            </View>
          )}

          {/* Interactive jukebox carousel */}
          <Animated.View style={s.rolodex} {...jukeboxPanResponder.panHandlers}>
            {jukeboxCards.map((card, i) => {
              const distFromCenter = i - centerIndex;
              if (!card.art) return null;

              const isCenter = distFromCenter === 0;
              const absD = Math.abs(distFromCenter);
              const isLeft = distFromCenter < 0; // upcoming (left of center)

              const baseOffsetX = isCenter ? 0 : (isLeft ? -1 : 1) * (ALBUM_MAIN * 0.68 + (absD - 1) * CARD_SPACING);
              const baseScale = isCenter ? 1 : Math.max(0.38, 0.70 - (absD - 1) * 0.06);
              const baseOpacity = isCenter ? 1 : Math.max(0.06, 0.55 - (absD - 1) * 0.10);
              // Left cards face right (positive rotateY), right cards face left (negative)
              // so when browsing that direction, they rotate toward you
              const baseRotateY = isCenter ? 0 : (isLeft ? 75 : -75);
              const baseOffsetY = isCenter ? -6 : 8 + (absD - 1) * 3;

              // Pan: positive dx = drag right = reveal upcoming (left side)
              // Cards shift right, left cards flatten to show face
              const panShift = jukeboxPan.interpolate({
                inputRange: [-200, 0, 200],
                outputRange: [baseOffsetX - 30, baseOffsetX, baseOffsetX + 30],
                extrapolate: "clamp",
              });

              // When dragging right (positive), left cards should flatten (rotateY → 0)
              // When dragging left (negative), right cards should flatten (rotateY → 0)
              let panRotateOut;
              if (isCenter) {
                panRotateOut = jukeboxPan.interpolate({
                  inputRange: [-150, 0, 150],
                  outputRange: ["8deg", "0deg", "-8deg"],
                  extrapolate: "clamp",
                });
              } else if (isLeft) {
                // Upcoming: drag right (positive pan) → flatten toward 0
                panRotateOut = jukeboxPan.interpolate({
                  inputRange: [-100, 0, 200],
                  outputRange: [`${baseRotateY + 10}deg`, `${baseRotateY}deg`, `${baseRotateY * 0.3}deg`],
                  extrapolate: "clamp",
                });
              } else {
                // Played: drag left (negative pan) → flatten toward 0
                panRotateOut = jukeboxPan.interpolate({
                  inputRange: [-200, 0, 100],
                  outputRange: [`${baseRotateY * 0.3}deg`, `${baseRotateY}deg`, `${baseRotateY + 10}deg`],
                  extrapolate: "clamp",
                });
              }

              return (
                <Animated.View
                  key={card.key}
                  style={[
                    isCenter ? s.rolodexMain : s.rolodexCard,
                    {
                      zIndex: isCenter ? 10 : 5 - absD,
                      opacity: isCenter ? (card.type === "idle" ? 0.5 : deckAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] })) : baseOpacity,
                      transform: [
                        { translateX: panShift },
                        { translateY: baseOffsetY },
                        { perspective: 800 },
                        { rotateY: panRotateOut },
                        { scale: isCenter ? deckAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) : baseScale },
                      ],
                    },
                    isCenter && { ...glow.hero, shadowColor: accent },
                  ]}
                >
                  <Image source={{ uri: card.art }} style={isCenter ? s.rolodexMainImg : s.rolodexImg} />
                </Animated.View>
              );
            })}
          </Animated.View>

          {nowPlaying ? (
            <>

              {/* Track info */}
              <View style={s.npInfo}>
                <Text style={[s.npLabel, { color: accent }]}>NOW PLAYING</Text>
                <Text style={s.npTitle} numberOfLines={1}>{nowPlaying.title}</Text>
                <Text style={s.npArtist} numberOfLines={1}>{nowPlaying.artist}</Text>
                {nowPlaying.addedBy && (
                  <Text style={s.npAddedBy}>queued by {nowPlaying.addedBy}</Text>
                )}
              </View>

              {/* Player controls + save — single compact row */}
              {nowPlaying.spotifyId && (
                <View style={s.playerControls}>
                  {isHost && (
                    <View style={s.progressRow}>
                      <Text style={s.progressTime}>{fmt(position)}</Text>
                      <View style={s.progressTrack}>
                        <View style={[s.progressFill, { width: `${Math.min(progress * 100, 100)}%`, backgroundColor: accent }]} />
                      </View>
                      <Text style={s.progressTime}>{fmt(duration)}</Text>
                    </View>
                  )}
                  <View style={s.controlsRow}>
                    {hasToken && (
                      <TouchableOpacity
                        style={s.saveControlBtn}
                        onPress={saveToLibrary}
                        activeOpacity={0.7}
                      >
                        <ShenRing size={18} color={saved ? accent : palette.sandstone} filled={saved} />
                      </TouchableOpacity>
                    )}
                    {isHost && (
                      <TouchableOpacity
                        style={[s.playBtn, { backgroundColor: accent }]}
                        onPress={isPlaying ? handlePause : handleResume}
                        activeOpacity={0.8}
                      >
                        <Text style={s.playBtnIcon}>{isPlaying ? "||" : "\u25B6"}</Text>
                      </TouchableOpacity>
                    )}
                    {isHost && (
                      <TouchableOpacity
                        style={s.skipControlBtn}
                        onPress={skip}
                        activeOpacity={0.7}
                      >
                        <Text style={s.skipControlText}>{"\u25B6\u25B6"}</Text>
                      </TouchableOpacity>
                    )}
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
        <View style={s.tabs}>
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
        </View>

        {/* Connect Spotify banner — for guests without a token */}
        {!hasToken && onConnectSpotify && (
          <TouchableOpacity style={s.connectBanner} onPress={onConnectSpotify} activeOpacity={0.8}>
            <Text style={s.connectBannerText}>Connect Spotify</Text>
            <Text style={s.connectBannerSub}>unlock your liked songs, playlists, and save discoveries</Text>
          </TouchableOpacity>
        )}

        {tab === "search" && (
          <View>
            <View
              style={s.searchCard}
              onLayout={(e) => { searchRef.current = e.nativeEvent.layout.y; }}
            >
              <TextInput
                style={s.searchInput}
                placeholder="Search Spotify..."
                placeholderTextColor={palette.dust}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                returnKeyType="search"
                onFocus={() => {
                  if (searchRef.current != null) {
                    setTimeout(() => {
                      scrollRef.current?.scrollTo({ y: searchRef.current - 10, animated: true });
                    }, 300);
                  }
                }}
              />
            </View>
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
              <>
                {likedSongs.map((song, i) => (
                  <SongRow key={`${song.spotifyId}-l${i}`} song={song} />
                ))}
                {likedHasMore && (
                  <TouchableOpacity
                    style={s.loadMoreBtn}
                    onPress={() => loadLikedSongs(likedSongs.length)}
                    disabled={loadingMore}
                    activeOpacity={0.7}
                  >
                    <Text style={s.loadMoreText}>{loadingMore ? "Loading..." : "Load More"}</Text>
                  </TouchableOpacity>
                )}
              </>
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
                {playlistTracksHasMore && (
                  <TouchableOpacity
                    style={s.loadMoreBtn}
                    onPress={() => loadPlaylistTracks(selectedPlaylist, playlistTracks.length)}
                    disabled={loadingMore}
                    activeOpacity={0.7}
                  >
                    <Text style={s.loadMoreText}>{loadingMore ? "Loading..." : "Load More"}</Text>
                  </TouchableOpacity>
                )}
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
  scrollContent: { padding: space.md, paddingTop: 42 },

  // Toast
  toast: {
    position: "absolute", top: 50, left: 20, right: 20, zIndex: 100,
    padding: 14, alignItems: "center",
  },
  toastText: { color: palette.papyrus, fontSize: 13, fontFamily: fonts.mono, letterSpacing: 0.3 },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: space.xs },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerTitle: { color: palette.papyrus, fontSize: 18, fontFamily: fonts.monoBold, letterSpacing: 1.5 },
  venueSubtitle: { color: palette.dust, fontSize: 9, fontFamily: fonts.serifItalic, fontStyle: "italic", letterSpacing: 1, marginTop: 1 },
  venueLogoRow: { alignItems: "center", marginBottom: space.sm },
  venueLogo: { width: 80, height: 40 },
  hostLabel: { color: palette.amber, fontSize: 9, fontFamily: fonts.mono, letterSpacing: 2.5, textTransform: "uppercase" },
  guestLabel: { color: palette.sandstone, fontSize: 9, fontFamily: fonts.mono, letterSpacing: 2.5, textTransform: "uppercase" },
  codeText: { color: palette.sandstone, fontSize: 11, fontFamily: fonts.serif, letterSpacing: 0, marginTop: space.xs },
  codeTap: { color: palette.dust, fontFamily: fonts.serif },
  headerRight: { alignItems: "flex-end", gap: space.sm },
  qrThumb: { padding: 4, borderWidth: 1, borderColor: palette.glassBorder, borderRadius: 8 },
  leaveText: { color: palette.sandstone, fontSize: 10, fontFamily: fonts.mono, letterSpacing: 1.5, textTransform: "uppercase" },
  qrModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center", alignItems: "center" },
  qrModalCard: { alignItems: "center", padding: space.xl },
  qrModalTitle: { color: palette.papyrus, fontSize: 28, fontFamily: fonts.monoBold, letterSpacing: 3, marginBottom: space.lg },
  qrModalCode: { color: palette.amber, fontSize: 18, fontFamily: fonts.mono, letterSpacing: 6, marginTop: space.lg },
  qrModalHint: { color: palette.sandstone, fontSize: 16, fontFamily: fonts.serifItalic, fontStyle: "italic", marginTop: space.sm },
  qrShareBtn: { borderWidth: 1, borderColor: palette.amber, borderRadius: radius.button, paddingVertical: 10, paddingHorizontal: 32, marginTop: space.lg },
  qrShareText: { color: palette.amber, fontSize: 14, fontFamily: fonts.monoBold, letterSpacing: 1 },
  qrModalTap: { color: palette.dust, fontSize: 11, fontFamily: fonts.mono, marginTop: space.lg },

  // Users — cartouche chips
  usersScroll: { marginTop: space.xs, flexGrow: 0 },
  usersRow: { flexDirection: "row", gap: 6, paddingRight: space.md },
  userChip: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: palette.onyx, borderRadius: radius.chip, borderWidth: 1, borderColor: palette.glassBorder },
  userChipText: { color: palette.sandstone, fontSize: 10, fontFamily: fonts.mono, letterSpacing: 0.5 },

  // Now Playing — hero glass card
  nowPlaying: {
    padding: space.md, marginBottom: space.sm,
  },

  // Rolodex
  rolodex: {
    height: ALBUM_SIZE + 12,
    alignItems: "center", justifyContent: "center",
    marginBottom: space.sm, overflow: "visible",
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
  npInfo: { alignItems: "center", marginBottom: 2 },
  npLabel: { color: palette.amber, fontSize: 9, fontFamily: fonts.mono, letterSpacing: 3, marginBottom: 3, textTransform: "uppercase" },
  npTitle: { color: palette.papyrus, fontSize: 15, fontWeight: "700", textAlign: "center" },
  npArtist: { color: palette.sandstone, fontSize: 13, marginTop: 1, textAlign: "center", fontFamily: fonts.serif },
  npAddedBy: { color: palette.dust, fontSize: 10, marginTop: 2, fontFamily: fonts.mono, letterSpacing: 0.5 },

  // Save (kept for potential reuse)
  saveLabel: { color: palette.dust, fontSize: 9, fontFamily: fonts.mono, letterSpacing: 1.5, textTransform: "uppercase" },

  // Player
  playerControls: { marginTop: space.xs },
  progressRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.xs },
  progressRowGuest: { marginTop: space.md - 4, paddingHorizontal: 12 },
  progressTime: { color: palette.dust, fontSize: 9, fontFamily: fonts.mono, width: 32, textAlign: "center" },
  progressTrack: { flex: 1, height: 3, backgroundColor: palette.groove, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: palette.amber, borderRadius: 2 },
  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  playBtn: {
    flex: 1, backgroundColor: palette.amber, borderRadius: radius.button,
    paddingVertical: 10, alignItems: "center",
    ...glow.button,
  },
  playBtnIcon: { color: palette.obsidian, fontSize: 14, fontWeight: "700" },
  skipControlBtn: {
    backgroundColor: palette.groove, borderRadius: radius.button,
    paddingVertical: 10, paddingHorizontal: 16, alignItems: "center",
  },
  skipControlText: { color: palette.sandstone, fontSize: 12 },
  saveControlBtn: {
    backgroundColor: palette.groove, borderRadius: radius.button,
    paddingVertical: 10, paddingHorizontal: 16, alignItems: "center",
  },

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
    borderBottomWidth: 1, borderBottomColor: palette.glassBorder,
  },
  tab: { flex: 1, paddingVertical: space.sm, borderRadius: radius.button, alignItems: "center" },
  tabActive: { backgroundColor: palette.groove },
  tabText: { color: palette.dust, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 1, textTransform: "uppercase" },
  tabTextActive: { color: palette.papyrus },

  // Search
  searchCard: {
    marginBottom: space.sm, backgroundColor: palette.onyx,
    borderWidth: 1, borderColor: palette.glassBorder, borderRadius: radius.button,
  },
  searchInput: {
    paddingHorizontal: space.md, paddingVertical: 12,
    color: palette.papyrus, fontSize: 14, fontFamily: fonts.serif,
    letterSpacing: 0,
  },
  searchingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: space.sm },
  searchingText: { color: palette.dust, fontSize: 11, fontFamily: fonts.mono, letterSpacing: 1 },

  loadMoreBtn: {
    alignItems: "center", paddingVertical: 14, marginTop: space.sm,
    borderWidth: 1, borderColor: palette.glassBorder, borderRadius: radius.button,
  },
  loadMoreText: { color: palette.amber, fontSize: 12, fontFamily: fonts.monoBold, letterSpacing: 1 },

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
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 2,
    borderBottomWidth: 1, borderBottomColor: palette.glassBorder,
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
