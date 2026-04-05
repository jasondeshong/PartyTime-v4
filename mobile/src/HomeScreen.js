import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Image, StyleSheet, KeyboardAvoidingView, Platform,
} from "react-native";
import api from "./api";
import socket from "./socket";

export default function HomeScreen({ user, onLogout, onJoinLobby }) {
  const [lobbyCode, setLobbyCode] = useState("");
  const [loading, setLoading] = useState(false);

  function joinLobby(code, host) {
    if (!socket.connected) socket.connect();
    socket.emit("join-lobby", { code, name: user.name, host });

    socket.once("error", (msg) => {
      console.warn("Join error:", msg);
      setLoading(false);
      socket.disconnect();
    });

    socket.once("lobby-state", (lobby) => {
      onJoinLobby({ code, isHost: host, initialState: lobby });
    });
  }

  async function createLobby() {
    setLoading(true);
    try {
      const res = await api("/api/lobbies", { method: "POST" });
      const { code } = await res.json();
      joinLobby(code, true);
    } catch {
      console.warn("Failed to create lobby");
    }
    setLoading(false);
  }

  function handleJoin() {
    const code = lobbyCode.trim().toUpperCase();
    if (!code) return;
    joinLobby(code, false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.profileRow}>
        {user.image && <Image source={{ uri: user.image }} style={styles.avatar} />}
        <Text style={styles.profileName}>{user.name}</Text>
        <TouchableOpacity onPress={onLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>PartyTime</Text>
      <Text style={styles.subtitle}>Create or join a lobby.</Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={createLobby}
          activeOpacity={0.8}
          disabled={loading}
        >
          <Text style={styles.createText}>
            {loading ? "Creating..." : "Create a Lobby"}
          </Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or join one</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.joinRow}>
          <TextInput
            style={styles.codeInput}
            placeholder="Lobby code"
            placeholderTextColor="#888"
            value={lobbyCode}
            onChangeText={setLobbyCode}
            autoCapitalize="characters"
            autoCorrect={false}
            onSubmitEditing={handleJoin}
            returnKeyType="join"
          />
          <TouchableOpacity style={styles.joinBtn} onPress={handleJoin} activeOpacity={0.8}>
            <Text style={styles.joinText}>Join</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 48,
  },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  profileName: { color: "#888", fontSize: 13 },
  logoutText: { color: "#888", fontSize: 11, textDecorationLine: "underline" },
  title: { color: "#fff", fontSize: 36, fontWeight: "800", letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { color: "#888", fontSize: 14, marginBottom: 48 },
  actions: { width: "100%", maxWidth: 320 },
  createBtn: {
    backgroundColor: "#c96442",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  createText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#2a2a2a" },
  dividerText: { color: "#888", fontSize: 11, marginHorizontal: 12 },
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
