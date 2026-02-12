import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

export function useSpotifyPlayer(roomCode) {
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const isHost = !!localStorage.getItem("token");

  // ── HOST ONLY: init SDK + listen for commands from server ──
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
        // Broadcast play state to all clients via server
        socket.emit("player_state", { code: roomCode, playing: !state.paused });
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

    // Host receives play/pause commands from server (sent by any player)
    socket.on("play_track", async ({ uri }) => {
      const deviceId = deviceIdRef.current;
      if (!deviceId) return;
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uris: [uri] })
      });
    });

    socket.on("pause_track", async () => {
      await playerRef.current?.pause();
    });

    return () => {
      playerRef.current?.disconnect();
      socket.off("play_track");
      socket.off("pause_track");
    };
  }, [isHost]);

  // ── ALL CLIENTS: listen for play state broadcast from host ──
  useEffect(() => {
    socket.on("player_state", ({ playing: isPlaying }) => {
      setPlaying(isPlaying);
    });
    return () => socket.off("player_state");
  }, []);

  // ── Called by anyone pressing the button ──
  // Always goes via socket → server → host, even for the host itself
  // This keeps the logic identical for everyone and ensures
  // play state broadcasts back to all players
  const togglePlay = (uri) => {
    if (playing) {
      socket.emit("pause_track", { code: roomCode });
    } else {
      socket.emit("play_track", { code: roomCode, uri });
    }
  };

  const stop = () => {
    socket.emit("pause_track", { code: roomCode });
  };

  return { ready: isHost ? ready : true, playing, togglePlay, stop };
}