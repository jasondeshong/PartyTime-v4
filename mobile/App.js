import { useState } from "react";
import { StatusBar } from "react-native";
import useAuth from "./src/useAuth";
import LoginScreen from "./src/LoginScreen";
import HomeScreen from "./src/HomeScreen";
import LobbyScreen from "./src/LobbyScreen";
import socket from "./src/socket";

export default function App() {
  const { user, loading, login, logout, getToken, isLoggedIn } = useAuth();
  const [lobby, setLobby] = useState(null);
  const [guestUser, setGuestUser] = useState(null); // { name, isGuest: true }

  function handleJoinLobby(lobbyData) {
    setLobby(lobbyData);
  }

  function handleLeave() {
    socket.disconnect();
    setLobby(null);
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
    });
  }

  function handleGuestLeave() {
    socket.disconnect();
    setLobby(null);
    setGuestUser(null);
  }

  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      </>
    );
  }

  // Active lobby (host or guest)
  if (lobby) {
    const activeUser = guestUser || user;
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
        <LobbyScreen
          code={lobby.code}
          isHost={lobby.isHost}
          user={activeUser}
          initialState={lobby.initialState}
          getToken={guestUser ? null : getToken}
          onLeave={guestUser ? handleGuestLeave : handleLeave}
        />
      </>
    );
  }

  // Not logged in — show landing with host + guest options
  if (!isLoggedIn) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
        <LoginScreen onLogin={login} onGuestJoin={handleGuestJoin} />
      </>
    );
  }

  // Logged in host — show home screen
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      <HomeScreen
        user={user}
        onLogout={logout}
        onJoinLobby={handleJoinLobby}
      />
    </>
  );
}
