import { useState, useRef, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Image, StyleSheet,
  KeyboardAvoidingView, Platform, Animated, Dimensions,
} from "react-native";
import { palette, fonts, radius, glow, space } from "./theme";
import { Logo } from "./Logo";
import { GlassCard, ExposedGrid } from "./Glass";
import api from "./api";
import socket from "./socket";

const { height: SCREEN_H } = Dimensions.get("window");

/**
 * HomeScreen — Artifact-inspired layout.
 *
 * Top third: Sirius mark (large dot-matrix, centered)
 * Middle: PARTYTIME wordmark + tagline
 * Below: Create / Join actions
 * Bottom: signed-in-as bar
 *
 * Same spatial hierarchy as Artifact's login screen.
 */
export default function HomeScreen({ user, onLogout, onJoinLobby, onOpenSettings, getToken, onClearLastLobby }) {
  const [lobbyCode, setLobbyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  const [activeVenues, setActiveVenues] = useState([]);
  const [lastLobby, setLastLobby] = useState(null);

  useEffect(() => {
    (async () => {
      // Check for a consumer lobby to rejoin
      try {
        const stored = await AsyncStorage.getItem("pt_active_lobby");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.code && parsed.isHost) setLastLobby(parsed);
        }
      } catch {}

      // Fetch active venue lobbies
      try {
        const token = getToken ? await getToken() : null;
        if (!token) return;
        const res = await api("/api/venues/by-owner", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const venues = await res.json();
          setActiveVenues(venues.filter((v) => v.settings?.active && v.lobbyCode));
        }
      } catch {}
    })();
  }, []);

  // Entrance animations
  const logoFade = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const titleFade = useRef(new Animated.Value(0)).current;
  const actionsFade = useRef(new Animated.Value(0)).current;
  const actionsSlide = useRef(new Animated.Value(16)).current;
  const footerFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
      ]),
      Animated.timing(titleFade, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(actionsFade, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(actionsSlide, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
      Animated.timing(footerFade, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  }, []);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }

  function joinLobby(code, host) {
    if (!socket.connected) socket.connect();
    socket.emit("join-lobby", { code, name: user.name, host });
    socket.once("error", (msg) => {
      setLoading(false);
      showToast(msg || "Couldn't join that lobby");
      socket.disconnect();
    });
    socket.once("lobby-state", (lobby) => {
      onJoinLobby({ code, isHost: host, initialState: lobby });
    });
  }

  async function createLobby() {
    setLoading(true);
    try {
      const res = await api("/api/lobbies", { method: "POST" });
      if (!res.ok) {
        showToast(`Couldn't create lobby (${res.status})`);
        setLoading(false);
        return;
      }
      const { code } = await res.json();
      joinLobby(code, true);
    } catch (e) {
      showToast("Couldn't create lobby — check connection");
    }
    setLoading(false);
  }

  function handleJoin() {
    const code = lobbyCode.trim().toUpperCase();
    if (!code) return;
    joinLobby(code, false);
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Background grid */}
      <ExposedGrid />

      {/* Toast */}
      {toast && (
        <GlassCard intensity={60} borderRadius={radius.pill} style={s.toast}>
          <Text style={s.toastText}>{toast}</Text>
        </GlassCard>
      )}

      {/* ── Top section: Dot-matrix logo mark (Artifact style) ── */}
      <View style={s.topSection}>
        <Animated.View style={{ opacity: logoFade, transform: [{ scale: logoScale }] }}>
          <Logo dotSize={4} gap={2} color={palette.amber} />
        </Animated.View>
      </View>

      {/* ── Middle section: Wordmark + tagline + actions ── */}
      <View style={s.midSection}>
        <Animated.View style={[s.brandBlock, { opacity: titleFade }]}>
          <Text style={s.wordmark}>PARTYTIME</Text>
          <Text style={s.tagline}>everyone's digital jukebox</Text>
        </Animated.View>

        <Animated.View style={[s.actions, { opacity: actionsFade, transform: [{ translateY: actionsSlide }] }]}>
          <TouchableOpacity
            style={s.createBtn}
            onPress={createLobby}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Text style={s.createText}>
              {loading ? "Creating..." : "Create a Lobby"}
            </Text>
          </TouchableOpacity>

          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or join one</Text>
            <View style={s.dividerLine} />
          </View>

          <View style={s.joinRow}>
            <GlassCard intensity={25} borderRadius={radius.button} style={s.codeCard}>
              <TextInput
                style={s.codeInput}
                placeholder="LOBBY CODE"
                placeholderTextColor={palette.dust}
                value={lobbyCode}
                onChangeText={setLobbyCode}
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={handleJoin}
                returnKeyType="join"
              />
            </GlassCard>
            <TouchableOpacity style={s.joinBtn} onPress={handleJoin} activeOpacity={0.8}>
              <Text style={s.joinText}>Join</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Rejoin cards — active venues + last consumer lobby */}
        {(activeVenues.length > 0 || lastLobby) && (
          <View style={s.activeVenues}>
            {lastLobby && (
              <TouchableOpacity
                style={s.activeVenueCard}
                onPress={() => {
                  if (!socket.connected) socket.connect();
                  socket.emit("join-lobby", { code: lastLobby.code, name: user.name });
                  socket.once("lobby-state", (state) => {
                    onJoinLobby({ code: lastLobby.code, isHost: true, initialState: state });
                  });
                  socket.once("error", () => {
                    socket.disconnect();
                    setLastLobby(null);
                    if (onClearLastLobby) onClearLastLobby();
                    showToast("Lobby no longer exists");
                  });
                }}
                activeOpacity={0.8}
              >
                <View style={s.activeVenueDot} />
                <Text style={s.activeVenueName}>Lobby {lastLobby.code}</Text>
                <Text style={s.activeVenueAction}>REJOIN</Text>
              </TouchableOpacity>
            )}
            {activeVenues.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={s.activeVenueCard}
                onPress={() => {
                  if (!socket.connected) socket.connect();
                  socket.emit("join-lobby", { code: v.lobbyCode, name: user.name });
                  socket.once("lobby-state", (state) => {
                    onJoinLobby({ code: v.lobbyCode, isHost: true, initialState: state });
                  });
                  socket.once("error", () => socket.disconnect());
                }}
                activeOpacity={0.8}
              >
                <View style={s.activeVenueDot} />
                <Text style={s.activeVenueName}>{v.name}</Text>
                <Text style={s.activeVenueAction}>REJOIN</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ── Bottom section: Signed-in bar ── */}
      <Animated.View style={[s.footer, { opacity: footerFade }]}>
        <View style={s.footerRow}>
          {user.image && <Image source={{ uri: user.image }} style={s.avatar} />}
          <Text style={s.footerName}>{user.name}</Text>
          <Text style={s.footerDot}>{" \u00B7 "}</Text>
          <TouchableOpacity onPress={onOpenSettings}>
            <Text style={s.footerLink}>settings</Text>
          </TouchableOpacity>
          <Text style={s.footerDot}>{" \u00B7 "}</Text>
          <TouchableOpacity onPress={onLogout}>
            <Text style={s.footerLink}>logout</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.obsidian,
  },
  // Toast
  toast: {
    position: "absolute", top: 50, left: 20, right: 20, zIndex: 100,
    padding: 14, alignItems: "center",
  },
  toastText: { color: palette.papyrus, fontSize: 13, fontFamily: fonts.mono, letterSpacing: 0.3 },

  // ── Layout sections (Artifact-style vertical rhythm) ──
  topSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: space.lg,
  },
  midSection: {
    alignItems: "center",
    paddingHorizontal: space.lg,
  },
  footer: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 50,
  },

  // Brand
  brandBlock: { alignItems: "center", marginBottom: space.xl - 8 },
  wordmark: {
    color: palette.papyrus,
    fontSize: 28,
    fontFamily: fonts.monoBold,
    letterSpacing: 5,
    marginBottom: space.sm,
  },
  tagline: {
    color: palette.sandstone,
    fontSize: 18,
    fontFamily: fonts.serifItalic,
    fontStyle: "italic",
  },

  // Actions
  actions: { width: "100%", maxWidth: 320 },
  createBtn: {
    backgroundColor: palette.amber,
    paddingVertical: 14,
    borderRadius: radius.button,
    alignItems: "center",
    ...glow.button,
  },
  createText: {
    color: palette.papyrus,
    fontFamily: fonts.monoBold,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 1,
  },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: space.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: palette.kohl },
  dividerText: {
    color: palette.dust,
    fontSize: 10,
    fontFamily: fonts.mono,
    letterSpacing: 1.5,
    marginHorizontal: 12,
    textTransform: "uppercase",
  },
  joinRow: { flexDirection: "row", gap: space.sm },
  codeCard: { flex: 1 },
  codeInput: {
    paddingHorizontal: space.md,
    paddingVertical: 14,
    color: palette.papyrus,
    textAlign: "center",
    fontFamily: fonts.mono,
    letterSpacing: 4,
    fontSize: 14,
  },
  joinBtn: {
    backgroundColor: palette.groove,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    justifyContent: "center",
    ...glow.subtle,
  },
  joinText: {
    color: palette.papyrus,
    fontFamily: fonts.monoBold,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.5,
  },

  // Footer — signed-in bar
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: { width: 20, height: 20, borderRadius: 10, marginRight: 8 },
  footerName: { color: palette.dust, fontSize: 12, fontFamily: fonts.mono },
  footerDot: { color: palette.dust, fontSize: 12 },
  footerLink: {
    color: palette.dust,
    fontSize: 12,
    fontFamily: fonts.mono,
    textDecorationLine: "underline",
  },
  activeVenues: { marginTop: space.lg, gap: space.sm },
  activeVenueCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: palette.onyx, borderWidth: 1, borderColor: palette.glassBright,
    borderRadius: radius.button, paddingVertical: 12, paddingHorizontal: space.md,
  },
  activeVenueDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#1DB954", marginRight: space.sm },
  activeVenueName: { flex: 1, color: palette.papyrus, fontSize: 14, fontFamily: fonts.monoBold },
  activeVenueAction: { color: palette.amber, fontSize: 10, fontFamily: fonts.monoBold, letterSpacing: 2 },
});
