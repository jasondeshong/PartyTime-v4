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
  { key: "lobby", icon: "♫", label: "PartyTime Lobby", desc: "Tap to join your lobby" },
  { key: "wifi", icon: "📶", label: "WiFi Network", desc: "Auto-connect to your WiFi" },
  { key: "social", icon: "📱", label: "Social Profile", desc: "Open your Instagram, TikTok, X, etc." },
  { key: "payment", icon: "💰", label: "Payment", desc: "Venmo, CashApp, or PayPal link" },
  { key: "link", icon: "🔗", label: "Website Link", desc: "Open any URL" },
  { key: "contact", icon: "👤", label: "Contact Card", desc: "Share your name, phone, email" },
  { key: "location", icon: "📍", label: "Location", desc: "Open a place in Maps" },
  { key: "event", icon: "📅", label: "Calendar Event", desc: "Add an event to their calendar" },
  { key: "app", icon: "🚀", label: "App Link", desc: "Deep link to Spotify, YouTube, etc." },
  { key: "photo", icon: "🖼", label: "Photo Album", desc: "Link to a shared album" },
  { key: "text", icon: "✎", label: "Custom Text", desc: "Write anything you want" },
];

const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", prefix: "https://instagram.com/" },
  { key: "tiktok", label: "TikTok", prefix: "https://tiktok.com/@" },
  { key: "x", label: "X / Twitter", prefix: "https://x.com/" },
  { key: "snapchat", label: "Snapchat", prefix: "https://snapchat.com/add/" },
  { key: "linkedin", label: "LinkedIn", prefix: "https://linkedin.com/in/" },
  { key: "youtube", label: "YouTube", prefix: "https://youtube.com/@" },
  { key: "spotify", label: "Spotify", prefix: "https://open.spotify.com/user/" },
  { key: "github", label: "GitHub", prefix: "https://github.com/" },
];

const PAYMENT_PLATFORMS = [
  { key: "venmo", label: "Venmo", prefix: "https://venmo.com/" },
  { key: "cashapp", label: "CashApp", prefix: "https://cash.app/$" },
  { key: "paypal", label: "PayPal", prefix: "https://paypal.me/" },
];

export default function MyTagScreen({ user, lobbyCode, onBack }) {
  const [mode, setMode] = useState(null);
  const [value, setValue] = useState("");
  const [socialPlatform, setSocialPlatform] = useState(null);
  const [paymentPlatform, setPaymentPlatform] = useState(null);
  const [contactName, setContactName] = useState(user?.name || "");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [wifiName, setWifiName] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [wifiEncryption, setWifiEncryption] = useState("WPA");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
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
        return `https://party-time-v4.vercel.app/join/${lobbyCode || "NEW"}`;
      case "wifi":
        return `WIFI:T:${wifiEncryption};S:${wifiName};P:${wifiPassword};;`;
      case "social":
        if (!socialPlatform || !value) return "";
        return socialPlatform.prefix + value.replace(/^@/, "");
      case "payment":
        if (!paymentPlatform || !value) return "";
        return paymentPlatform.prefix + value.replace(/^[$@]/, "");
      case "link":
        return value.startsWith("http") ? value : `https://${value}`;
      case "contact": {
        const parts = [`FN:${contactName}`];
        if (contactPhone) parts.push(`TEL:${contactPhone}`);
        if (contactEmail) parts.push(`EMAIL:${contactEmail}`);
        return `BEGIN:VCARD\nVERSION:3.0\n${parts.join("\n")}\nEND:VCARD`;
      }
      case "location":
        return value.startsWith("http") ? value : `https://maps.apple.com/?q=${encodeURIComponent(value)}`;
      case "event": {
        const dt = eventDate ? eventDate.replace(/[-:]/g, "").replace(" ", "T") + "00" : "";
        return `BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:${eventTitle}\nDTSTART:${dt}\nLOCATION:${eventLocation}\nEND:VEVENT\nEND:VCALENDAR`;
      }
      case "app":
      case "photo":
        return value.startsWith("http") ? value : `https://${value}`;
      case "text":
        return value;
      default:
        return "";
    }
  }

  function isUrlType() {
    return ["lobby", "social", "payment", "link", "app", "photo", "location"].includes(mode);
  }

  async function writeTag() {
    const payload = getPayload();
    if (!payload) { Alert.alert("Nothing to write", "Fill in the details first"); return; }

    if (!NfcManager || !Ndef) {
      Alert.alert(
        "NFC Not Ready",
        "NFC tag writing will be available after the next app update. Your settings are saved — come back to write when it's ready."
      );
      return;
    }

    setWriting(true);
    setSuccess(false);
    try {
      await NfcManager.requestTechnology("Ndef");

      let bytes;
      if (mode === "wifi") {
        bytes = Ndef.encodeMessage([Ndef.record(Ndef.TNF_MIME_MEDIA, "application/vnd.wfa.wsc", "", payload)]);
      } else if (mode === "contact") {
        bytes = Ndef.encodeMessage([Ndef.record(Ndef.TNF_MIME_MEDIA, "text/vcard", "", payload)]);
      } else if (mode === "event") {
        bytes = Ndef.encodeMessage([Ndef.record(Ndef.TNF_MIME_MEDIA, "text/calendar", "", payload)]);
      } else if (isUrlType()) {
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
    if (!NfcManager) {
      Alert.alert("NFC Not Ready", "Available after the next app update.");
      return;
    }
    try {
      await NfcManager.requestTechnology("Ndef");
      const tag = await NfcManager.getTag();
      if (tag?.ndefMessage?.[0]) {
        const record = tag.ndefMessage[0];
        let text;
        try { text = Ndef.text.decodePayload(new Uint8Array(record.payload)); } catch {}
        if (!text) try { text = Ndef.uri.decodePayload(new Uint8Array(record.payload)); } catch {}
        Alert.alert("Tag Contents", text || "(couldn't read)");
      } else {
        Alert.alert("Empty Tag", "This tag has no data");
      }
    } catch (e) {
      if (e?.message !== "cancelled") Alert.alert("Read Failed", e?.message || "Try again");
    } finally {
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }

  function renderDetails() {
    if (!mode) return null;

    switch (mode) {
      case "lobby":
        return (
          <View style={s.detailCard}>
            <Text style={s.detailLabel}>People who tap will join:</Text>
            <Text style={s.detailValue}>party-time-v4.vercel.app/join/{lobbyCode || "your-next-lobby"}</Text>
            <Text style={s.detailHint}>Creates automatically when you start a lobby</Text>
          </View>
        );

      case "wifi":
        return (
          <>
            <TextInput style={s.input} value={wifiName} onChangeText={setWifiName} placeholder="WiFi network name" placeholderTextColor={palette.dust} />
            <TextInput style={s.input} value={wifiPassword} onChangeText={setWifiPassword} placeholder="Password" placeholderTextColor={palette.dust} secureTextEntry />
            <View style={s.chipRow}>
              {["WPA", "WEP", "None"].map((enc) => (
                <TouchableOpacity key={enc} style={[s.encChip, wifiEncryption === enc && s.encChipActive]} onPress={() => setWifiEncryption(enc)}>
                  <Text style={[s.encChipText, wifiEncryption === enc && s.encChipTextActive]}>{enc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        );

      case "social":
        return (
          <>
            <View style={s.platformGrid}>
              {SOCIAL_PLATFORMS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[s.platformChip, socialPlatform?.key === p.key && s.platformChipActive]}
                  onPress={() => setSocialPlatform(p)}
                >
                  <Text style={[s.platformText, socialPlatform?.key === p.key && s.platformTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {socialPlatform && (
              <TextInput style={s.input} value={value} onChangeText={setValue} placeholder={`Your ${socialPlatform.label} username`} placeholderTextColor={palette.dust} autoCapitalize="none" autoCorrect={false} />
            )}
          </>
        );

      case "payment":
        return (
          <>
            <View style={s.platformGrid}>
              {PAYMENT_PLATFORMS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[s.platformChip, paymentPlatform?.key === p.key && s.platformChipActive]}
                  onPress={() => setPaymentPlatform(p)}
                >
                  <Text style={[s.platformText, paymentPlatform?.key === p.key && s.platformTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {paymentPlatform && (
              <TextInput style={s.input} value={value} onChangeText={setValue} placeholder={`Your ${paymentPlatform.label} username`} placeholderTextColor={palette.dust} autoCapitalize="none" autoCorrect={false} />
            )}
          </>
        );

      case "contact":
        return (
          <>
            <TextInput style={s.input} value={contactName} onChangeText={setContactName} placeholder="Your name" placeholderTextColor={palette.dust} />
            <TextInput style={s.input} value={contactPhone} onChangeText={setContactPhone} placeholder="Phone (optional)" placeholderTextColor={palette.dust} keyboardType="phone-pad" />
            <TextInput style={s.input} value={contactEmail} onChangeText={setContactEmail} placeholder="Email (optional)" placeholderTextColor={palette.dust} keyboardType="email-address" autoCapitalize="none" />
          </>
        );

      case "location":
        return (
          <TextInput style={s.input} value={value} onChangeText={setValue} placeholder="Address or place name" placeholderTextColor={palette.dust} />
        );

      case "event":
        return (
          <>
            <TextInput style={s.input} value={eventTitle} onChangeText={setEventTitle} placeholder="Event name" placeholderTextColor={palette.dust} />
            <TextInput style={s.input} value={eventDate} onChangeText={setEventDate} placeholder="Date (2026-04-20 8:00 PM)" placeholderTextColor={palette.dust} />
            <TextInput style={s.input} value={eventLocation} onChangeText={setEventLocation} placeholder="Location (optional)" placeholderTextColor={palette.dust} />
          </>
        );

      case "link":
      case "app":
      case "photo":
        return (
          <TextInput style={s.input} value={value} onChangeText={setValue}
            placeholder={mode === "app" ? "App or deep link URL" : mode === "photo" ? "Shared album URL" : "Website URL"}
            placeholderTextColor={palette.dust} autoCapitalize="none" autoCorrect={false} keyboardType="url"
          />
        );

      case "text":
        return (
          <TextInput style={[s.input, { height: 100, textAlignVertical: "top" }]} value={value} onChangeText={setValue} placeholder="Write anything..." placeholderTextColor={palette.dust} multiline />
        );

      default:
        return null;
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

          <Text style={s.stepLabel}>WHAT SHOULD YOUR TAG DO?</Text>
          <View style={s.modeGrid}>
            {TAG_MODES.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[s.modeCard, mode === m.key && s.modeCardActive]}
                onPress={() => { setMode(m.key); setValue(""); setSocialPlatform(null); setPaymentPlatform(null); setSuccess(false); }}
                activeOpacity={0.7}
              >
                <Text style={s.modeIcon}>{m.icon}</Text>
                <Text style={s.modeLabel}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode && (
            <>
              <Text style={[s.stepLabel, { marginTop: space.lg }]}>SET IT UP</Text>
              {renderDetails()}

              <TouchableOpacity
                style={[s.writeBtn, success && s.writeBtnSuccess]}
                onPress={writeTag}
                disabled={writing}
                activeOpacity={0.8}
              >
                <Text style={s.writeBtnText}>
                  {writing ? "Hold phone on tag..." : success ? "Written ✓" : "Write to Tag"}
                </Text>
              </TouchableOpacity>

              {writing && (
                <Text style={s.writingHint}>Hold the top of your phone against the NFC tag</Text>
              )}
            </>
          )}

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

  stepLabel: { ...type.label, color: palette.dust, fontFamily: fonts.monoBold, marginBottom: space.sm, marginLeft: space.xs },

  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  modeCard: {
    width: "31%", alignItems: "center", paddingVertical: space.md,
    backgroundColor: palette.onyx, borderWidth: 1, borderColor: palette.glassBorder,
    borderRadius: radius.button,
  },
  modeCardActive: { borderColor: palette.amber, borderWidth: 2 },
  modeIcon: { fontSize: 24, marginBottom: space.xs },
  modeLabel: { color: palette.papyrus, fontSize: 10, fontFamily: fonts.mono, textAlign: "center", letterSpacing: 0.5 },

  detailCard: { backgroundColor: palette.onyx, borderRadius: radius.button, padding: space.md, marginBottom: space.sm },
  detailLabel: { color: palette.sandstone, fontSize: 12, fontFamily: fonts.mono, marginBottom: space.xs },
  detailValue: { color: palette.amber, fontSize: 14, fontFamily: fonts.mono },
  detailHint: { color: palette.dust, fontSize: 11, fontFamily: fonts.serifItalic, fontStyle: "italic", marginTop: space.xs },

  input: {
    color: palette.papyrus, fontSize: 14, fontFamily: fonts.mono,
    backgroundColor: palette.onyx, borderWidth: 1, borderColor: palette.glassBorder,
    borderRadius: radius.button, padding: space.md, marginBottom: space.sm,
  },

  platformGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.sm },
  platformChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: palette.onyx, borderWidth: 1, borderColor: palette.glassBorder,
    borderRadius: radius.chip,
  },
  platformChipActive: { borderColor: palette.amber, backgroundColor: palette.groove },
  platformText: { color: palette.sandstone, fontSize: 12, fontFamily: fonts.mono },
  platformTextActive: { color: palette.papyrus },

  chipRow: { flexDirection: "row", gap: space.sm, marginBottom: space.sm },
  encChip: {
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: palette.onyx, borderWidth: 1, borderColor: palette.glassBorder,
    borderRadius: radius.chip,
  },
  encChipActive: { borderColor: palette.amber },
  encChipText: { color: palette.sandstone, fontSize: 12, fontFamily: fonts.mono },
  encChipTextActive: { color: palette.papyrus },

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
