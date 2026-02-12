import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

export function useSpotifyPlayer(roomCode) {
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const isHost = !!localStorage.getItem("token");

  // ── HOST: initialise SDK and listen for play_track from server ──
  useEffect(() => {
    if (!isHost) return;

    const token = localStorage.getItem("token");

    const initPlayer = () => {
      const player = new window.Spotify.Player({
        name: "Hitster Game",
        getOAuthToken: cb => cb(token),
        volume: 0.8
      });

      player.addListener("ready", ({ device_id }) => {
        console.log("🎵 Spotify ready, device:", device_id);
        deviceIdRef.current = device_id;
        setReady(true);
      });

      player.addListener("not_ready", () => setReady(false));

      player.addListener("player_state_changed", state => {
        if (!state) return;
        setPlaying(!state.paused);
      });

      player.addListener("initialization_error", ({ message }) =>
        console.error("Spotify init:", message));
      player.addListener("authentication_error", ({ message }) =>
        console.error("Spotify auth:", message));
      player.addListener("account_error", ({ message }) =>
        console.error("Spotify account (Premium needed):", message));

      player.connect();
      playerRef.current = player;
    };

    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
    }

    // Host listens for play requests from guests
    socket.on("play_track", async ({ uri }) => {
      await startTrack(uri);
    });

    return () => {
      playerRef.current?.disconnect();
      socket.off("play_track");
    };
  }, [isHost]);

  // ── Play a URI on the host device via Spotify API ──
  const startTrack = async (uri) => {
    const token = localStorage.getItem("token");
    const deviceId = deviceIdRef.current;
    if (!token || !deviceId) return;

    await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ uris: [uri] })
      }
    );
  };

  // ── Called by anyone pressing the button ──
  const togglePlay = async (uri) => {
    if (isHost) {
      // Host controls directly
      const player = playerRef.current;
      if (!player) return;
      const state = await player.getCurrentState();
      if (!state) {
        await startTrack(uri);
      } else {
        await player.togglePlay();
      }
    } else {
      // Guest: send signal to server → host plays it
      socket.emit("play_track", { code: roomCode, uri });
    }
  };

  const stop = async () => {
    if (!isHost) return;
    await playerRef.current?.pause();
    setPlaying(false);
  };

  return { ready: isHost ? ready : true, playing, togglePlay, stop };
}