/**
 * PartyTime Logo — Sirius
 *
 * The brightest star in the sky. Egyptian Sopdet (Isis's star),
 * herald of the new year, the guiding light.
 * Play triangle at its heart — music is the brightest thing in the room.
 *
 * Two renderings:
 * - SiriusMark: Clean SVG (8-pointed star, two overlapping diamonds) — app icon, headers, lobby, all general uses
 * - DotLogo (Starburst pixel grid): Dot-matrix for home/login screens (Artifact aesthetic)
 *
 * Cell values for dot-matrix: 1 = full, 2 = 40% opacity, 3 = 15% opacity
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect, Path, Circle, Line, Polygon } from "react-native-svg";
import { palette } from "./theme";

// ═══════════════════════════════════════════════════════════════
// Clean SVG Mark — S1 "Classic Star"
// Two overlapping rotated squares forming 8-pointed star.
// Play triangle clearly visible at center.
// ═══════════════════════════════════════════════════════════════

export function SiriusMark({ size = 48, color = palette.amber, style }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" style={style}>
      {/* Square 1: rotated 45° — diamond */}
      <Path
        d="M 24 4 L 44 24 L 24 44 L 4 24 Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
        fill="none"
      />
      {/* Square 2: axis-aligned — forms the 8 points */}
      <Path
        d="M 7 7 L 41 7 L 41 41 L 7 41 Z"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
        fill="none"
        opacity={0.4}
      />
      {/* Inner circle — subtle, frames the play button */}
      <Circle
        cx={24} cy={24} r={9}
        stroke={color}
        strokeWidth={1}
        fill="none"
        opacity={0.25}
      />
      {/* Play triangle — dead center, unmistakable */}
      <Polygon
        points="20,17 20,31 32,24"
        fill={color}
        opacity={0.9}
      />
    </Svg>
  );
}


// ═══════════════════════════════════════════════════════════════
// Dot-Matrix Renderer
// ═══════════════════════════════════════════════════════════════

function DotLogo({ pixels, dotSize = 3, gap = 2, color = palette.amber, style }) {
  const pitch = dotSize + gap;
  const rows = pixels.length;
  const cols = pixels[0]?.length || 0;
  const width = cols * pitch;
  const height = rows * pitch;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      {pixels.map((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <Rect
              key={`${r}-${c}`}
              x={c * pitch}
              y={r * pitch}
              width={dotSize}
              height={dotSize}
              rx={dotSize * 0.3}
              fill={color}
              opacity={cell === 2 ? 0.4 : cell === 3 ? 0.15 : 1}
            />
          ) : null
        )
      )}
    </Svg>
  );
}


// ═══════════════════════════════════════════════════════════════
// S2 "Starburst" Pixel Grid — dot-matrix for home/login
// Dramatic cardinal points, bolder play triangle, longer reach.
// ═══════════════════════════════════════════════════════════════

const siriusPixels = [
  [0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,2,0,0,0,1,1,1,1,1,0,0,0,2,0,0,0,0],
  [0,0,0,0,0,2,0,1,1,0,0,0,1,1,0,2,0,0,0,0,0],
  [0,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,0,0,1,0,0,0,0,1,1,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0],
  [0,0,1,1,1,1,0,0,0,1,1,1,0,0,0,1,1,1,1,0,0],
  [1,1,1,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,1,1,1],
  [0,0,1,1,1,1,0,0,0,1,1,1,0,0,0,1,1,1,1,0,0],
  [0,0,0,0,1,1,0,0,0,1,1,0,0,0,0,1,1,0,0,0,0],
  [0,0,0,0,0,1,1,0,0,1,0,0,0,0,1,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,0,0,0,2,0,1,1,0,0,0,1,1,0,2,0,0,0,0,0],
  [0,0,0,0,2,0,0,0,1,1,1,1,1,0,0,0,2,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0],
];


// ── Public API ───────────────────────────────────────────────

/** Dot-matrix Starburst — home/login screens only */
export function Logo({ dotSize = 3, gap = 2, color = palette.amber, style }) {
  return <DotLogo pixels={siriusPixels} dotSize={dotSize} gap={gap} color={color} style={style} />;
}

/** Clean SVG mark — app icon, lobby header, all other uses */
export function LogoMark({ size = 48, color = palette.amber, style }) {
  return <SiriusMark size={size} color={color} style={style} />;
}

export { DotLogo };
