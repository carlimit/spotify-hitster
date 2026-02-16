import { useState, useEffect, useRef } from "react";
import { socket } from "../socket";

// ─────────────────────────────────────────────────────────────
// Shared helper — initialises the Spotify Web Playback SDK once
// and calls `onReady(player, deviceId)` when the device is ready.
//
// KEY FIX: We must set window.onSpotifyWebPlaybackSDKReady BEFORE
// injecting the <script> tag, and also handle the case where the
// SDK is already loaded (window.Spotify already exists) by calling
// the init function directly instead of waiting for the callback.
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
    // SDK already present — init immediately, no callback needed
    return initPlayer();
  }

  // SDK not yet loaded — set callback first, then inject script
  window.onSpotifyWebPlaybackSDKReady = initPlayer;

  if (!document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) {
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);
  }

  return null; // player created async via callback
}

// ─────────────────────────────────────────────────────────────
// Multiplayer hook — used in Game.jsx
// ─────────────────────────────────────────────────────────────
export function useSpotifyPlayer(roomCode, shouldInitialize = true) {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const currentUriRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!shouldInitialize) {
      // Non-host players in online mode: mark ready so UI shows play buttons.
      // They send socket events instead of controlling SDK directly.
      setReady(true);
      return;
    }

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

    // initSDK returns the player synchronously only when SDK was already loaded
    if (player) playerRef.current = player;

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
        deviceIdRef.current = null;
      }
    };
  }, [shouldInitialize]);

  const togglePlay = async (uri) => {
    if (!shouldInitialize) {
      // Non-host: ask host via socket
      socket.emit("request_playback", {
        code: roomCode,
        uri,
        action: playing ? "pause" : "play",
      });
      setPlaying((p) => !p); // optimistic update
      return;
    }

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
    if (!shouldInitialize) {
      socket.emit("request_playback", { code: roomCode, action: "pause" });
      setPlaying(false);
      return;
    }
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