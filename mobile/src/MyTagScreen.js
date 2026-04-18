import { useState, useRef, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Alert,
  StyleSheet, Animated, Platform,
} from "react-native";
import { palette, fonts, radius, glow, space, type } from "./theme";
import { GlassCard, ExposedGrid } from "./Glass";
import { ShenRing } from "./Symbols";

let NfcManager = null;
let Ndef = null;
try {
  const nfc = require("react-native-nfc-manager");
  NfcManager = nfc.default;
  Ndef = nfc.Ndef;
} catch {}

const TAG_MODES = [
  { key: "lobby", icon: "♫", label: "My PartyTime Lobby", desc: "Anyone who taps joins your lobby" },
  { key: "link", icon: "🔗", label: "A Link", desc: "Opens any website or app" },
  { key: "contact", icon: "👤", label: "My Contact Card", desc: "Shares your name, phone, or email" },
  { key: "text", icon: "✎", label: "Custom Text", desc: "Write anything you want" },
];

export default function MyTagScreen({ user, lobbyCode, onBack }) {
  const [mode, setMode] = useState(null);
  const [value, setValue] = useState("");
  const [contactName, setContactName] = useState(user?.name || "");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [writing, setWriting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(null);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-12)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(headerFade, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(headerSlide, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(contentFade, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(contentSlide, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  useEffect(() => {
    (async () => {
      if (!NfcManager) { setNfcSupported(false); return; }
      try {
        const supported = await NfcManager.isSupported();
        setNfcSupported(supported);
        if (supported) await NfcManager.start();
      } catch { setNfcSupported(false); }
    })();
    return () => { if (NfcManager) NfcManager.cancelTechnologyRequest().catch(() => {}); };
  }, []);

  function getPayload() {
    switch (mode) {
      case "lobby":
        return `https://partytime.app/join/${lobbyCode || "NEW"}`;
      case "link":
        return value.startsWith("http") ? value : `https://${value}`;
      case "contact": {
        const parts = [`FN:${contactName}`];
        if (contactPhone) parts.push(`TEL:${contactPhone}`);
        if (contactEmail) parts.push(`EMAIL:${contactEmail}`);
        return `BEGIN:VCARD\nVERSION:3.0\n${parts.join("\n")}\nEND:VCARD`;
      }
      case "text":
        return value;
      default:
        return "";
    }
  }

  async function writeTag() {
    if (!NfcManager || !Ndef) {
      Alert.alert("NFC Not Available", "This device doesn't support NFC writing. A dev client rebuild with react-native-nfc-manager is needed.");
      return;
    }
    const payload = getPayload();
    if (!payload) { Alert.alert("Nothing to write", "Fill in the details first"); return; }

    setWriting(true);
    setSuccess(false);
    try {
      await NfcManager.requestTechnology("Ndef");

      let bytes;
      if (mode === "contact") {
        bytes = Ndef.encodeMessage([Ndef.record(Ndef.TNF_MIME_MEDIA, "text/vcard", "", payload)]);
      } else if (mode === "link" || mode === "lobby") {
        bytes = Ndef.encodeMessage([Ndef.uriRecord(payload)]);
      } else {
        bytes = Ndef.encodeMessage([Ndef.textRecord(payload)]);
      }

      await NfcManager.ndefHandler.writeNdefMessage(bytes);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      if (e?.message !== "cancelled") {
        Alert.alert("Write Failed", e?.message || "Hold your phone steady on the tag");
      }
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
      setWriting(false);
    }
  }

  async function readTag() {
    if (!NfcManager) return;
    try {
      await NfcManager.requestTechnology("Ndef");
      const tag = await NfcManager.getTag();
      if (tag?.ndefMessage?.[0]) {
        const record = tag.ndefMessage[0];
        const text = Ndef.text.decodePayload(new Uint8Array(record.payload));
        Alert.alert("Tag Contents", text || "(empty)");
      } else {
        Alert.alert("Empty Tag", "This tag has no data");
      }
    } catch (e) {
      if (e?.message !== "cancelled") Alert.alert("Read Failed", e?.message || "Try again");
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }

  return (
    <View style={s.container}>
      <ExposedGrid />

      <Animated.View style={[s.header, { opacity: headerFade, transform: [{ translateX: headerSlide }] }]}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.backArrow}>{"\u2190"}</Text>
        </TouchableOpacity>
        <ShenRing size={20} color={palette.amber} style={{ marginRight: space.sm }} />
        <Text style={s.headerTitle}>MY TAG</Text>
      </Animated.View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: contentFade, transform: [{ translateY: contentSlide }] }}>

          {nfcSupported === false && (
            <View style={s.nfcWarning}>
              <Text style={s.nfcWarningText}>
                NFC writing requires a dev client rebuild with react-native-nfc-manager.
                You can still set up what your tag will do — write it when the build is ready.
              </Text>
            </View>
          )}

          {/* Step 1: Choose what your tag does */}
          <Text style={s.stepLabel}>WHAT SHOULD YOUR TAG DO?</Text>
          {TAG_MODES.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[s.modeCard, mode === m.key && { borderColor: palette.amber }]}
              onPress={() => { setMode(m.key); setValue(""); setSuccess(false); }}
              activeOpacity={0.7}
            >
              <Text style={s.modeIcon}>{m.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.modeLabel}>{m.label}</Text>
                <Text style={s.modeDesc}>{m.desc}</Text>
              </View>
              {mode === m.key && <Text style={s.modeCheck}>✓</Text>}
            </TouchableOpacity>
          ))}

          {/* Step 2: Fill in details */}
          {mode && (
            <>
              <Text style={[s.stepLabel, { marginTop: space.lg }]}>
                {mode === "lobby" ? "YOUR LOBBY" : mode === "link" ? "ENTER THE LINK" : mode === "contact" ? "YOUR INFO" : "YOUR MESSAGE"}
              </Text>

              {mode === "lobby" && (
                <View style={s.previewCard}>
                  <Text style={s.previewLabel}>People who tap will join:</Text>
                  <Text style={s.previewValue}>partytime.app/join/{lobbyCode || "your-next-lobby"}</Text>
                  <Text style={s.previewHint}>Updates automatically when you start a lobby</Text>
                </View>
              )}

              {mode === "link" && (
                <TextInput
                  style={s.input}
                  value={value}
                  onChangeText={setValue}
                  placeholder="example.com or full URL"
                  placeholderTextColor={palette.dust}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              )}

              {mode === "contact" && (
                <>
                  <TextInput style={s.input} value={contactName} onChangeText={setContactName} placeholder="Your name" placeholderTextColor={palette.dust} />
                  <TextInput style={s.input} value={contactPhone} onChangeText={setContactPhone} placeholder="Phone (optional)" placeholderTextColor={palette.dust} keyboardType="phone-pad" />
                  <TextInput style={s.input} value={contactEmail} onChangeText={setContactEmail} placeholder="Email (optional)" placeholderTextColor={palette.dust} keyboardType="email-address" autoCapitalize="none" />
                </>
              )}

              {mode === "text" && (
                <TextInput
                  style={[s.input, { height: 100, textAlignVertical: "top" }]}
                  value={value}
                  onChangeText={setValue}
                  placeholder="Write anything..."
                  placeholderTextColor={palette.dust}
                  multiline
                />
              )}

              {/* Step 3: Write */}
              <TouchableOpacity
                style={[s.writeBtn, success && s.writeBtnSuccess]}
                onPress={writeTag}
                disabled={writing}
                activeOpacity={0.8}
              >
                <Text style={s.writeBtnText}>
                  {writing ? "Hold phone on tag..." : success ? "Written!" : "Write to Tag"}
                </Text>
              </TouchableOpacity>

              {writing && (
                <Text style={s.writingHint}>Hold the top of your phone against the NFC tag</Text>
              )}
            </>
          )}

          {/* Read existing tag */}
          <TouchableOpacity style={s.readBtn} onPress={readTag} activeOpacity={0.7}>
            <Text style={s.readBtnText}>Read a Tag</Text>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.obsidian },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingTop: 60, paddingHorizontal: space.lg, paddingBottom: space.md,
  },
  backArrow: { color: palette.amber, fontSize: 22, fontFamily: fonts.mono, marginRight: space.md },
  headerTitle: { color: palette.papyrus, fontSize: 16, fontFamily: fonts.monoBold, letterSpacing: 4 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: space.lg, paddingBottom: 60 },

  nfcWarning: { backgroundColor: palette.groove, borderRadius: radius.button, padding: space.md, marginBottom: space.md },
  nfcWarningText: { color: palette.sandstone, fontSize: 12, fontFamily: fonts.mono, lineHeight: 18 },

  stepLabel: { ...type.label, color: palette.dust, fontFamily: fonts.monoBold, marginBottom: space.sm, marginLeft: space.xs },

  modeCard: {
    flexDirection: "row", alignItems: "center", gap: space.md,
    backgroundColor: palette.onyx, borderWidth: 1, borderColor: palette.glassBorder,
    borderRadius: radius.button, padding: space.md, marginBottom: space.sm,
  },
  modeIcon: { fontSize: 24, width: 36, textAlign: "center" },
  modeLabel: { color: palette.papyrus, fontSize: 15, fontFamily: fonts.monoBold },
  modeDesc: { color: palette.sandstone, fontSize: 12, fontFamily: fonts.serifItalic, fontStyle: "italic", marginTop: 2 },
  modeCheck: { color: palette.amber, fontSize: 18, fontFamily: fonts.monoBold },

  previewCard: { backgroundColor: palette.onyx, borderRadius: radius.button, padding: space.md, marginBottom: space.sm },
  previewLabel: { color: palette.sandstone, fontSize: 12, fontFamily: fonts.mono, marginBottom: space.xs },
  previewValue: { color: palette.amber, fontSize: 14, fontFamily: fonts.mono },
  previewHint: { color: palette.dust, fontSize: 11, fontFamily: fonts.serifItalic, fontStyle: "italic", marginTop: space.xs },

  input: {
    color: palette.papyrus, fontSize: 14, fontFamily: fonts.mono,
    backgroundColor: palette.onyx, borderWidth: 1, borderColor: palette.glassBorder,
    borderRadius: radius.button, padding: space.md, marginBottom: space.sm,
  },

  writeBtn: {
    backgroundColor: palette.amber, borderRadius: radius.button,
    paddingVertical: 14, alignItems: "center", marginTop: space.sm,
    ...glow.button,
  },
  writeBtnSuccess: { backgroundColor: "#1DB954" },
  writeBtnText: { color: palette.obsidian, fontSize: 15, fontFamily: fonts.monoBold, letterSpacing: 1 },
  writingHint: { color: palette.sandstone, fontSize: 12, fontFamily: fonts.serifItalic, fontStyle: "italic", textAlign: "center", marginTop: space.sm },

  readBtn: {
    marginTop: space.xl, borderWidth: 1, borderColor: palette.glassBorder,
    borderRadius: radius.button, paddingVertical: 12, alignItems: "center",
  },
  readBtnText: { color: palette.dust, fontSize: 13, fontFamily: fonts.mono, letterSpacing: 1 },
});
