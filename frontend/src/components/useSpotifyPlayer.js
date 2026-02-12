import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

// ── Detect mobile (SDK not supported on mobile browsers) ──
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// ── Shared SDK state — desktop only ──
let sdkPlayer = null;
let sdkDeviceId = null;   // desktop SDK device
let sdkReady = false;
let sdkInitialising = false;
const sdkReadyCallbacks = [];

function injectSDKScript() {
  if (document.getElementById("spotify-sdk-script")) return;
  const s = document.createElement("script");
  s.id = "spotify-sdk-script";
  s.src = "https://sdk.scdn.co/spotify-player.js";
  document.head.appendChild(s);
}

function initDesktopSDK(token, onReady) {
  if (sdkReady && sdkDeviceId) { onReady(sdkDeviceId); return; }
  sdkReadyCallbacks.push(onReady);
  if (sdkInitialising) return;
  sdkInitialising = true;

  const create = () => {
    const player = new window.Spotify.Player({
      name: "Hitster Game",
      getOAuthToken: cb => cb(localStorage.getItem("token") || token),
      volume: 0.8,
    });
    player.addListener("ready", ({ device_id }) => {
      console.log("🎵 Desktop SDK ready, device:", device_id);
      sdkDeviceId = device_id;
      sdkReady = true;
      sdkPlayer = player;
      sdkReadyCallbacks.forEach(cb => cb(device_id));
      sdkReadyCallbacks.length = 0;
    });
    player.addListener("not_ready", () => { sdkReady = false; sdkDeviceId = null; });
    player.addListener("initialization_error", ({ message }) => console.error("Spotify init:", message));
    player.addListener("authentication_error", ({ message }) => console.error("Spotify auth:", message));
    player.addListener("account_error", () => console.error("Spotify Premium required"));
    player.connect();
  };

  injectSDKScript();
  if (window.Spotify) { create(); }
  else {
    const prev = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => { if (prev) prev(); create(); };
  }
}

// ── Mobile: get active Spotify device (their phone app) ──
async function getMobileDeviceId() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const devices = data.devices || [];
    // Prefer active device, then any available one
    const active = devices.find(d => d.is_active) || devices[0];
    return active?.id || null;
  } catch { return null; }
}

// ── Playback functions ──
async function playUri(uri, deviceId) {
  const token = localStorage.getItem("token");
  const device = deviceId || sdkDeviceId;
  if (!token || !device) return;
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [uri] }),
  });
}

async function pausePlayback(deviceId) {
  const token = localStorage.getItem("token");
  if (isMobile) {
    const device = deviceId;
    if (!token || !device) return;
    await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${device}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
  } else {
    if (sdkPlayer) await sdkPlayer.pause();
  }
}

async function resumePlayback(deviceId) {
  const token = localStorage.getItem("token");
  if (isMobile) {
    const device = deviceId;
    if (!token || !device) return;
    await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
  } else {
    if (sdkPlayer) await sdkPlayer.resume();
  }
}

// ── MULTIPLAYER hook ──
export function useSpotifyPlayer(roomCode) {
  const [ready, setReady] = useState(sdkReady);
  const [playing, setPlaying] = useState(false);

  const readyRef = useRef(sdkReady);
  const playingRef = useRef(false);
  const currentUriRef = useRef(null);
  const mobileDeviceRef = useRef(null); // only used on mobile
  const roomCodeRef = useRef(roomCode);
  const isHost = !!localStorage.getItem("token");

  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  useEffect(() => {
    if (!isHost) return;

    if (isMobile) {
      // On mobile: get active Spotify device then mark ready
      getMobileDeviceId().then(id => {
        if (id) {
          mobileDeviceRef.current = id;
          setReady(true);
          readyRef.current = true;
        } else {
          // No device found — still mark ready so user can try
          // (Spotify app may not be open yet; will open on first play)
          setReady(true);
          readyRef.current = true;
        }
      });

      // Poll via Spotify API on mobile
      const poll = setInterval(async () => {
        const token = localStorage.getItem("token");
        if (!token) return;
        try {
          const res = await fetch("https://api.spotify.com/v1/me/player", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 204 || !res.ok) {
            if (playingRef.current) {
              playingRef.current = false;
              setPlaying(false);
              socket.emit("player_state", { code: roomCodeRef.current, playing: false });
            }
            return;
          }
          const data = await res.json();
          const isPlaying = data.is_playing ?? false;
          // Keep mobile device ref fresh
          if (data.device?.id) mobileDeviceRef.current = data.device.id;
          if (playingRef.current !== isPlaying) {
            playingRef.current = isPlaying;
            setPlaying(isPlaying);
            socket.emit("player_state", { code: roomCodeRef.current, playing: isPlaying });
          }
        } catch { /* ignore */ }
      }, 1000);
      return () => clearInterval(poll);

    } else {
      // Desktop: use Web Playback SDK
      if (sdkReady) {
        setReady(true);
        readyRef.current = true;
      } else {
        initDesktopSDK(localStorage.getItem("token"), () => {
          setReady(true);
          readyRef.current = true;
        });
      }

      const poll = setInterval(async () => {
        if (!sdkPlayer) return;
        const state = await sdkPlayer.getCurrentState();
        if (state === null) return;
        const isPlaying = !state.paused;
        if (playingRef.current !== isPlaying) {
          playingRef.current = isPlaying;
          setPlaying(isPlaying);
          socket.emit("player_state", { code: roomCodeRef.current, playing: isPlaying });
        }
      }, 500);
      return () => clearInterval(poll);
    }
  }, [isHost]);

  // Guests get state via socket
  useEffect(() => {
    if (isHost) return;
    const handler = ({ playing: p }) => { playingRef.current = p; setPlaying(p); };
    socket.on("player_state", handler);
    return () => socket.off("player_state", handler);
  }, [isHost]);

  const togglePlay = async (uri) => {
    if (!isHost || !readyRef.current) return;
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      socket.emit("player_state", { code: roomCodeRef.current, playing: false });
      await pausePlayback(mobileDeviceRef.current);
    } else {
      playingRef.current = true;
      setPlaying(true);
      socket.emit("player_state", { code: roomCodeRef.current, playing: true });
      if (uri && uri !== currentUriRef.current) {
        currentUriRef.current = uri;
        const deviceId = isMobile ? (mobileDeviceRef.current || await getMobileDeviceId()) : null;
        if (isMobile) mobileDeviceRef.current = deviceId;
        await playUri(uri, deviceId);
      } else {
        await resumePlayback(mobileDeviceRef.current);
      }
    }
  };

  const stop = async () => {
    if (!isHost) return;
    playingRef.current = false;
    setPlaying(false);
    currentUriRef.current = null;
    socket.emit("player_state", { code: roomCodeRef.current, playing: false });
    await pausePlayback(mobileDeviceRef.current);
  };

  return { ready: isHost ? ready : true, playing, togglePlay, stop };
}

// ── SINGLEPLAYER hook ──
export function useSpotifyDirect() {
  const [ready, setReady] = useState(sdkReady);
  const [playing, setPlaying] = useState(false);

  const readyRef = useRef(sdkReady);
  const playingRef = useRef(false);
  const currentUriRef = useRef(null);
  const mobileDeviceRef = useRef(null);
  const pollRef = useRef(null);

  const token = localStorage.getItem("token");
  const hasToken = !!token;

  useEffect(() => {
    if (!hasToken) return;

    if (isMobile) {
      getMobileDeviceId().then(id => {
        mobileDeviceRef.current = id;
        setReady(true);
        readyRef.current = true;
      });

      pollRef.current = setInterval(async () => {
        const t = localStorage.getItem("token");
        if (!t) return;
        try {
          const res = await fetch("https://api.spotify.com/v1/me/player", {
            headers: { Authorization: `Bearer ${t}` },
          });
          if (res.status === 204 || !res.ok) {
            if (playingRef.current !== false) { playingRef.current = false; setPlaying(false); }
            return;
          }
          const data = await res.json();
          const isPlaying = data.is_playing ?? false;
          if (data.device?.id) mobileDeviceRef.current = data.device.id;
          if (playingRef.current !== isPlaying) { playingRef.current = isPlaying; setPlaying(isPlaying); }
        } catch { /* ignore */ }
      }, 1000);

    } else {
      if (sdkReady) {
        setReady(true);
        readyRef.current = true;
      } else {
        initDesktopSDK(token, () => {
          setReady(true);
          readyRef.current = true;
        });
      }

      pollRef.current = setInterval(async () => {
        if (!sdkPlayer) return;
        const state = await sdkPlayer.getCurrentState();
        const isPlaying = state ? !state.paused : false;
        if (playingRef.current !== isPlaying) { playingRef.current = isPlaying; setPlaying(isPlaying); }
      }, 500);
    }

    return () => clearInterval(pollRef.current);
  }, [hasToken]);

  const togglePlay = async (uri) => {
    if (!hasToken || !readyRef.current) return;
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      await pausePlayback(mobileDeviceRef.current);
    } else {
      playingRef.current = true;
      setPlaying(true);
      if (uri && uri !== currentUriRef.current) {
        currentUriRef.current = uri;
        const deviceId = isMobile ? (mobileDeviceRef.current || await getMobileDeviceId()) : null;
        if (isMobile) mobileDeviceRef.current = deviceId;
        await playUri(uri, deviceId);
      } else {
        await resumePlayback(mobileDeviceRef.current);
      }
    }
  };

  const stop = async () => {
    playingRef.current = false;
    setPlaying(false);
    currentUriRef.current = null;
    await pausePlayback(mobileDeviceRef.current);
  };

  return { ready: hasToken ? ready : false, playing, togglePlay, stop };
}