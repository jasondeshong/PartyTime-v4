import { useState, useEffect, useCallback } from "react";
import api from "./api";

const TOKEN_KEY = "pt_spotify";

function getStored() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY));
  } catch {
    return null;
  }
}

export default function useSpotifyAuth() {
  const [auth, setAuth] = useState(getStored);
  const [loading, setLoading] = useState(true);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      window.history.replaceState({}, "", "/");
      (async () => {
        try {
          const res = await api("/api/auth/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });
          const data = await res.json();
          if (data.accessToken) {
            const session = {
              accessToken: data.accessToken,
              refreshToken: data.refreshToken,
              expiresAt: Date.now() + data.expiresIn * 1000,
              user: data.user,
            };
            localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
            setAuth(session);
          }
        } catch (err) {
          console.error("Auth error:", err);
        }
        setLoading(false);
      })();
    } else {
      setLoading(false);
    }
  }, []);

  // Refresh token when expired
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
      localStorage.setItem(TOKEN_KEY, JSON.stringify(updated));
      setAuth(updated);
      return data.accessToken;
    } catch {
      logout();
      return null;
    }
  }, [auth]);

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setAuth(null);
  }

  function login() {
    const apiUrl = import.meta.env.VITE_API_URL || "";
    window.location.href = `${apiUrl}/api/auth/login`;
  }

  return {
    auth,
    user: auth?.user || null,
    loading,
    login,
    logout,
    getToken,
    isLoggedIn: !!auth?.accessToken,
  };
}
