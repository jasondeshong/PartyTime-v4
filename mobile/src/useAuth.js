import { useState, useEffect, useCallback, useRef } from "react";
import { Platform } from "react-native";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SPOTIFY_CLIENT_ID } from "./config";
import api from "./api";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "pt_spotify";
const REDIRECT_URI = "partytime://callback";

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

  const redirectUri = REDIRECT_URI;

  // iOS: use useAuthRequest (works reliably)
  const discovery = {
    authorizationEndpoint: "https://accounts.spotify.com/authorize",
    tokenEndpoint: "https://accounts.spotify.com/api/token",
  };

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

  // Handle auth response (iOS path via useAuthRequest)
  useEffect(() => {
    if (Platform.OS === "android") return; // Android handles in login()
    if (response?.type === "success" && response.params.code) {
      exchangeCode(response.params.code);
    }
  }, [response]);

  async function exchangeCode(code) {
    try {
      const res = await api("/api/auth/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirectUri }),
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
  }

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
    if (Platform.OS === "android") {
      // Android: bypass useAuthRequest, build URL manually
      const state = Math.random().toString(36).substring(2, 15);
      const params = new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope: SCOPES.join(" "),
        state,
      });
      const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get("code");
        if (code) {
          await exchangeCode(code);
        }
      }
    } else {
      // iOS: use standard expo-auth-session flow
      await promptAsync();
    }
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
