import { useState, useEffect, useCallback, useRef } from "react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SPOTIFY_CLIENT_ID } from "./config";
import api from "./api";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "pt_spotify";
const discovery = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
];

export default function useAuth() {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: "partytime" });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: SPOTIFY_CLIENT_ID,
      scopes: SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: false,
    },
    discovery
  );

  // Load stored auth on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(TOKEN_KEY);
        if (stored) setAuth(JSON.parse(stored));
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Handle auth response
  useEffect(() => {
    if (response?.type === "success" && response.params.code) {
      (async () => {
        try {
          const res = await api("/api/auth/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: response.params.code,
              redirectUri,
            }),
          });
          const data = await res.json();
          if (data.accessToken) {
            const session = {
              accessToken: data.accessToken,
              refreshToken: data.refreshToken,
              expiresAt: Date.now() + data.expiresIn * 1000,
              user: data.user,
            };
            await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(session));
            setAuth(session);
          }
        } catch (err) {
          console.error("Auth error:", err);
        }
      })();
    }
  }, [response]);

  const getToken = useCallback(async () => {
    if (!auth) return null;

    if (Date.now() < auth.expiresAt - 60000) {
      return auth.accessToken;
    }

    try {
      const res = await api("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
      });
      const data = await res.json();
      const updated = {
        ...auth,
        accessToken: data.accessToken,
        expiresAt: Date.now() + data.expiresIn * 1000,
      };
      await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(updated));
      setAuth(updated);
      return data.accessToken;
    } catch {
      await logout();
      return null;
    }
  }, [auth]);

  async function login() {
    await promptAsync();
  }

  async function logout() {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setAuth(null);
  }

  return {
    auth,
    user: auth?.user || null,
    loading,
    login,
    logout,
    getToken,
    isLoggedIn: !!auth?.accessToken,
    redirectUri,
  };
}
