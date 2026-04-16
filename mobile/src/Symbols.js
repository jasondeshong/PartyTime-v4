/**
 * PartyTime Egyptian Symbol Components
 *
 * Abstract, geometric, discoverable-not-obvious.
 * The proportions and geometry of Egyptian symbols,
 * not their visual likeness.
 */
import React from "react";
import Svg, { Path, Circle, Line } from "react-native-svg";
import { palette } from "./theme";

/**
 * Sistrum — Hathor's musical instrument (goddess of music and joy).
 *
 * A real sistrum: U-shaped metal frame on a handle, with horizontal
 * crossbars threaded through the frame that rattle when shaken.
 * Hathor's instrument — literally Egyptian music.
 *
 * Our mark: The arch + crossbars of the sistrum are clearly visible.
 * The negative space between crossbars forms a play-triangle shape
 * that only emerges when you notice it. Reads as "music/sound" to
 * everyone, "sistrum" to those who look closer, "play button" to
 * those who really see it.
 */
export function Sistrum({ size = 48, color = palette.amber, style }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 52" style={style}>
      {/* Naos / arch frame — the U-shaped rattle body */}
      <Path
        d="M 14 38 L 14 18 C 14 8, 34 8, 34 18 L 34 38"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Crossbars — the rattle bars, slightly inset */}
      <Line x1={16} y1={18} x2={32} y2={18} stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.7} />
      <Line x1={15} y1={23} x2={33} y2={23} stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.5} />
      <Line x1={14.5} y1={28} x2={33.5} y2={28} stroke={color} strokeWidth={1.5} strokeLinecap="round" opacity={0.35} />
      {/* Play triangle — formed from the negative space, subtle fill */}
      <Path
        d="M 20 16 L 20 32 L 31 24 Z"
        fill={color}
        opacity={0.12}
      />
      {/* Handle — extends below the arch */}
      <Line x1={24} y1={38} x2={24} y2={48} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      {/* Handle base — small horizontal cap */}
      <Line x1={20} y1={48} x2={28} y2={48} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * ShenRing — Eternity, protection, encircling.
 * Circle with horizontal base — "keeping forever."
 * Used as: Save / add-to-library icon.
 */
export function ShenRing({ size = 24, color = palette.sandstone, filled = false, style }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      <Circle
        cx={12} cy={10} r={7.5}
        stroke={color} strokeWidth={1.5}
        fill={filled ? color : "none"}
        opacity={filled ? 0.15 : 1}
      />
      {/* Horizontal base */}
      <Line x1={7} y1={18} x2={17} y2={18} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={7} y1={17} x2={7} y2={18} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={17} y1={17} x2={17} y2={18} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      {/* + when unsaved, check when saved */}
      {filled ? (
        <Path d="M 9 10 L 11 12.5 L 15.5 7.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : (
        <>
          <Line x1={12} y1={7} x2={12} y2={13} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
          <Line x1={9} y1={10} x2={15} y2={10} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

/**
 * Scarab — Transformation, renewal.
 * Loading/transition states.
 */
export function Scarab({ size = 20, color = palette.amber, style }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" style={style}>
      <Path
        d="M 10 3 C 14 3, 16 7, 16 10 C 16 14, 13 17, 10 17 C 7 17, 4 14, 4 10 C 4 7, 6 3, 10 3 Z"
        fill="none" stroke={color} strokeWidth={1.5}
      />
      <Line x1={10} y1={5} x2={10} y2={15} stroke={color} strokeWidth={1} opacity={0.5} />
      <Path d="M 4 10 L 1 7 M 16 10 L 19 7" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      <Path d="M 5 8 L 2 5 M 15 8 L 18 5" stroke={color} strokeWidth={1} strokeLinecap="round" opacity={0.6} />
    </Svg>
  );
}
