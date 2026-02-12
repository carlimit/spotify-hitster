import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

// ── Shared SDK init — only one player instance ever ──
let sdkPlayer = null;
let sdkDeviceId = null;
let sdkReady = false;
const sdkReadyCallbacks = [];

function initSDK(token, onReady) {
  if (sdkReady && sdkDeviceId) { onReady(sdkDeviceId); return; }
  sdkReadyCallbacks.push(onReady);

  if (sdkPlayer) return; // already initialising

  const create = () => {
    const player = new window.Spotify.Player({
      name: "Hitster Game",
      getOAuthToken: cb => cb(localStorage.getItem("token") || token),
      volume: 0.8
    });

    player.addListener("ready", ({ device_id }) => {
      console.log("🎵 Spotify SDK ready:", device_id);
      sdkDeviceId = device_id;
      sdkReady = true;
      sdkReadyCallbacks.forEach(cb => cb(device_id));
      sdkReadyCallbacks.length = 0;
    });

    player.addListener("not_ready", () => { sdkReady = false; sdkDeviceId = null; });
    player.addListener("initialization_error", ({ message }) => console.error("Spotify init:", message));
    player.addListener("authentication_error", ({ message }) => console.error("Spotify auth:", message));
    player.addListener("account_error", ({ message }) => console.error("Spotify account (Premium needed):", message));

    player.connect();
    sdkPlayer = player;
  };

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

async function pauseSDK() {
  await sdkPlayer?.pause();
}

// ── MULTIPLAYER hook — play/pause goes via socket ──
export function useSpotifyPlayer(roomCode) {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const isHost = !!localStorage.getItem("token");

  useEffect(() => {
    if (!isHost) return;
    const token = localStorage.getItem("token");

    initSDK(token, () => setReady(true));

    // Host listens for commands from server
    socket.on("play_track", async ({ uri }) => {
      await playUri(uri);
    });

    socket.on("pause_track", async () => {
      await pauseSDK();
    });

    // State changes → broadcast to all players
    const onStateChange = (state) => {
      if (!state) return;
      const isPlaying = !state.paused;
      setPlaying(isPlaying);
      socket.emit("player_state", { code: roomCode, playing: isPlaying });
    };

    // Poll state since addListener may already be attached to sdkPlayer
    const poll = setInterval(async () => {
      if (!sdkPlayer) return;
      const state = await sdkPlayer.getCurrentState();
      if (!state) return;
      const isPlaying = !state.paused;
      setPlaying(p => {
        if (p !== isPlaying) socket.emit("player_state", { code: roomCode, playing: isPlaying });
        return isPlaying;
      });
    }, 500);

    return () => {
      clearInterval(poll);
      socket.off("play_track");
      socket.off("pause_track");
    };
  }, [isHost, roomCode]);

  // All clients get play state from server
  useEffect(() => {
    if (isHost) return; // host tracks state locally
    socket.on("player_state", ({ playing: p }) => setPlaying(p));
    return () => socket.off("player_state");
  }, [isHost]);

  const togglePlay = (uri) => {
    if (playing) {
      socket.emit("pause_track", { code: roomCode });
    } else {
      socket.emit("play_track", { code: roomCode, uri });
    }
  };

  const stop = () => socket.emit("pause_track", { code: roomCode });

  return { ready: isHost ? ready : true, playing, togglePlay, stop };
}

// ── SINGLEPLAYER hook — direct SDK control, no socket ──
export function useSpotifyDirect() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const isHost = !!localStorage.getItem("token");
  const pollRef = useRef(null);

  useEffect(() => {
    if (!isHost) return;
    const token = localStorage.getItem("token");

    initSDK(token, () => {
      setReady(true);
      // Poll play state
      pollRef.current = setInterval(async () => {
        if (!sdkPlayer) return;
        const state = await sdkPlayer.getCurrentState();
        setPlaying(state ? !state.paused : false);
      }, 500);
    });

    return () => clearInterval(pollRef.current);
  }, [isHost]);

  const togglePlay = async (uri) => {
    if (!isHost) return;
    const state = await sdkPlayer?.getCurrentState();
    if (!state) {
      await playUri(uri);
    } else {
      await sdkPlayer.togglePlay();
    }
  };

  const stop = async () => { await pauseSDK(); setPlaying(false); };

  return { ready: isHost ? ready : false, playing, togglePlay, stop };
}