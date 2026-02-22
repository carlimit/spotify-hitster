import { useState, useEffect, useRef, useCallback } from "react";
import { socket } from "../socket";

// ─────────────────────────────────────────────────────────────
// Mobile detection
// ─────────────────────────────────────────────────────────────
function isMobileBrowser() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

// ─────────────────────────────────────────────────────────────
// Web Playback SDK init (desktop only)
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

  if (window.Spotify) return initPlayer();

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
// Spotify Connect helpers (mobile)
// ─────────────────────────────────────────────────────────────

async function findDevice(token) {
  try {
    const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const devices = data.devices || [];
    if (!devices.length) return null;
    return (
      devices.find(d => d.is_active) ||
      devices.find(d => d.type === "Smartphone") ||
      devices[0]
    );
  } catch {
    return null;
  }
}

async function playOnDevice(token, uri, deviceId) {
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ uris: [uri] }),
    }
  );
  return res.ok;
}

async function transferPlayback(token, deviceId) {
  await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  }).catch(() => {});
}

async function connectPause(token) {
  await fetch("https://api.spotify.com/v1/me/player/pause", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

async function connectPlay(token, uri) {
  const res = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uris: [uri] }),
  });
  if (res.ok) return { ok: true };
  if (res.status === 403) return { ok: false, needsApp: false };

  const device = await findDevice(token);
  if (!device) return { ok: false, needsApp: true };

  const ok2 = await playOnDevice(token, uri, device.id);
  if (ok2) return { ok: true };

  await transferPlayback(token, device.id);

  await new Promise(r => setTimeout(r, 1200));
  const ok3 = await playOnDevice(token, uri, device.id);
  if (ok3) return { ok: true };

  await new Promise(r => setTimeout(r, 1800));
  const ok4 = await playOnDevice(token, uri, device.id);
  if (ok4) return { ok: true };

  return { ok: false, needsApp: false };
}

// ─────────────────────────────────────────────────────────────
// Multiplayer hook
// ─────────────────────────────────────────────────────────────
export function useSpotifyPlayer(roomCode, isHost) {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [needsSpotifyApp, setNeedsSpotifyApp] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const currentUriRef = useRef(null);
  const mobileRef = useRef(isMobileBrowser());
  const pendingUriRef = useRef(null);
  // Track last SDK position to detect natural track end
  const lastPositionRef = useRef(0);
  // Track whether user explicitly paused (vs. track ending naturally)
  const userPausedRef = useRef(false);

  const resetPlaying = useCallback(() => {
    setPlaying(false);
    setConnecting(false);
    setNeedsSpotifyApp(false);
    currentUriRef.current = null;
  }, []);

  // Auto-retry when user comes back from the Spotify app
  useEffect(() => {
    if (!isHost || !mobileRef.current) return;

    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      const uri = pendingUriRef.current;
      if (!uri) return;
      const token = localStorage.getItem("token");
      if (!token) return;
      await new Promise(r => setTimeout(r, 800));
      const result = await connectPlay(token, uri);
      if (result.ok) {
        pendingUriRef.current = null;
        setNeedsSpotifyApp(false);
        setConnecting(false);
        setPlaying(true);
        userPausedRef.current = false;
        currentUriRef.current = uri;
        socket.emit("player_state", { code: roomCode, playing: true });
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isHost, roomCode]);

  // ── Mobile auto-restart polling ──────────────────────────────
  // Polls Spotify every 4s while we expect a track to be playing.
  // If the track ended naturally (not user-paused), restarts it.
  useEffect(() => {
    if (!isHost || !mobileRef.current) return;

    const interval = setInterval(async () => {
      if (!currentUriRef.current) return; // nothing to restart
      if (userPausedRef.current) return;  // user intentionally paused
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 204 || !res.ok) return; // no active session
        const data = await res.json();
        if (!data.is_playing && currentUriRef.current) {
          console.log("🔁 Track ended naturally — restarting");
          const result = await connectPlay(token, currentUriRef.current);
          if (result.ok) {
            setPlaying(true);
            socket.emit("player_state", { code: roomCode, playing: true });
          }
        }
      } catch {
        // Non-critical
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [isHost, roomCode]);

  useEffect(() => {
    if (!isHost) {
      setReady(true);
      const onPlayerState = ({ playing: isPlaying }) => {
        setPlaying(isPlaying);
        setConnecting(false);
      };
      socket.on("player_state", onPlayerState);
      return () => socket.off("player_state", onPlayerState);
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    if (mobileRef.current) {
      console.log("📱 Mobile host — using Spotify Connect");
      setReady(true);

      const onPlayTrack = async ({ uri }) => {
        userPausedRef.current = false;
        setConnecting(true);
        const result = await connectPlay(token, uri);
        setConnecting(false);
        if (result.ok) {
          setPlaying(true);
          setNeedsSpotifyApp(false);
          pendingUriRef.current = null;
          currentUriRef.current = uri;
          socket.emit("player_state", { code: roomCode, playing: true });
        } else if (result.needsApp) {
          pendingUriRef.current = uri;
          setNeedsSpotifyApp(true);
          socket.emit("player_state", { code: roomCode, playing: false });
        }
      };
      const onPauseTrack = async () => {
        userPausedRef.current = true;
        await connectPause(token);
        setPlaying(false);
        socket.emit("player_state", { code: roomCode, playing: false });
      };
      socket.on("play_track", onPlayTrack);
      socket.on("pause_track", onPauseTrack);
      return () => {
        socket.off("play_track", onPlayTrack);
        socket.off("pause_track", onPauseTrack);
      };
    }

    // Desktop: Web Playback SDK
    const player = initSDK(
      token,
      "Hitster Game Player",
      (p, deviceId) => { playerRef.current = p; deviceIdRef.current = deviceId; setReady(true); },
      (state) => {
        // Detect natural track end: was playing (position > 2s), now paused at position 0
        if (
          state.paused &&
          state.position === 0 &&
          lastPositionRef.current > 2000 &&
          currentUriRef.current &&
          !userPausedRef.current
        ) {
          console.log("🔁 Track ended naturally (SDK) — restarting");
          lastPositionRef.current = 0;
          setTimeout(() => hostPlaySDK(currentUriRef.current), 400);
          return;
        }
        lastPositionRef.current = state.position;

        const isPlaying = !state.paused;
        setPlaying(isPlaying);
        setConnecting(false);
        currentUriRef.current = state.track_window?.current_track?.uri || null;
        socket.emit("player_state", { code: roomCode, playing: isPlaying });
      }
    );
    if (player) playerRef.current = player;

    const onPlayTrack = ({ uri }) => {
      userPausedRef.current = false;
      hostPlaySDK(uri);
    };
    const onPauseTrack = () => {
      userPausedRef.current = true;
      if (playerRef.current) playerRef.current.pause();
    };
    socket.on("play_track", onPlayTrack);
    socket.on("pause_track", onPauseTrack);

    return () => {
      socket.off("play_track", onPlayTrack);
      socket.off("pause_track", onPauseTrack);
      if (playerRef.current) {
        playerRef.current.disconnect();
        playerRef.current = null;
        deviceIdRef.current = null;
      }
    };
  }, [isHost, roomCode]);

  const hostPlaySDK = async (uri) => {
    const token = localStorage.getItem("token");
    if (!playerRef.current || !deviceIdRef.current || !token) return;
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ uris: [uri] }),
    }).catch(console.error);
  };

  const togglePlay = useCallback(async (uri) => {
    if (!isHost) {
      if (playing) socket.emit("pause_track", { code: roomCode });
      else socket.emit("play_track", { code: roomCode, uri });
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    if (mobileRef.current) {
      if (playing) {
        userPausedRef.current = true;
        await connectPause(token);
        setPlaying(false);
        socket.emit("player_state", { code: roomCode, playing: false });
      } else {
        userPausedRef.current = false;
        setConnecting(true);
        const result = await connectPlay(token, uri);
        setConnecting(false);
        if (result.ok) {
          setPlaying(true);
          setNeedsSpotifyApp(false);
          pendingUriRef.current = null;
          currentUriRef.current = uri;
          socket.emit("player_state", { code: roomCode, playing: true });
        } else if (result.needsApp) {
          pendingUriRef.current = uri;
          setNeedsSpotifyApp(true);
        }
      }
      return;
    }

    // Desktop SDK
    if (!playerRef.current || !deviceIdRef.current) return;
    if (currentUriRef.current === uri && playing) {
      userPausedRef.current = true;
      await playerRef.current.pause();
      setPlaying(false);
    } else {
      userPausedRef.current = false;
      setConnecting(true);
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uris: [uri] }),
      });
      currentUriRef.current = uri;
    }
  }, [isHost, playing, roomCode]);

  const stop = useCallback(async () => {
    if (!isHost) {
      socket.emit("pause_track", { code: roomCode });
      setPlaying(false);
      return;
    }
    const token = localStorage.getItem("token");
    if (mobileRef.current) {
      userPausedRef.current = true;
      if (token) connectPause(token).catch(() => {});
      setPlaying(false);
      socket.emit("player_state", { code: roomCode, playing: false });
      return;
    }
    if (!playerRef.current) return;
    userPausedRef.current = true;
    await playerRef.current.pause().catch(console.error);
    setPlaying(false);
    currentUriRef.current = null;
  }, [isHost, roomCode]);

  const keepAlive = useCallback(async () => {
    if (!isHost || !mobileRef.current) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const device = await findDevice(token);
      if (device) {
        await transferPlayback(token, device.id);
        console.log("🔄 Spotify keep-alive ping sent");
      }
    } catch {
      // Non-critical
    }
  }, [isHost]);

  const retryPlayback = useCallback(async () => {
    const token = localStorage.getItem("token");
    const uri = pendingUriRef.current;
    if (!token || !uri) return;
    setConnecting(true);
    const result = await connectPlay(token, uri);
    setConnecting(false);
    if (result.ok) {
      pendingUriRef.current = null;
      setNeedsSpotifyApp(false);
      setPlaying(true);
      userPausedRef.current = false;
      currentUriRef.current = uri;
      socket.emit("player_state", { code: roomCode, playing: true });
    }
  }, [roomCode]);

  return {
    ready,
    playing,
    connecting,
    resetPlaying,
    togglePlay,
    stop,
    keepAlive,
    isMobile: mobileRef.current,
    needsSpotifyApp,
    retryPlayback,
  };
}

// ─────────────────────────────────────────────────────────────
// Single-player hook
// ─────────────────────────────────────────────────────────────
export function useSpotifyDirect() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [needsSpotifyApp, setNeedsSpotifyApp] = useState(false);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const currentUriRef = useRef(null);
  const mobileRef = useRef(isMobileBrowser());
  const pendingUriRef = useRef(null);
  const lastPositionRef = useRef(0);
  const userPausedRef = useRef(false);

  useEffect(() => {
    if (!mobileRef.current) return;
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      const uri = pendingUriRef.current;
      if (!uri) return;
      const token = localStorage.getItem("token");
      if (!token) return;
      await new Promise(r => setTimeout(r, 800));
      const result = await connectPlay(token, uri);
      if (result.ok) {
        pendingUriRef.current = null;
        setNeedsSpotifyApp(false);
        setConnecting(false);
        setPlaying(true);
        userPausedRef.current = false;
        currentUriRef.current = uri;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // ── Mobile auto-restart polling (single player) ──────────────
  useEffect(() => {
    if (!mobileRef.current) return;

    const interval = setInterval(async () => {
      if (!currentUriRef.current) return;
      if (userPausedRef.current) return;
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 204 || !res.ok) return;
        const data = await res.json();
        if (!data.is_playing && currentUriRef.current) {
          console.log("🔁 Track ended naturally (solo) — restarting");
          await connectPlay(token, currentUriRef.current);
          setPlaying(true);
        }
      } catch {
        // Non-critical
      }
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    if (mobileRef.current) { setReady(true); return; }

    const player = initSDK(
      token, "Hitster Solo Player",
      (p, deviceId) => { playerRef.current = p; deviceIdRef.current = deviceId; setReady(true); },
      (state) => {
        // Detect natural track end
        if (
          state.paused &&
          state.position === 0 &&
          lastPositionRef.current > 2000 &&
          currentUriRef.current &&
          !userPausedRef.current
        ) {
          console.log("🔁 Track ended naturally (solo SDK) — restarting");
          lastPositionRef.current = 0;
          setTimeout(() => {
            const token = localStorage.getItem("token");
            if (!playerRef.current || !deviceIdRef.current || !token || !currentUriRef.current) return;
            fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ uris: [currentUriRef.current] }),
            }).catch(console.error);
          }, 400);
          return;
        }
        lastPositionRef.current = state.position;

        setPlaying(!state.paused);
        setConnecting(false);
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

  const togglePlay = useCallback(async (uri) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    if (mobileRef.current) {
      if (playing) {
        userPausedRef.current = true;
        await connectPause(token);
        setPlaying(false);
      } else {
        userPausedRef.current = false;
        setConnecting(true);
        const result = await connectPlay(token, uri);
        setConnecting(false);
        if (result.ok) {
          setPlaying(true);
          setNeedsSpotifyApp(false);
          currentUriRef.current = uri;
        } else if (result.needsApp) {
          pendingUriRef.current = uri;
          setNeedsSpotifyApp(true);
        }
      }
      return;
    }
    if (!playerRef.current || !deviceIdRef.current) return;
    if (currentUriRef.current === uri && playing) {
      userPausedRef.current = true;
      await playerRef.current.pause();
      setPlaying(false);
    } else {
      userPausedRef.current = false;
      setConnecting(true);
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uris: [uri] }),
      });
      currentUriRef.current = uri;
    }
  }, [playing]);

  const stop = useCallback(async () => {
    const token = localStorage.getItem("token");
    userPausedRef.current = true;
    if (mobileRef.current) {
      if (token) connectPause(token).catch(() => {});
      setPlaying(false);
      return;
    }
    if (!playerRef.current) return;
    await playerRef.current.pause().catch(console.error);
    setPlaying(false);
    currentUriRef.current = null;
  }, []);

  const keepAlive = useCallback(async () => {
    if (!mobileRef.current) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const device = await findDevice(token);
      if (device) await transferPlayback(token, device.id);
    } catch {
      // Non-critical
    }
  }, []);

  const retryPlayback = useCallback(async () => {
    const token = localStorage.getItem("token");
    const uri = pendingUriRef.current;
    if (!token || !uri) return;
    setConnecting(true);
    const result = await connectPlay(token, uri);
    setConnecting(false);
    if (result.ok) {
      pendingUriRef.current = null;
      setNeedsSpotifyApp(false);
      setPlaying(true);
      userPausedRef.current = false;
      currentUriRef.current = uri;
    }
  }, []);

  return {
    ready,
    playing,
    connecting,
    resetPlaying: useCallback(() => {
      setPlaying(false);
      setConnecting(false);
      currentUriRef.current = null;
      userPausedRef.current = false;
    }, []),
    togglePlay,
    stop,
    keepAlive,
    isMobile: mobileRef.current,
    needsSpotifyApp,
    retryPlayback,
  };
}