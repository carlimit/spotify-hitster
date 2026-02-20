import { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────
// Shared helper — initialises the Spotify Web Playback SDK once
// and calls `onReady(player, deviceId)` when the device is ready.
// ─────────────────────────────────────────────────────────────
function initSDK(token, name, onReady, onStateChange) {
  const initPlayer = () => {
    const player = new window.Spotify.Player({
      name,
      getOAuthToken: (cb) => cb(token),
      volume: 0.8,
    });

    player.addListener("ready", ({ device_id }) => {
      console.log("✅ Spotify Player ready:", device_id);
      onReady(player, device_id);
    });

    player.addListener("not_ready", ({ device_id }) => {
      console.warn("❌ Spotify device offline:", device_id);
    });

    player.addListener("player_state_changed", (state) => {
      if (state) onStateChange(state);
    });

    player.connect();
    return player;
  };

  if (window.Spotify) {
    return initPlayer();
  }

  window.onSpotifyWebPlaybackSDKReady = initPlayer;

  if (!document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) {
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Multiplayer hook — used in Game.jsx
// ─────────────────────────────────────────────────────────────
export function useSpotifyPlayer(roomCode) {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const currentUriRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      console.warn("No Spotify token — play button will be disabled");
      return;
    }

    const player = initSDK(
      token,
      "Hitster Game Player",
      (p, deviceId) => {
        playerRef.current = p;
        deviceIdRef.current = deviceId;
        setReady(true);
      },
      (state) => {
        setPlaying(!state.paused);
        currentUriRef.current = state.track_window?.current_track?.uri || null;
      }
    );

    if (player) playerRef.current = player;

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
        deviceIdRef.current = null;
      }
    };
  }, []);

  const togglePlay = async (uri) => {
    const token = localStorage.getItem("token");
    if (!playerRef.current || !deviceIdRef.current || !token) {
      console.warn("Cannot play — player not ready or no token");
      return;
    }

    try {
      if (currentUriRef.current === uri && playing) {
        await playerRef.current.pause();
        setPlaying(false);
      } else {
        await fetch(
          `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ uris: [uri] }),
          }
        );
        setPlaying(true);
        currentUriRef.current = uri;
      }
    } catch (err) {
      console.error("Playback error:", err);
    }
  };

  const stop = async () => {
    if (!playerRef.current) return;
    try {
      await playerRef.current.pause();
      setPlaying(false);
      currentUriRef.current = null;
    } catch (err) {
      console.error("Stop error:", err);
    }
  };

  return { ready, playing, togglePlay, stop };
}

// ─────────────────────────────────────────────────────────────
// Single-player hook — used in SinglePlayerGame.jsx
// ─────────────────────────────────────────────────────────────
export function useSpotifyDirect() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const currentUriRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      console.warn("No Spotify token — play button will be disabled");
      return;
    }

    const player = initSDK(
      token,
      "Hitster Solo Player",
      (p, deviceId) => {
        playerRef.current = p;
        deviceIdRef.current = deviceId;
        setReady(true);
      },
      (state) => {
        setPlaying(!state.paused);
        currentUriRef.current = state.track_window?.current_track?.uri || null;
      }
    );

    if (player) playerRef.current = player;

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
        deviceIdRef.current = null;
      }
    };
  }, []);

  const togglePlay = async (uri) => {
    const token = localStorage.getItem("token");
    if (!playerRef.current || !deviceIdRef.current || !token) {
      console.warn("Cannot play — player not ready or no token");
      return;
    }

    try {
      if (currentUriRef.current === uri && playing) {
        await playerRef.current.pause();
        setPlaying(false);
      } else {
        await fetch(
          `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ uris: [uri] }),
          }
        );
        setPlaying(true);
        currentUriRef.current = uri;
      }
    } catch (err) {
      console.error("Playback error:", err);
    }
  };

  const stop = async () => {
    if (!playerRef.current) return;
    try {
      await playerRef.current.pause();
      setPlaying(false);
      currentUriRef.current = null;
    } catch (err) {
      console.error("Stop error:", err);
    }
  };

  return { ready, playing, togglePlay, stop };
}