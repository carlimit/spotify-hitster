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
//
// Simple approach:
//   1. Try playing without device_id (works if a device is active)
//   2. If 404 → fetch devices, pick one, play directly on it
//   3. Only return needsApp if zero devices exist
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
    return devices.find(d => d.is_active) ||
           devices.find(d => d.type === "Smartphone") ||
           devices[0];
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

async function connectPlay(token, uri) {
  // Step 1: try playing on whatever is active
  const res = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uris: [uri] }),
  });
  if (res.ok) return { ok: true };

  // Step 2: no active device — find one and play directly on it
  if (res.status === 404 || res.status === 502) {
    const device = await findDevice(token);
    if (!device) return { ok: false, needsApp: true };

    // Try direct play on device
    const ok = await playOnDevice(token, uri, device.id);
    if (ok) return { ok: true };

    // Step 3: device is stale/sleeping — wake it up via transfer, then retry
    await transferPlayback(token, device.id);
    await new Promise(r => setTimeout(r, 600));
    const ok2 = await playOnDevice(token, uri, device.id);
    if (ok2) return { ok: true };

    // Step 4: one more attempt after a longer wait
    await new Promise(r => setTimeout(r, 1000));
    const ok3 = await playOnDevice(token, uri, device.id);
    if (ok3) return { ok: true };

    return { ok: false, needsApp: true };
  }

  return { ok: false, needsApp: false };
}

async function connectPause(token) {
  await fetch("https://api.spotify.com/v1/me/player/pause", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────
// Multiplayer hook
// ─────────────────────────────────────────────────────────────
export function useSpotifyPlayer(roomCode, isHost) {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [needsSpotifyApp, setNeedsSpotifyApp] = useState(false);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const currentUriRef = useRef(null);
  const mobileRef = useRef(isMobileBrowser());
  const pendingUriRef = useRef(null);

  // When user comes back from Spotify app, auto-retry once
  useEffect(() => {
    if (!isHost || !mobileRef.current) return;

    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      const uri = pendingUriRef.current;
      if (!uri) return;

      const token = localStorage.getItem("token");
      if (!token) return;

      // Small delay for Spotify to register
      await new Promise(r => setTimeout(r, 800));

      const result = await connectPlay(token, uri);
      if (result.ok) {
        pendingUriRef.current = null;
        setNeedsSpotifyApp(false);
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
      const onPlayerState = ({ playing: isPlaying }) => setPlaying(isPlaying);
      socket.on("player_state", onPlayerState);
      return () => socket.off("player_state", onPlayerState);
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    if (mobileRef.current) {
      console.log("📱 Mobile host — using Spotify Connect");
      setReady(true);

      const onPlayTrack = ({ uri }) => {
        connectPlay(token, uri).catch(console.error);
      };
      const onPauseTrack = () => connectPause(token).catch(console.error);
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
        setPlaying(isPlaying);
        currentUriRef.current = state.track_window?.current_track?.uri || null;
        socket.emit("player_state", { code: roomCode, playing: isPlaying });
      }
    );
    if (player) playerRef.current = player;

    const onPlayTrack = ({ uri }) => hostPlaySDK(uri);
    const onPauseTrack = () => { if (playerRef.current) playerRef.current.pause(); };
    socket.on("play_track", onPlayTrack);
    socket.on("pause_track", onPauseTrack);

    return () => {
      socket.off("play_track", onPlayTrack);
      socket.off("pause_track", onPauseTrack);
      if (playerRef.current) { playerRef.current.disconnect(); playerRef.current = null; deviceIdRef.current = null; }
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
      setPlaying(p => !p);
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    if (mobileRef.current) {
      if (playing) {
        await connectPause(token);
        setPlaying(false);
        socket.emit("player_state", { code: roomCode, playing: false });
      } else {
        const result = await connectPlay(token, uri);
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

    // Desktop
    if (!playerRef.current || !deviceIdRef.current) return;
    if (currentUriRef.current === uri && playing) {
      await playerRef.current.pause();
      setPlaying(false);
    } else {
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uris: [uri] }),
      });
      setPlaying(true);
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

  const retryPlayback = useCallback(async () => {
    const token = localStorage.getItem("token");
    const uri = pendingUriRef.current;
    if (!token || !uri) return;
    const result = await connectPlay(token, uri);
    if (result.ok) {
      pendingUriRef.current = null;
      setNeedsSpotifyApp(false);
      setPlaying(true);
      currentUriRef.current = uri;
      socket.emit("player_state", { code: roomCode, playing: true });
    }
  }, [roomCode]);

  return { ready, playing, togglePlay, stop, isMobile: mobileRef.current, needsSpotifyApp, retryPlayback };
}

// ─────────────────────────────────────────────────────────────
// Single-player hook
// ─────────────────────────────────────────────────────────────
export function useSpotifyDirect() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [needsSpotifyApp, setNeedsSpotifyApp] = useState(false);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const currentUriRef = useRef(null);
  const mobileRef = useRef(isMobileBrowser());
  const pendingUriRef = useRef(null);

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
      (state) => { setPlaying(!state.paused); currentUriRef.current = state.track_window?.current_track?.uri || null; }
    );
    if (player) playerRef.current = player;
    return () => { if (playerRef.current) { playerRef.current.disconnect(); playerRef.current = null; deviceIdRef.current = null; } };
  }, []);

  const togglePlay = useCallback(async (uri) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    if (mobileRef.current) {
      if (playing) {
        await connectPause(token);
        setPlaying(false);
      } else {
        const result = await connectPlay(token, uri);
        if (result.ok) { setPlaying(true); setNeedsSpotifyApp(false); currentUriRef.current = uri; }
        else if (result.needsApp) { pendingUriRef.current = uri; setNeedsSpotifyApp(true); }
      }
      return;
    }

    if (!playerRef.current || !deviceIdRef.current) return;
    if (currentUriRef.current === uri && playing) {
      await playerRef.current.pause();
      setPlaying(false);
    } else {
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uris: [uri] }),
      });
      setPlaying(true);
      currentUriRef.current = uri;
    }
  }, [playing]);

  const stop = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (mobileRef.current) { if (token) connectPause(token).catch(() => {}); setPlaying(false); return; }
    if (!playerRef.current) return;
    await playerRef.current.pause().catch(console.error);
    setPlaying(false);
    currentUriRef.current = null;
  }, []);

  const retryPlayback = useCallback(async () => {
    const token = localStorage.getItem("token");
    const uri = pendingUriRef.current;
    if (!token || !uri) return;
    const result = await connectPlay(token, uri);
    if (result.ok) { pendingUriRef.current = null; setNeedsSpotifyApp(false); setPlaying(true); currentUriRef.current = uri; }
  }, []);

  return { ready, playing, togglePlay, stop, isMobile: mobileRef.current, needsSpotifyApp, retryPlayback };
}