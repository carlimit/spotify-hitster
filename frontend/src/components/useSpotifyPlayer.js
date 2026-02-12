import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

// ── Shared SDK — one instance for the entire app lifetime ──
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
    player.addListener("authentication_error", ({ message }) => {
      console.error("Spotify auth failed — token may be expired or missing scopes");
      // Clear bad token so user gets prompted to re-login
      localStorage.removeItem("token");
    });
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

async function playUri(uri) {
  const token = localStorage.getItem("token");
  if (!token || !sdkDeviceId) return;
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${sdkDeviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [uri] })
  });
}

async function pauseSDK() { await sdkPlayer?.pause(); }
async function resumeSDK() { await sdkPlayer?.resume(); }

// ── MULTIPLAYER hook ──
export function useSpotifyPlayer(roomCode) {
  const [ready, setReady] = useState(sdkReady);
  const [playing, setPlaying] = useState(false);
  const isHost = !!localStorage.getItem("token");
  const playingRef = useRef(false);
  const currentUriRef = useRef(null);
  const roomCodeRef = useRef(roomCode);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  useEffect(() => {
    if (!isHost) return;
    initSDK(localStorage.getItem("token"), () => setReady(true));

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
  }, [isHost]);

  useEffect(() => {
    if (isHost) return;
    const handler = ({ playing: p }) => setPlaying(p);
    socket.on("player_state", handler);
    return () => socket.off("player_state", handler);
  }, [isHost]);

  const togglePlay = async (uri) => {
    if (!isHost) return;
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      socket.emit("player_state", { code: roomCodeRef.current, playing: false });
      await pauseSDK();
    } else {
      playingRef.current = true;
      setPlaying(true);
      socket.emit("player_state", { code: roomCodeRef.current, playing: true });
      if (uri && uri !== currentUriRef.current) {
        currentUriRef.current = uri;
        await playUri(uri);
      } else {
        await resumeSDK();
      }
    }
  };

  const stop = async () => {
    if (!isHost) return;
    playingRef.current = false;
    setPlaying(false);
    currentUriRef.current = null;
    socket.emit("player_state", { code: roomCodeRef.current, playing: false });
    await pauseSDK();
  };

  return { ready: isHost ? ready : true, playing, togglePlay, stop };
}

// ── SINGLEPLAYER hook ──
export function useSpotifyDirect() {
  const [ready, setReady] = useState(sdkReady);
  const [playing, setPlaying] = useState(false);
  const hasToken = !!localStorage.getItem("token");
  const playingRef = useRef(false);
  const currentUriRef = useRef(null);
  const pollRef = useRef(null);

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
    if (!hasToken) return;
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      await pauseSDK();
    } else {
      playingRef.current = true;
      setPlaying(true);
      if (uri && uri !== currentUriRef.current) {
        currentUriRef.current = uri;
        await playUri(uri);
      } else {
        await resumeSDK();
      }
    }
  };

  const stop = async () => {
    playingRef.current = false;
    setPlaying(false);
    currentUriRef.current = null;
    await pauseSDK();
  };

  return { ready: hasToken ? ready : false, playing, togglePlay, stop };
}