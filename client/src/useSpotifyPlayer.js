import { useState, useEffect, useRef } from "react";

export default function useSpotifyPlayer({ getToken, enabled }) {
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const scriptLoaded = useRef(false);
  const intervalRef = useRef(null);

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

      p.addListener("player_state_changed", (state) => {
        if (!state) return;
        setIsPlaying(!state.paused);
        setPosition(state.position);
        setDuration(state.duration);
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

  // Poll position while playing
  useEffect(() => {
    if (isPlaying && player) {
      intervalRef.current = setInterval(async () => {
        const state = await player.getCurrentState();
        if (state) {
          setPosition(state.position);
          setDuration(state.duration);
        }
      }, 500);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, player]);

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

  async function togglePlay() {
    if (player) await player.togglePlay();
  }

  async function seek(ms) {
    if (player) await player.seek(ms);
  }

  return { player, deviceId, isReady, isPlaying, position, duration, play, pause, resume, togglePlay, seek };
}
