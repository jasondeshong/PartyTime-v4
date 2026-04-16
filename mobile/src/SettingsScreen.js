import { useState, useRef, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Image, StyleSheet,
  ScrollView, Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { palette, fonts, radius, glow, space, type } from "./theme";
import { GlassCard, ExposedGrid } from "./Glass";

/**
 * SettingsScreen — Account, preferences, about, and logout.
 *
 * Props:
 *   user     — { name, email, image, product } from Spotify OAuth
 *   onBack   — returns to HomeScreen
 *   onLogout — logs out and returns to LoginScreen
 */
const GUEST_NAME_KEY = "pt_guest_name";

export default function SettingsScreen({ user, onBack, onLogout }) {
  const [guestName, setGuestName] = useState("");
  const [editingName, setEditingName] = useState(false);

  // Load saved guest name
  useEffect(() => {
    AsyncStorage.getItem(GUEST_NAME_KEY).then((val) => {
      if (val) setGuestName(val);
    }).catch(() => {});
  }, []);

  function saveGuestName(name) {
    setGuestName(name);
    setEditingName(false);
    AsyncStorage.setItem(GUEST_NAME_KEY, name).catch(() => {});
  }

  // ── Staggered entrance animations ──
  const headerFade   = useRef(new Animated.Value(0)).current;
  const headerSlide  = useRef(new Animated.Value(-12)).current;
  const accountFade  = useRef(new Animated.Value(0)).current;
  const accountSlide = useRef(new Animated.Value(16)).current;
  const prefsFade    = useRef(new Animated.Value(0)).current;
  const prefsSlide   = useRef(new Animated.Value(16)).current;
  const aboutFade    = useRef(new Animated.Value(0)).current;
  const aboutSlide   = useRef(new Animated.Value(16)).current;
  const logoutFade   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(headerFade,  { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(accountFade,  { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(accountSlide, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(prefsFade,  { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(prefsSlide, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(aboutFade,  { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(aboutSlide, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]),
      Animated.timing(logoutFade, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={s.container}>
      <ExposedGrid />

      {/* ── Header ── */}
      <Animated.View
        style={[s.header, { opacity: headerFade, transform: [{ translateX: headerSlide }] }]}
      >
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.backArrow}>{"\u2190"}</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>SETTINGS</Text>
      </Animated.View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Account ── */}
        <Animated.View style={{ opacity: accountFade, transform: [{ translateY: accountSlide }] }}>
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <GlassCard intensity={30} borderRadius={radius.card} style={s.card}>
            <View style={s.accountRow}>
              {user?.image ? (
                <Image source={{ uri: user.image }} style={s.profileImage} />
              ) : (
                <View style={[s.profileImage, s.profilePlaceholder]}>
                  <Text style={s.profileInitial}>
                    {(user?.name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={s.accountInfo}>
                <Text style={s.displayName}>{user?.name || "Unknown"}</Text>
                {user?.email ? (
                  <Text style={s.email}>{user.email}</Text>
                ) : null}
                <Text style={s.productBadge}>
                  {user?.premium ? "Spotify Premium" : "Spotify Free"}
                </Text>
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        {/* ── Preferences ── */}
        <Animated.View style={{ opacity: prefsFade, transform: [{ translateY: prefsSlide }] }}>
          <Text style={s.sectionLabel}>PREFERENCES</Text>
          <GlassCard intensity={30} borderRadius={radius.card} style={s.card}>
            <TouchableOpacity
              style={s.prefRow}
              onPress={() => setEditingName(true)}
              activeOpacity={0.7}
            >
              <View style={s.prefInfo}>
                <Text style={s.prefLabel}>Default Guest Name</Text>
                <Text style={s.prefDesc}>
                  {editingName ? "" : guestName || "Tap to set"}
                </Text>
              </View>
              {!editingName && (
                <Text style={s.prefChevron}>{"\u203A"}</Text>
              )}
            </TouchableOpacity>
            {editingName && (
              <View style={s.nameInputRow}>
                <TextInput
                  style={s.nameInput}
                  value={guestName}
                  onChangeText={setGuestName}
                  placeholder="Your name"
                  placeholderTextColor={palette.dust}
                  autoFocus
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={() => saveGuestName(guestName)}
                  onBlur={() => saveGuestName(guestName)}
                />
              </View>
            )}
            <View style={s.divider} />
            <View style={s.prefRow}>
              <View style={s.prefInfo}>
                <Text style={s.prefLabel}>Notifications</Text>
                <Text style={s.prefDesc}>Coming soon</Text>
              </View>
              <View style={s.togglePlaceholder}>
                <View style={s.toggleTrack}>
                  <View style={s.toggleThumb} />
                </View>
              </View>
            </View>
          </GlassCard>
        </Animated.View>

        {/* ── About ── */}
        <Animated.View style={{ opacity: aboutFade, transform: [{ translateY: aboutSlide }] }}>
          <Text style={s.sectionLabel}>ABOUT</Text>
          <GlassCard intensity={30} borderRadius={radius.card} style={s.card}>
            <View style={s.aboutRow}>
              <Text style={s.aboutLabel}>Version</Text>
              <Text style={s.aboutValue}>1.0.0</Text>
            </View>
            <View style={s.divider} />
            <Text style={s.aboutTagline}>everyone's digital jukebox</Text>
            <View style={s.divider} />
            <View style={s.linksRow}>
              <Text style={s.linkText}>Terms</Text>
              <Text style={s.linkDot}>{" \u00B7 "}</Text>
              <Text style={s.linkText}>Privacy</Text>
            </View>
          </GlassCard>
        </Animated.View>

        {/* ── Log Out ── */}
        <Animated.View style={{ opacity: logoutFade }}>
          <TouchableOpacity style={s.logoutBtn} onPress={onLogout} activeOpacity={0.8}>
            <Text style={s.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.obsidian,
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  backArrow: {
    color: palette.amber,
    fontSize: 22,
    fontFamily: fonts.mono,
    marginRight: space.md,
  },
  headerTitle: {
    color: palette.papyrus,
    fontSize: 16,
    fontFamily: fonts.monoBold,
    letterSpacing: 4,
  },

  // ── Scroll ──
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: 60,
  },

  // ── Section labels ──
  sectionLabel: {
    ...type.label,
    color: palette.dust,
    fontFamily: fonts.monoBold,
    marginTop: space.lg,
    marginBottom: space.sm,
    marginLeft: space.xs,
  },

  // ── Cards ──
  card: {
    padding: space.md,
  },

  // ── Account section ──
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  profileImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: space.md,
  },
  profilePlaceholder: {
    backgroundColor: palette.groove,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInitial: {
    color: palette.papyrus,
    fontSize: 22,
    fontFamily: fonts.monoBold,
  },
  accountInfo: {
    flex: 1,
  },
  displayName: {
    color: palette.papyrus,
    fontSize: 17,
    fontFamily: fonts.monoBold,
    marginBottom: 2,
  },
  email: {
    color: palette.sandstone,
    fontSize: 12,
    fontFamily: fonts.mono,
    marginBottom: 4,
  },
  productBadge: {
    color: palette.spotifyGreen,
    fontSize: 11,
    fontFamily: fonts.monoBold,
    letterSpacing: 0.5,
  },

  // ── Preferences section ──
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.sm,
  },
  prefInfo: { flex: 1 },
  prefLabel: {
    color: palette.papyrus,
    fontSize: 14,
    fontFamily: fonts.mono,
  },
  prefDesc: {
    color: palette.sandstone,
    fontSize: 12,
    fontFamily: fonts.serifItalic,
    fontStyle: "italic",
    marginTop: 2,
  },
  prefChevron: {
    color: palette.dust,
    fontSize: 22,
    fontFamily: fonts.mono,
    marginLeft: space.sm,
  },
  nameInputRow: {
    marginBottom: space.xs,
  },
  nameInput: {
    color: palette.papyrus,
    fontSize: 14,
    fontFamily: fonts.mono,
    borderBottomWidth: 1,
    borderBottomColor: palette.amber,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
  togglePlaceholder: { opacity: 0.4 },
  toggleTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.groove,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: palette.dust,
  },

  // ── Divider ──
  divider: {
    height: 1,
    backgroundColor: palette.glassBorder,
    marginVertical: space.xs,
  },

  // ── About section ──
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.sm,
  },
  aboutLabel: {
    color: palette.papyrus,
    fontSize: 14,
    fontFamily: fonts.mono,
  },
  aboutValue: {
    color: palette.sandstone,
    fontSize: 14,
    fontFamily: fonts.mono,
    letterSpacing: 1,
  },
  aboutTagline: {
    color: palette.sandstone,
    fontSize: 16,
    fontFamily: fonts.serifItalic,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: space.sm,
  },
  linksRow: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: space.sm,
  },
  linkText: {
    color: palette.dust,
    fontSize: 12,
    fontFamily: fonts.mono,
    letterSpacing: 0.5,
  },
  linkDot: {
    color: palette.dust,
    fontSize: 12,
  },

  // ── Log Out ──
  logoutBtn: {
    marginTop: space.lg,
    backgroundColor: palette.scarabRed,
    paddingVertical: 14,
    borderRadius: radius.button,
    alignItems: "center",
  },
  logoutText: {
    color: palette.papyrus,
    fontFamily: fonts.monoBold,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 1,
  },
});
