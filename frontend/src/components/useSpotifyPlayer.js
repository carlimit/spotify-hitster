import { useState, useEffect, useRef, useCallback } from "react";
import { socket } from "../socket";

// FIX: iPad detection — iPad Safari on iOS 13+ reports as desktop but needs Spotify Connect
function isMobileBrowser() {
  // Classic mobile UA
  if (/iPhone|iPod|Android/i.test(navigator.userAgent)) return true;
  // iPad iOS 13+ reports as "Macintosh" with touch support
  if (/iPad/i.test(navigator.userAgent)) return true;
  if (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1) return true;
  return false;
}

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
      devices.find(d => d.type === "Tablet") ||
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
  // FIX: Evaluate mobile once, memoised — avoids stale closure issues
  const mobileRef = useRef(isMobileBrowser());
  const pendingUriRef = useRef(null);
  const lastPositionRef = useRef(0);
  const userPausedRef = useRef(false);
  const restartingRef = useRef(false);

  // FIX: resetPlaying only clears visual state — does NOT call stop()
  const resetPlaying = useCallback(() => {
    setPlaying(false);
    setConnecting(false);
    setNeedsSpotifyApp(false);
    currentUriRef.current = null;
    userPausedRef.current = false;
    restartingRef.current = false;
    // Intentionally NOT calling stop() here so Spotify keeps playing
    // across turn transitions, avoiding the connection drop gap.
  }, []);

  // Auto-retry after returning from Spotify app (mobile / iPad)
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
        currentUriRef.current = uri;
        socket.emit("player_state", { code: roomCode, playing: true });
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
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
      console.log("📱 Mobile/iPad host — using Spotify Connect");
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
          // FIX: Always set needsApp + pendingUri so the prompt shows
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
        const isPlaying = !state.paused;

        const trackEndedNaturally =
          state.paused &&
          state.position === 0 &&
          lastPositionRef.current > 2000 &&
          !userPausedRef.current &&
          !restartingRef.current &&
          currentUriRef.current;

        if (trackEndedNaturally) {
          console.log("🔁 Track ended naturally — restarting");
          lastPositionRef.current = 0;
          restartingRef.current = true;
          setTimeout(async () => {
            if (!playerRef.current || !deviceIdRef.current) { restartingRef.current = false; return; }
            const t = localStorage.getItem("token");
            if (!t || !currentUriRef.current) { restartingRef.current = false; return; }
            await fetch(
              `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
                body: JSON.stringify({ uris: [currentUriRef.current] }),
              }
            ).catch(() => { restartingRef.current = false; });
          }, 400);
          return;
        }

        lastPositionRef.current = state.position;
        if (isPlaying) restartingRef.current = false;

        setPlaying(isPlaying);
        setConnecting(false);
        currentUriRef.current = state.track_window?.current_track?.uri || null;
        socket.emit("player_state", { code: roomCode, playing: isPlaying });
      }
    );
    if (player) playerRef.current = player;

    const onPlayTrack = ({ uri }) => {
      userPausedRef.current = false;
      restartingRef.current = false;
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
      restartingRef.current = false;
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
    userPausedRef.current = true;
    const token = localStorage.getItem("token");
    if (mobileRef.current) {
      if (token) connectPause(token).catch(() => {});
      setPlaying(false);
      socket.emit("player_state", { code: roomCode, playing: false });
      return;
    }
    if (!playerRef.current) return;
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
  const restartingRef = useRef(false);

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
        currentUriRef.current = uri;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    if (mobileRef.current) { setReady(true); return; }

    const player = initSDK(
      token, "Hitster Solo Player",
      (p, deviceId) => { playerRef.current = p; deviceIdRef.current = deviceId; setReady(true); },
      (state) => {
        const isPlaying = !state.paused;

        const trackEndedNaturally =
          state.paused &&
          state.position === 0 &&
          lastPositionRef.current > 2000 &&
          !userPausedRef.current &&
          !restartingRef.current &&
          currentUriRef.current;

        if (trackEndedNaturally) {
          console.log("🔁 Solo: track ended — restarting");
          lastPositionRef.current = 0;
          restartingRef.current = true;
          setTimeout(async () => {
            if (!playerRef.current || !deviceIdRef.current) { restartingRef.current = false; return; }
            const t = localStorage.getItem("token");
            if (!t || !currentUriRef.current) { restartingRef.current = false; return; }
            await fetch(
              `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
              {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
                body: JSON.stringify({ uris: [currentUriRef.current] }),
              }
            ).catch(() => { restartingRef.current = false; });
          }, 400);
          return;
        }

        lastPositionRef.current = state.position;
        if (isPlaying) restartingRef.current = false;

        setPlaying(isPlaying);
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
        if (result.ok) { setPlaying(true); setNeedsSpotifyApp(false); currentUriRef.current = uri; }
        else if (result.needsApp) { pendingUriRef.current = uri; setNeedsSpotifyApp(true); }
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
      restartingRef.current = false;
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
    userPausedRef.current = true;
    const token = localStorage.getItem("token");
    if (mobileRef.current) { if (token) connectPause(token).catch(() => {}); setPlaying(false); return; }
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
    } catch {}
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
      restartingRef.current = false;
    }, []),
    togglePlay,
    stop,
    keepAlive,
    isMobile: mobileRef.current,
    needsSpotifyApp,
    retryPlayback,
  };
}