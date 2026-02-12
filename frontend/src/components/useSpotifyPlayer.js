import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

// ── Singleton SDK — only ever one player instance ──
let sdkPlayer = null;
let sdkDeviceId = null;
let sdkReady = false;
const sdkReadyCallbacks = [];
let scriptInjected = false;

function injectSDKScript() {
  if (scriptInjected || document.getElementById("spotify-sdk")) return;
  scriptInjected = true;
  const script = document.createElement("script");
  script.id = "spotify-sdk";
  script.src = "https://sdk.scdn.co/spotify-player.js";
  document.head.appendChild(script);
}

function initSDK(token, onReady) {
  if (sdkReady && sdkDeviceId) { onReady(sdkDeviceId); return; }
  sdkReadyCallbacks.push(onReady);
  if (sdkPlayer) return; // already initialising, callback queued above

  const create = () => {
    const player = new window.Spotify.Player({
      name: "Hitster Game",
      getOAuthToken: cb => cb(localStorage.getItem("token") || token),
      volume: 0.8
    });

    player.addListener("ready", ({ device_id }) => {
      console.log("🎵 SDK ready, device:", device_id);
      sdkDeviceId = device_id;
      sdkReady = true;
      sdkPlayer = player;
      sdkReadyCallbacks.forEach(cb => cb(device_id));
      sdkReadyCallbacks.length = 0;
    });

    player.addListener("not_ready", () => {
      sdkReady = false;
      sdkDeviceId = null;
    });

    player.addListener("initialization_error", ({ message }) => console.error("Spotify init:", message));
    player.addListener("authentication_error", ({ message }) => console.error("Spotify auth:", message));
    player.addListener("account_error", ({ message }) => console.error("Spotify account (Premium needed):", message));

    player.connect();
  };

  injectSDKScript();

  if (window.Spotify) {
    create();
  } else {
    const prev = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (prev) prev();
      create();
    };
  }
}

// Play a new URI from the start
async function playUri(uri) {
  const token = localStorage.getItem("token");
  if (!token || !sdkDeviceId) return;
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${sdkDeviceId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [uri] })
  });
}

async function resumeSDK() {
  if (!sdkPlayer) return;
  await sdkPlayer.resume();
}

async function pauseSDK() {
  if (!sdkPlayer) return;
  await sdkPlayer.pause();
}

async function getPlayingState() {
  if (!sdkPlayer) return null;
  return await sdkPlayer.getCurrentState();
}

// ── MULTIPLAYER hook ──
export function useSpotifyPlayer(roomCode) {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const isHost = !!localStorage.getItem("token");
  const currentUriRef = useRef(null);
  const roomCodeRef = useRef(roomCode);
  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);

  useEffect(() => {
    if (!isHost) return;
    const token = localStorage.getItem("token");
    initSDK(token, () => setReady(true));

    // Poll play state every 500ms and broadcast to guests
    const poll = setInterval(async () => {
      const state = await getPlayingState();
      if (state === null) return;
      const isPlaying = !state.paused;
      setPlaying(prev => {
        if (prev !== isPlaying) {
          socket.emit("player_state", { code: roomCodeRef.current, playing: isPlaying });
        }
        return isPlaying;
      });
    }, 500);

    return () => clearInterval(poll);
  }, [isHost]);

  // Guests receive state from host
  useEffect(() => {
    if (isHost) return;
    const handler = ({ playing: p }) => setPlaying(p);
    socket.on("player_state", handler);
    return () => socket.off("player_state", handler);
  }, [isHost]);

  const togglePlay = async (uri) => {
    if (!isHost) return;

    if (playing) {
      await pauseSDK();
      setPlaying(false);
      socket.emit("player_state", { code: roomCodeRef.current, playing: false });
    } else {
      if (uri && uri !== currentUriRef.current) {
        currentUriRef.current = uri;
        await playUri(uri);
      } else {
        await resumeSDK();
      }
      setPlaying(true);
      socket.emit("player_state", { code: roomCodeRef.current, playing: true });
    }
  };

  const stop = async () => {
    if (!isHost) return;
    await pauseSDK();
    setPlaying(false);
    socket.emit("player_state", { code: roomCodeRef.current, playing: false });
  };

  return { ready: isHost ? ready : true, playing, togglePlay, stop };
}

// ── SINGLEPLAYER hook — direct SDK, no socket ──
export function useSpotifyDirect() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const hasToken = !!localStorage.getItem("token");
  const currentUriRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!hasToken) return;
    const token = localStorage.getItem("token");

    initSDK(token, () => {
      setReady(true);
      pollRef.current = setInterval(async () => {
        const state = await getPlayingState();
        setPlaying(state ? !state.paused : false);
      }, 500);
    });

    return () => clearInterval(pollRef.current);
  }, [hasToken]);

  const togglePlay = async (uri) => {
    if (!hasToken || !sdkReady) return;

    const state = await getPlayingState();
    const isCurrentlyPlaying = state ? !state.paused : false;

    if (isCurrentlyPlaying) {
      await pauseSDK();
      setPlaying(false);
    } else {
      if (uri && uri !== currentUriRef.current) {
        currentUriRef.current = uri;
        await playUri(uri);
      } else {
        await resumeSDK();
      }
      setPlaying(true);
    }
  };

  const stop = async () => {
    await pauseSDK();
    setPlaying(false);
    currentUriRef.current = null;
  };

  return { ready: hasToken ? ready : false, playing, togglePlay, stop };
}