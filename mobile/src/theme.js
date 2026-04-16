/**
 * PartyTime Design System
 * Brand guide tokens — palette, typography, spacing, glass, glow.
 * Single source of truth for every screen.
 */
import { Platform, StyleSheet } from "react-native";

// ── Color System ──────────────────────────────────────────────
export const palette = {
  // Primary
  obsidian:    "#080808",
  onyx:        "#121210",
  amber:       "#D4884A",
  papyrus:     "#F0ECE4",

  // Secondary
  amberDim:    "rgba(212,136,74,0.5)",
  amberGlow:   "rgba(212,136,74,0.12)",
  amberGlow20: "rgba(212,136,74,0.20)",
  sandstone:   "rgba(200,194,180,0.55)",
  dust:        "rgba(200,194,180,0.25)",
  groove:      "rgba(58,52,40,0.3)",
  kohl:        "rgba(58,52,40,0.35)",
  scarabRed:   "#E05555",
  spotifyGreen:"#1DB954",

  // Glass / Transparency
  glass:       "rgba(240,236,228,0.04)",
  glassBorder: "rgba(240,236,228,0.08)",
  glassStrong: "rgba(240,236,228,0.07)",
  glassBright: "rgba(240,236,228,0.12)",

  // Texture
  scanLine:    "rgba(240,236,228,0.025)",
  dotMatrix:   "rgba(240,236,228,0.06)",
};

// ── Typography ────────────────────────────────────────────────
// Font family names — loaded via useFonts in App.js
export const fonts = {
  serif:      "InstrumentSerif_400Regular",
  serifItalic:"InstrumentSerif_400Regular_Italic",
  mono:       "SpaceMono_400Regular",
  monoBold:   "SpaceMono_700Bold",
  // System fallbacks (used before fonts load)
  systemMono: Platform.OS === "ios" ? "Menlo" : "monospace",
};

// Type scale per brand guide
export const type = {
  screenTitle:   { fontSize: 36, fontWeight: "800", letterSpacing: -0.5 },
  sectionHeader: { fontSize: 18, fontWeight: "800", letterSpacing: 1.5 },
  npTitle:       { fontSize: 17, fontWeight: "700" },
  cardTitle:     { fontSize: 15, fontWeight: "700" },
  body:          { fontSize: 14, fontWeight: "400" },
  label:         { fontSize: 9, fontWeight: "700", letterSpacing: 2.5, textTransform: "uppercase" },
  meta:          { fontSize: 11, fontWeight: "400", letterSpacing: 0.5 },
  code:          { fontSize: 11, fontWeight: "400", letterSpacing: 4 },
};

// ── Spacing ───────────────────────────────────────────────────
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 48,
};

// ── Border Radius ─────────────────────────────────────────────
export const radius = {
  card:    24,
  button:  14,
  albumLg: 14,
  albumSm: 10,
  chip:    12,
  pill:    20,
  circle:  999,
};

// ── Glow / Shadow (candlelit amber) ───────────────────────────
export const glow = {
  card: {
    shadowColor: palette.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 6,
  },
  hero: {
    shadowColor: palette.amber,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 12,
  },
  button: {
    shadowColor: palette.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  subtle: {
    shadowColor: palette.amber,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
};

// ── Glass surface presets ─────────────────────────────────────
export const glass = {
  surface: {
    backgroundColor: palette.onyx,
    borderWidth: 1,
    borderColor: palette.glassBorder,
  },
  card: {
    backgroundColor: palette.onyx,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderRadius: radius.card,
  },
  input: {
    backgroundColor: palette.onyx,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderRadius: radius.button,
  },
};
