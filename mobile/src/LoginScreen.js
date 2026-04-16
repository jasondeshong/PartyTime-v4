import { useState, useRef, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Platform, Animated, KeyboardAvoidingView,
} from "react-native";
import { palette, fonts, radius, glow, space } from "./theme";
import { Logo } from "./Logo";
import { GlassCard, ExposedGrid } from "./Glass";

/**
 * LoginScreen — Artifact-inspired layout.
 *
 * Top: Sirius mark (large dot-matrix, centered)
 * Middle: PARTYTIME + tagline
 * Below: Spotify auth + guest join
 * Bottom: "or continue without account" equivalent
 */
export default function LoginScreen({ onLogin, onGuestJoin }) {
  const [guestName, setGuestName] = useState("");
  const [lobbyCode, setLobbyCode] = useState("");

  // Entrance animations
  const logoFade = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const titleFade = useRef(new Animated.Value(0)).current;
  const actionsFade = useRef(new Animated.Value(0)).current;
  const actionsSlide = useRef(new Animated.Value(16)).current;

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
    ]).start();
  }, []);

  function handleGuestJoin() {
    const name = guestName.trim();
    const code = lobbyCode.trim().toUpperCase();
    if (!name || !code) return;
    onGuestJoin({ name, code });
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Background grid */}
      <ExposedGrid />

      {/* ── Top section: Dot-matrix logo (Artifact style) ── */}
      <View style={s.topSection}>
        <Animated.View style={{ opacity: logoFade, transform: [{ scale: logoScale }] }}>
          <Logo dotSize={4} gap={2} color={palette.amber} />
        </Animated.View>
      </View>

      {/* ── Middle: Wordmark + tagline + auth ── */}
      <View style={s.midSection}>
        <Animated.View style={[s.brandBlock, { opacity: titleFade }]}>
          <Text style={s.wordmark}>PARTYTIME</Text>
          <Text style={s.tagline}>everyone's digital jukebox</Text>
        </Animated.View>

        <Animated.View style={[s.actions, { opacity: actionsFade, transform: [{ translateY: actionsSlide }] }]}>
          {/* Spotify — the only green in the app */}
          <TouchableOpacity style={s.spotifyBtn} onPress={onLogin} activeOpacity={0.8}>
            <Text style={s.spotifyBtnText}>Host with Spotify</Text>
          </TouchableOpacity>

          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or join as guest</Text>
            <View style={s.dividerLine} />
          </View>

          <GlassCard intensity={25} borderRadius={radius.button} style={s.inputCard}>
            <TextInput
              style={s.nameInput}
              placeholder="your name"
              placeholderTextColor={palette.dust}
              value={guestName}
              onChangeText={setGuestName}
              autoCorrect={false}
            />
          </GlassCard>

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
                onSubmitEditing={handleGuestJoin}
                returnKeyType="join"
              />
            </GlassCard>
            <TouchableOpacity style={s.joinBtn} onPress={handleGuestJoin} activeOpacity={0.8}>
              <Text style={s.joinText}>Join</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      {/* ── Bottom spacer ── */}
      <View style={s.bottomSection} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.obsidian,
  },
  // ── Layout sections (Artifact vertical rhythm) ──
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
  bottomSection: {
    flex: 1,
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
  spotifyBtn: {
    backgroundColor: palette.spotifyGreen,
    paddingVertical: 14,
    borderRadius: radius.button,
    alignItems: "center",
  },
  spotifyBtnText: {
    color: palette.obsidian,
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
  inputCard: { marginBottom: space.sm },
  nameInput: {
    paddingHorizontal: space.md,
    paddingVertical: 14,
    color: palette.papyrus,
    textAlign: "center",
    fontSize: 14,
    fontFamily: fonts.mono,
    letterSpacing: 0.5,
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
});
