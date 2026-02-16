import { useState, useEffect, useRef } from "react";
import { socket } from "../socket";

export function useSpotifyPlayer(roomCode, shouldInitialize = true) {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const currentUriRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    
    if (!shouldInitialize) {
      // Non-host players in online mode: don't initialize SDK but mark as "ready"
      // so UI shows play buttons (they'll send socket events instead)
      setReady(true);
      return;
    }

    // Host or local mode: need token to initialize SDK
    if (!token) {
      console.warn("No Spotify token found - play button will be disabled");
      return;
    }

    if (!window.Spotify) {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: "Hitster Game Player",
        getOAuthToken: (cb) => cb(token),
        volume: 0.8,
      });

      player.addListener("ready", ({ device_id }) => {
        console.log("✅ Spotify Player ready:", device_id);
        deviceIdRef.current = device_id;
        playerRef.current = player;
        setReady(true);
      });

      player.addListener("not_ready", ({ device_id }) => {
        console.log("❌ Device has gone offline:", device_id);
      });

      player.addListener("player_state_changed", (state) => {
        if (!state) return;
        setPlaying(!state.paused);
        currentUriRef.current = state.track_window?.current_track?.uri || null;
      });

      player.connect();
      playerRef.current = player;
    };

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
      }
    };
  }, [shouldInitialize]);

  const togglePlay = async (uri) => {
    if (!shouldInitialize) {
      // Non-host player: emit socket event to host
      socket.emit("request_playback", { code: roomCode, uri, action: playing ? "pause" : "play" });
      setPlaying(!playing); // Optimistic update
      return;
    }

    // Host player: control SDK directly
    const token = localStorage.getItem("token");
    if (!playerRef.current || !deviceIdRef.current || !token) {
      console.warn("Cannot play - player not ready or no token");
      return;
    }

    try {
      if (currentUriRef.current === uri && playing) {
        await playerRef.current.pause();
        setPlaying(false);
      } else {
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ uris: [uri] }),
        });
        setPlaying(true);
        currentUriRef.current = uri;
      }
    } catch (err) {
      console.error("Playback error:", err);
    }
  };

  const stop = async () => {
    if (!shouldInitialize) {
      // Non-host player: emit socket event
      socket.emit("request_playback", { code: roomCode, action: "pause" });
      setPlaying(false);
      return;
    }

    // Host player: control SDK directly
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

// NEW: Separate hook for single player (no socket)
export function useSpotifyDirect() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const currentUriRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      console.warn("No Spotify token found - play button will be disabled");
      return;
    }

    if (!window.Spotify) {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: "Hitster Solo Player",
        getOAuthToken: (cb) => cb(token),
        volume: 0.8,
      });

      player.addListener("ready", ({ device_id }) => {
        console.log("✅ Spotify Player ready:", device_id);
        deviceIdRef.current = device_id;
        playerRef.current = player;
        setReady(true);
      });

      player.addListener("not_ready", ({ device_id }) => {
        console.log("❌ Device has gone offline:", device_id);
      });

      player.addListener("player_state_changed", (state) => {
        if (!state) return;
        setPlaying(!state.paused);
        currentUriRef.current = state.track_window?.current_track?.uri || null;
      });

      player.connect();
      playerRef.current = player;
    };

    return () => {
      if (playerRef.current) {
        playerRef.current.disconnect();
      }
    };
  }, []);

  const togglePlay = async (uri) => {
    const token = localStorage.getItem("token");
    if (!playerRef.current || !deviceIdRef.current || !token) {
      console.warn("Cannot play - player not ready or no token");
      return;
    }

    try {
      if (currentUriRef.current === uri && playing) {
        await playerRef.current.pause();
        setPlaying(false);
      } else {
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ uris: [uri] }),
        });
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