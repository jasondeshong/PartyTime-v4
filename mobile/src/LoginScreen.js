import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from "react-native";

export default function LoginScreen({ onLogin, onGuestJoin }) {
  const [guestName, setGuestName] = useState("");
  const [lobbyCode, setLobbyCode] = useState("");

  function handleGuestJoin() {
    const name = guestName.trim();
    const code = lobbyCode.trim().toUpperCase();
    if (!name || !code) return;
    onGuestJoin({ name, code });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>PartyTime</Text>
      <Text style={styles.subtitle}>Collaborative playlists, democratized.</Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.loginBtn} onPress={onLogin} activeOpacity={0.8}>
          <Text style={styles.loginText}>Host with Spotify</Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or join as guest</Text>
          <View style={styles.dividerLine} />
        </View>

        <TextInput
          style={styles.nameInput}
          placeholder="Your name"
          placeholderTextColor="#888"
          value={guestName}
          onChangeText={setGuestName}
          autoCorrect={false}
        />
        <View style={styles.joinRow}>
          <TextInput
            style={styles.codeInput}
            placeholder="Lobby code"
            placeholderTextColor="#888"
            value={lobbyCode}
            onChangeText={setLobbyCode}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={handleGuestJoin}
            returnKeyType="join"
          />
          <TouchableOpacity style={styles.joinBtn} onPress={handleGuestJoin} activeOpacity={0.8}>
            <Text style={styles.joinText}>Join</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    color: "#fff",
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    color: "#888",
    fontSize: 14,
    marginBottom: 48,
  },
  actions: { width: "100%", maxWidth: 320 },
  loginBtn: {
    backgroundColor: "#1DB954",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  loginText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 16,
  },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#2a2a2a" },
  dividerText: { color: "#888", fontSize: 11, marginHorizontal: 12 },
  nameInput: {
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    textAlign: "center",
    fontSize: 14,
    marginBottom: 8,
  },
  joinRow: { flexDirection: "row", gap: 8 },
  codeInput: {
    flex: 1,
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    textAlign: "center",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 4,
    fontSize: 14,
  },
  joinBtn: {
    backgroundColor: "#222",
    paddingHorizontal: 24,
    borderRadius: 14,
    justifyContent: "center",
  },
  joinText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
