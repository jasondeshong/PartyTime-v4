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

  function handleJoinLobby(lobbyData) {
    setLobby(lobbyData);
  }

  function handleLeave() {
    socket.disconnect();
    setLobby(null);
  }

  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
      </>
    );
  }

  if (!isLoggedIn) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
        <LoginScreen onLogin={login} />
      </>
    );
  }

  if (lobby) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />
        <LobbyScreen
          code={lobby.code}
          isHost={lobby.isHost}
          user={user}
          initialState={lobby.initialState}
          getToken={getToken}
          onLeave={handleLeave}
        />
      </>
    );
  }

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
