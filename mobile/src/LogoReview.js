/**
 * Logo Review Screen — DEPRECATED
 * Logo has been chosen: Sirius (S1 clean SVG + S2 dot-matrix starburst).
 * This file can be deleted. Kept as no-op to avoid import errors in App.js.
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Logo, SiriusMark } from "./Logo";
import { palette, fonts } from "./theme";

export default function LogoReview() {
  return (
    <View style={s.container}>
      <Text style={s.title}>SIRIUS</Text>
      <Text style={s.subtitle}>Logo chosen — disable SHOW_LOGO_REVIEW</Text>
      <View style={{ marginVertical: 32 }}>
        <SiriusMark size={80} color={palette.amber} />
      </View>
      <Logo dotSize={5} gap={2.5} color={palette.amber} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.obsidian, alignItems: "center", justifyContent: "center" },
  title: { color: palette.papyrus, fontSize: 18, fontFamily: fonts.monoBold, letterSpacing: 3, marginBottom: 4 },
  subtitle: { color: palette.dust, fontSize: 12, fontFamily: fonts.mono, marginBottom: 16 },
});
