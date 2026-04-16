/**
 * Glass & Texture Components
 *
 * Glass surfaces — semi-transparent dark backgrounds with
 * warm amber tint, specular top edge, and candlelit glow.
 *
 * Note: BlurView (expo-blur) was removed because the native
 * UIVisualEffectView renders on top of children regardless of
 * zIndex, making album art and other content invisible.
 * The glass effect now comes from layered translucent Views
 * which is reliable across all platforms.
 */
import React from "react";
import { View, StyleSheet } from "react-native";
import { palette } from "./theme";

/**
 * GlassCard — Translucent glass surface.
 * Semi-transparent dark background + warm amber tint +
 * specular 1px top highlight + subtle border.
 *
 * glow: optional shadow preset from theme.glow
 * allowOverflow: if true, content can extend beyond bounds (for rolodex)
 */
export function GlassCard({
  children,
  style,
  intensity = 30, // kept for API compat, controls background opacity
  borderRadius = 24,
  glow,
  noBorder = false,
  allowOverflow = false,
}) {
  // Map intensity (0-100) to background opacity (0.15 – 0.55)
  const bgOpacity = 0.15 + (intensity / 100) * 0.4;

  return (
    <View
      style={[
        styles.glassOuter,
        {
          borderRadius,
          overflow: allowOverflow ? "visible" : "hidden",
          backgroundColor: `rgba(18,18,16,${bgOpacity.toFixed(2)})`,
        },
        glow,
        !noBorder && styles.glassBorder,
        style,
      ]}
    >
      {/* Warm tint — barely-there amber wash, behind content */}
      <View
        style={[StyleSheet.absoluteFill, styles.warmTint, { borderRadius }]}
        pointerEvents="none"
      />
      {/* Specular top edge — light-catching highlight */}
      {!noBorder && (
        <View
          style={[styles.topEdge, {
            borderTopLeftRadius: borderRadius,
            borderTopRightRadius: borderRadius,
          }]}
          pointerEvents="none"
        />
      )}
      {/* Content — renders naturally in flex flow */}
      {children}
    </View>
  );
}

/**
 * ScanLines — Subtle CRT texture overlay.
 * 1px horizontal lines at 4px pitch.
 */
const SCAN_COUNT = 150;
const scanIndices = Array.from({ length: SCAN_COUNT }, (_, i) => i);

export function ScanLines() {
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]} pointerEvents="none">
      {scanIndices.map((i) => (
        <View key={i} style={styles.scanLine} />
      ))}
    </View>
  );
}

/**
 * DotMatrix — Exposed grid / PCB dot pattern.
 */
const DOT_COLS = 40;
const DOT_ROWS = 20;
const dotRows = Array.from({ length: DOT_ROWS }, (_, i) => i);
const dotCols = Array.from({ length: DOT_COLS }, (_, i) => i);

export function DotMatrix() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.dotContainer]} pointerEvents="none">
      {dotRows.map((r) => (
        <View key={r} style={styles.dotRow}>
          {dotCols.map((c) => (
            <View key={c} style={styles.dotCell}>
              <View style={styles.dot} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * ExposedGrid — 24px grid lines. Nothing Phone PCB traces.
 */
export function ExposedGrid({ columns = 16, rows = 40 }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: columns }, (_, i) => (
        <View
          key={`v${i}`}
          style={[styles.gridLine, {
            position: "absolute",
            left: (i + 1) * 24,
            top: 0, bottom: 0, width: 1,
          }]}
        />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={`h${i}`}
          style={[styles.gridLine, {
            position: "absolute",
            top: (i + 1) * 24,
            left: 0, right: 0, height: 1,
          }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  glassOuter: {
    // backgroundColor is computed dynamically from intensity prop
  },
  glassBorder: {
    borderWidth: 1,
    borderColor: palette.glassBright,
  },
  warmTint: {
    backgroundColor: "rgba(212,136,74,0.03)",
  },
  topEdge: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    height: 1,
    backgroundColor: "rgba(240,236,228,0.15)",
    zIndex: 1,
  },
  scanLine: {
    height: 1,
    backgroundColor: palette.scanLine,
    marginBottom: 3,
  },
  dotContainer: {
    overflow: "hidden",
    flexDirection: "column",
    padding: 4,
  },
  dotRow: { flexDirection: "row", height: 8 },
  dotCell: { width: 8, height: 8, alignItems: "center", justifyContent: "center" },
  dot: { width: 1.5, height: 1.5, borderRadius: 0.75, backgroundColor: palette.dotMatrix },
  gridLine: { backgroundColor: palette.glassBorder },
});
