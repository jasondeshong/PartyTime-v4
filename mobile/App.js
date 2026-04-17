import { useState, useEffect, useRef } from "react";
import { StatusBar, View, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from "@expo-google-fonts/instrument-serif";
import { SpaceMono_400Regular, SpaceMono_700Bold } from "@expo-google-fonts/space-mono";
import useAuth from "./src/useAuth";
import LoginScreen from "./src/LoginScreen";
import HomeScreen from "./src/HomeScreen";
import SettingsScreen from "./src/SettingsScreen";
import VenueScreen from "./src/VenueScreen";
import AnalyticsDashboard from "./src/AnalyticsDashboard";
import LobbyScreen from "./src/LobbyScreen";
import LogoReview from "./src/LogoReview";
import socket from "./src/socket";

// ── Set to true to show logo options review screen ──
const SHOW_LOGO_REVIEW = false;

const LOBBY_KEY = "pt_active_lobby";

export default function App() {
  const [fontsLoaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });
  const { user, loading, login, logout, getToken, isLoggedIn } = useAuth();
  const [lobby, setLobby] = useState(null);
  const [guestUser, setGuestUser] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showVenues, setShowVenues] = useState(false);
  const [analyticsVenue, setAnalyticsVenue] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const restoredRef = useRef(false);

  // Restore active lobby on cold start
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LOBBY_KEY);
        if (stored) {
          const { code, isHost, guestName } = JSON.parse(stored);
          if (code) {
            // Try to rejoin the lobby
            if (!socket.connected) socket.connect();
            const name = guestName || user?.name || "Returning user";
            socket.emit("join-lobby", { code, name, host: isHost });

            // Wait for lobby-state or error with a timeout
            await new Promise((resolve) => {
              const timeout = setTimeout(() => {
                socket.off("lobby-state");
                socket.off("error");
                AsyncStorage.removeItem(LOBBY_KEY);
                resolve();
              }, 5000);

              socket.once("error", () => {
                clearTimeout(timeout);
                AsyncStorage.removeItem(LOBBY_KEY);
                socket.disconnect();
                resolve();
              });

              socket.once("lobby-state", (lobbyState) => {
                clearTimeout(timeout);
                if (guestName) {
                  setGuestUser({ name: guestName, isGuest: true });
                }
                setLobby({ code, isHost, initialState: lobbyState });
                resolve();
              });
            });
          }
        }
      } catch (e) {
        console.warn("Lobby restore failed:", e?.message || e);
        await AsyncStorage.removeItem(LOBBY_KEY).catch(() => {});
      }
      setRestoring(false);
    })();
  }, [user]);

  function handleJoinLobby(lobbyData) {
    setLobby(lobbyData);
    // Persist lobby code so we can rejoin after app kill
    AsyncStorage.setItem(
      LOBBY_KEY,
      JSON.stringify({
        code: lobbyData.code,
        isHost: lobbyData.isHost,
        guestName: null,
      })
    ).catch(() => {});
  }

  function handleLeave() {
    socket.disconnect();
    setLobby(null);
    AsyncStorage.removeItem(LOBBY_KEY).catch(() => {});
  }

  function handleGuestJoin({ name, code }) {
    const guest = { name, isGuest: true };
    setGuestUser(guest);

    if (!socket.connected) socket.connect();
    socket.emit("join-lobby", { code, name });

    socket.once("error", (msg) => {
      console.warn("Join error:", msg);
      socket.disconnect();
      setGuestUser(null);
    });

    socket.once("lobby-state", (lobbyState) => {
      setLobby({ code, isHost: false, initialState: lobbyState });
      // Persist for guest too
      AsyncStorage.setItem(
        LOBBY_KEY,
        JSON.stringify({ code, isHost: false, guestName: name })
      ).catch(() => {});
    });
  }

  function handleGuestLeave() {
    socket.disconnect();
    setLobby(null);
    setGuestUser(null);
    AsyncStorage.removeItem(LOBBY_KEY).catch(() => {});
  }

  // Logo review mode — shows all 5 options for design review
  if (SHOW_LOGO_REVIEW && fontsLoaded) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#080808" />
        <LogoReview />
      </>
    );
  }

  if (loading || restoring || !fontsLoaded) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#080808" />
        <View style={{ flex: 1, backgroundColor: "#080808" }} />
      </>
    );
  }

  // Guest connects Spotify while in lobby — triggers login flow,
  // then getToken becomes available for library access (but not playback control)
  async function handleGuestConnectSpotify() {
    await login();
    // After login completes, `isLoggedIn` and `getToken` will update via useAuth.
    // The lobby render below will pick up the new getToken automatically.
  }

  // Active lobby (host or guest)
  if (lobby) {
    const activeUser = guestUser || user;
    // Guests get getToken if they've connected Spotify (isLoggedIn),
    // but they're still not the host (no playback control).
    const lobbyGetToken = guestUser
      ? (isLoggedIn ? getToken : null)  // guest with optional Spotify
      : getToken;                        // host always has it
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#080808" />
        <LobbyScreen
          code={lobby.code}
          isHost={lobby.isHost}
          user={activeUser}
          initialState={lobby.initialState}
          getToken={lobbyGetToken}
          onLeave={guestUser ? handleGuestLeave : handleLeave}
          onConnectSpotify={guestUser && !isLoggedIn ? handleGuestConnectSpotify : null}
        />
      </>
    );
  }

  // Not logged in — show landing with host + guest options
  if (!isLoggedIn) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#080808" />
        <LoginScreen onLogin={login} onGuestJoin={handleGuestJoin} />
      </>
    );
  }

  // Analytics dashboard for a specific venue
  if (analyticsVenue) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#080808" />
        <AnalyticsDashboard
          venue={analyticsVenue}
          getToken={getToken}
          onBack={() => setAnalyticsVenue(null)}
        />
      </>
    );
  }

  // Venue management
  if (showVenues) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#080808" />
        <VenueScreen
          user={user}
          getToken={getToken}
          onBack={() => setShowVenues(false)}
          onViewAnalytics={(venue) => { setShowVenues(false); setAnalyticsVenue(venue); }}
          onHostLobby={(lobbyCode) => {
            setShowVenues(false);
            if (!socket.connected) socket.connect();
            socket.emit("join-lobby", { code: lobbyCode, name: user.name });
            socket.once("error", (msg) => {
              console.warn("Venue host join error:", msg);
              socket.disconnect();
            });
            socket.once("lobby-state", (lobbyState) => {
              handleJoinLobby({ code: lobbyCode, isHost: true, initialState: lobbyState });
            });
          }}
        />
      </>
    );
  }

  // Logged in host — settings or home screen
  if (showSettings) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#080808" />
        <SettingsScreen
          user={user}
          onBack={() => setShowSettings(false)}
          onLogout={() => { setShowSettings(false); logout(); }}
          onOpenVenues={() => { setShowSettings(false); setShowVenues(true); }}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#080808" />
      <HomeScreen
        user={user}
        onLogout={logout}
        onJoinLobby={handleJoinLobby}
        onOpenSettings={() => setShowSettings(true)}
      />
    </>
  );
}
