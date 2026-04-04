import { useState, useEffect, useRef } from "react";

export default function useSpotifyPlayer({ getToken, enabled }) {
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    // Load Spotify SDK script
    if (!scriptLoaded.current && !window.Spotify) {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
      scriptLoaded.current = true;
    }

    window.onSpotifyWebPlaybackSDKReady = async () => {
      const token = await getToken();
      if (!token) return;

      const p = new window.Spotify.Player({
        name: "PartyTime",
        getOAuthToken: async (cb) => {
          const t = await getToken();
          cb(t);
        },
        volume: 0.8,
      });

      p.addListener("ready", ({ device_id }) => {
        setDeviceId(device_id);
        setIsReady(true);
      });

      p.addListener("not_ready", () => {
        setIsReady(false);
      });

      p.connect();
      setPlayer(p);
    };

    // If SDK already loaded
    if (window.Spotify) {
      window.onSpotifyWebPlaybackSDKReady();
    }

    return () => {
      if (player) player.disconnect();
    };
  }, [enabled]);

  async function play(spotifyUri) {
    if (!deviceId) return;
    const token = await getToken();
    if (!token) return;

    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: [spotifyUri] }),
    });
  }

  async function pause() {
    if (player) await player.pause();
  }

  async function resume() {
    if (player) await player.resume();
  }

  return { player, deviceId, isReady, play, pause, resume };
}
