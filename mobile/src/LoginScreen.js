import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function LoginScreen({ onLogin }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>PartyTime</Text>
      <Text style={styles.subtitle}>Collaborative playlists, democratized.</Text>

      <TouchableOpacity style={styles.loginBtn} onPress={onLogin} activeOpacity={0.8}>
        <Text style={styles.loginText}>Login with Spotify</Text>
      </TouchableOpacity>
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
  loginBtn: {
    backgroundColor: "#1DB954",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 50,
  },
  loginText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 16,
  },
});
