import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

// ── Shared SDK — one instance for the entire app lifetime ──
// Only initialized on the HOST's device. Non-hosts never touch the SDK.
let sdkPlayer = null;
let sdkDeviceId = null;
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

function initSDK(token, onReady) {
  if (sdkReady && sdkDeviceId) { onReady(sdkDeviceId); return; }
  sdkReadyCallbacks.push(onReady);
  if (sdkInitialising) return;
  sdkInitialising = true;

  const create = () => {
    const player = new window.Spotify.Player({
      name: "Hitster Game",
      getOAuthToken: cb => cb(localStorage.getItem("token") || token),
      volume: 0.8
    });
    player.addListener("ready", ({ device_id }) => {
      sdkDeviceId = device_id;
      sdkReady = true;
      sdkPlayer = player;
      sdkReadyCallbacks.forEach(cb => cb(device_id));
      sdkReadyCallbacks.length = 0;
    });
    player.addListener("not_ready", () => { sdkReady = false; sdkDeviceId = null; });
    player.addListener("initialization_error", ({ message }) => console.error("Spotify init:", message));
    player.addListener("authentication_error", ({ message }) => console.error("Spotify auth:", message));
    player.addListener("account_error", ({ message }) => console.error("Spotify Premium needed:", message));
    player.connect();
  };

  injectSDKScript();
  if (window.Spotify) {
    create();
  } else {
    const prev = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => { if (prev) prev(); create(); };
  }
}

// Plays a URI on the host's SDK device
async function playUri(uri) {
  const token = localStorage.getItem("token");
  if (!token || !sdkDeviceId) return false;
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${sdkDeviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [uri] })
  });
  return res.ok;
}

// Retry wrapper — mobile devices sometimes need a moment before the request succeeds
async function playUriWithRetry(uri, maxAttempts = 3, delayMs = 800) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ok = await playUri(uri);
    if (ok) return true;
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return false;
}

async function pauseSDK() { await sdkPlayer?.pause(); }
async function resumeSDK() { await sdkPlayer?.resume(); }

// ── MULTIPLAYER hook ──
//
// HOST   (has Spotify token) → initializes SDK, plays audio locally,
//                               listens for play_track/pause_track from server
//
// NON-HOST (no token needed) → emits play_track/pause_track socket events,
//                               server forwards them to host, host's SDK plays
//
export function useSpotifyPlayer(roomCode) {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const isHost = !!localStorage.getItem("token");
  const playingRef = useRef(false);
  const currentUriRef = useRef(null);
  const roomCodeRef = useRef(roomCode);
  const loadingRef = useRef(false);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  useEffect(() => {
    if (isHost) {
      // ── HOST: initialize SDK so audio plays on this device ──
      initSDK(localStorage.getItem("token"), () => setReady(true));

      // ✅ HOST: listen for play/pause commands forwarded from non-host active players
      // Flow: non-host taps play → emits play_track → server forwards to host socket
      //       → host SDK actually plays the audio here
      const onPlayTrack = async ({ uri }) => {
        if (!sdkReady) return;
        await sdkPlayer?.activateElement();
        if (uri && uri !== currentUriRef.current) {
          currentUriRef.current = uri;
          const ok = await playUriWithRetry(uri);
          if (ok) {
            playingRef.current = true;
            setPlaying(true);
            socket.emit("player_state", { code: roomCodeRef.current, playing: true });
          }
        } else {
          await resumeSDK();
          playingRef.current = true;
          setPlaying(true);
          socket.emit("player_state", { code: roomCodeRef.current, playing: true });
        }
      };

      const onPauseTrack = async () => {
        await pauseSDK();
        playingRef.current = false;
        setPlaying(false);
        socket.emit("player_state", { code: roomCodeRef.current, playing: false });
      };

      socket.on("play_track", onPlayTrack);
      socket.on("pause_track", onPauseTrack);

      // Poll SDK state and broadcast to all players
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

      return () => {
        clearInterval(poll);
        socket.off("play_track", onPlayTrack);
        socket.off("pause_track", onPauseTrack);
      };
    } else {
      // ── NON-HOST: just listen for play state broadcasts ──
      const handler = ({ playing: p }) => setPlaying(p);
      socket.on("player_state", handler);
      return () => socket.off("player_state", handler);
    }
  }, [isHost]);

  const togglePlay = async (uri) => {
    if (isHost) {
      // ── HOST: play directly via SDK on this device ──
      if (!sdkReady) return;
      if (loadingRef.current) return;

      await sdkPlayer?.activateElement();

      if (playingRef.current) {
        playingRef.current = false;
        setPlaying(false);
        socket.emit("player_state", { code: roomCodeRef.current, playing: false });
        await pauseSDK();
      } else {
        loadingRef.current = true;
        playingRef.current = true;
        setPlaying(true);
        socket.emit("player_state", { code: roomCodeRef.current, playing: true });
        try {
          if (uri && uri !== currentUriRef.current) {
            currentUriRef.current = uri;
            const ok = await playUriWithRetry(uri);
            if (!ok) {
              playingRef.current = false;
              setPlaying(false);
              socket.emit("player_state", { code: roomCodeRef.current, playing: false });
            }
          } else {
            await resumeSDK();
          }
        } finally {
          loadingRef.current = false;
        }
      }
    } else {
      // ── NON-HOST (active player): emit to server, host's SDK plays it ──
      if (playing) {
        setPlaying(false);
        socket.emit("pause_track", { code: roomCodeRef.current });
      } else {
        setPlaying(true);
        socket.emit("play_track", { code: roomCodeRef.current, uri });
      }
    }
  };

  const stop = async () => {
    if (isHost) {
      playingRef.current = false;
      setPlaying(false);
      currentUriRef.current = null;
      loadingRef.current = false;
      socket.emit("player_state", { code: roomCodeRef.current, playing: false });
      await pauseSDK();
    } else {
      setPlaying(false);
      socket.emit("pause_track", { code: roomCodeRef.current });
    }
  };

  // Non-hosts: ready is always true — they can press play any time,
  // the button just triggers a socket emit rather than SDK playback
  return { ready: isHost ? ready : true, playing, togglePlay, stop };
}

// ── SINGLEPLAYER hook — always plays on current device, unchanged ──
export function useSpotifyDirect() {
  const [ready, setReady] = useState(sdkReady);
  const [playing, setPlaying] = useState(false);
  const hasToken = !!localStorage.getItem("token");
  const playingRef = useRef(false);
  const currentUriRef = useRef(null);
  const pollRef = useRef(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!hasToken) return;
    initSDK(localStorage.getItem("token"), () => {
      setReady(true);
      pollRef.current = setInterval(async () => {
        if (!sdkPlayer) return;
        const state = await sdkPlayer.getCurrentState();
        const isPlaying = state ? !state.paused : false;
        if (playingRef.current !== isPlaying) {
          playingRef.current = isPlaying;
          setPlaying(isPlaying);
        }
      }, 500);
    });
    return () => clearInterval(pollRef.current);
  }, [hasToken]);

  const togglePlay = async (uri) => {
    console.log("togglePlay — isHost:", isHost, "token:", !!localStorage.getItem("token"), "sdkReady:", sdkReady);
    if (!hasToken || !sdkReady || !sdkDeviceId) return;
    if (loadingRef.current) return;

    await sdkPlayer?.activateElement();

    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      await pauseSDK();
    } else {
      loadingRef.current = true;
      playingRef.current = true;
      setPlaying(true);
      try {
        if (uri && uri !== currentUriRef.current) {
          currentUriRef.current = uri;
          const ok = await playUriWithRetry(uri);
          if (!ok) {
            playingRef.current = false;
            setPlaying(false);
          }
        } else {
          await resumeSDK();
        }
      } finally {
        loadingRef.current = false;
      }
    }
  };

  const stop = async () => {
    playingRef.current = false;
    setPlaying(false);
    currentUriRef.current = null;
    loadingRef.current = false;
    await pauseSDK();
  };

  return { ready: hasToken ? ready : false, playing, togglePlay, stop };
}