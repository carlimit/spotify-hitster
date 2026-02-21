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

  if (window.Spotify) {
    return initPlayer();
  }

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
// KEY DESIGN: On mobile we never fully "stop" playback — we only
// pause or switch tracks. This keeps the Spotify device active
// for the entire game session. The user only needs to open the
// Spotify app once at the very start.
// ─────────────────────────────────────────────────────────────

async function getDevices(token) {
  const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.devices || [];
}

async function getTargetDevice(token) {
  const devices = await getDevices(token);
  if (!devices.length) return null;
  return devices.find(d => d.is_active) ||
         devices.find(d => d.type === "Smartphone") ||
         devices[0];
}

async function transferPlayback(token, deviceId) {
  await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
  await new Promise(r => setTimeout(r, 500));
}

async function connectPlay(token, uri) {
  // Try direct play first (works if device is active)
  const res = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ uris: [uri] }),
  });

  if (res.ok) return { ok: true };

  if (res.status === 404 || res.status === 502) {
    // No active device — try to find and wake one
    const device = await getTargetDevice(token);
    if (!device) return { ok: false, needsApp: true };

    await transferPlayback(token, device.id);

    const retry = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${device.id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ uris: [uri] }),
      }
    );

    if (retry.ok) return { ok: true };
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
//
// Host on desktop  → Web Playback SDK (plays in browser)
// Host on mobile   → Spotify Connect (plays on Spotify app)
//                    Only pauses between turns, never fully stops.
//                    Device stays active for the whole session.
// Non-host         → relay play/pause to host via socket
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

  // Auto-retry when returning from Spotify app (only needed once at start)
  useEffect(() => {
    if (!isHost || !mobileRef.current) return;

    const handleVisibility = async () => {
      if (document.visibilityState === "visible" && pendingUriRef.current) {
        const token = localStorage.getItem("token");
        if (!token) return;

        await new Promise(r => setTimeout(r, 1000));

        const uri = pendingUriRef.current;
        const result = await connectPlay(token, uri);
        if (result.ok) {
          pendingUriRef.current = null;
          setNeedsSpotifyApp(false);
          setPlaying(true);
          currentUriRef.current = uri;
          socket.emit("player_state", { code: roomCode, playing: true });
        }
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
      };
      socket.on("player_state", onPlayerState);

      return () => {
        socket.off("player_state", onPlayerState);
      };
    }

    const token = localStorage.getItem("token");
    if (!token) {
      console.warn("No Spotify token — play button will be disabled");
      return;
    }

    if (mobileRef.current) {
      console.log("📱 Mobile detected — using Spotify Connect");
      setReady(true);

      const onPlayTrack = ({ uri }) => {
        connectPlay(token, uri).catch(err => console.error("Connect play error:", err));
      };
      const onPauseTrack = () => {
        connectPause(token).catch(err => console.error("Connect pause error:", err));
      };
      socket.on("play_track", onPlayTrack);
      socket.on("pause_track", onPauseTrack);

      return () => {
        socket.off("play_track", onPlayTrack);
        socket.off("pause_track", onPauseTrack);
      };
    }

    // Desktop host: Web Playback SDK
    const player = initSDK(
      token,
      "Hitster Game Player",
      (p, deviceId) => {
        playerRef.current = p;
        deviceIdRef.current = deviceId;
        setReady(true);
      },
      (state) => {
        const isPlaying = !state.paused;
        setPlaying(isPlaying);
        currentUriRef.current = state.track_window?.current_track?.uri || null;
        socket.emit("player_state", { code: roomCode, playing: isPlaying });
      }
    );

    if (player) playerRef.current = player;

    const onPlayTrack = ({ uri }) => {
      hostPlayUriSDK(uri);
    };
    const onPauseTrack = () => {
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

  const hostPlayUriSDK = async (uri) => {
    const token = localStorage.getItem("token");
    if (!playerRef.current || !deviceIdRef.current || !token) return;
    try {
      await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ uris: [uri] }),
        }
      );
    } catch (err) {
      console.error("Host SDK playback error:", err);
    }
  };

  const togglePlay = useCallback(async (uri) => {
    if (!isHost) {
      if (playing) {
        socket.emit("pause_track", { code: roomCode });
      } else {
        socket.emit("play_track", { code: roomCode, uri });
      }
      setPlaying((p) => !p);
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) return;

    if (mobileRef.current) {
      try {
        if (playing) {
          await connectPause(token);
          setPlaying(false);
          socket.emit("player_state", { code: roomCode, playing: false });
        } else {
          const result = await connectPlay(token, uri);
          if (result.ok) {
            setPlaying(true);
            setNeedsSpotifyApp(false);
            currentUriRef.current = uri;
            socket.emit("player_state", { code: roomCode, playing: true });
          } else if (result.needsApp) {
            pendingUriRef.current = uri;
            setNeedsSpotifyApp(true);
          }
        }
      } catch (err) {
        console.error("Connect playback error:", err);
      }
      return;
    }

    // Desktop host
    if (!playerRef.current || !deviceIdRef.current) return;

    try {
      if (currentUriRef.current === uri && playing) {
        await playerRef.current.pause();
        setPlaying(false);
      } else {
        await fetch(
          `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ uris: [uri] }),
          }
        );
        setPlaying(true);
        currentUriRef.current = uri;
      }
    } catch (err) {
      console.error("Playback error:", err);
    }
  }, [isHost, playing, roomCode]);

  // "stop" on mobile only pauses — keeps the device connection alive
  const stop = useCallback(async () => {
    if (!isHost) {
      socket.emit("pause_track", { code: roomCode });
      setPlaying(false);
      return;
    }

    const token = localStorage.getItem("token");

    if (mobileRef.current) {
      // Just pause, don't disconnect — device stays active
      if (token) connectPause(token).catch(() => {});
      setPlaying(false);
      // DON'T clear currentUriRef — keeps the session alive
      socket.emit("player_state", { code: roomCode, playing: false });
      return;
    }

    if (!playerRef.current) return;
    try {
      await playerRef.current.pause();
      setPlaying(false);
      currentUriRef.current = null;
    } catch (err) {
      console.error("Stop error:", err);
    }
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

  return {
    ready,
    playing,
    togglePlay,
    stop,
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
  const [needsSpotifyApp, setNeedsSpotifyApp] = useState(false);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const currentUriRef = useRef(null);
  const mobileRef = useRef(isMobileBrowser());
  const pendingUriRef = useRef(null);

  // Auto-retry when returning from Spotify app
  useEffect(() => {
    if (!mobileRef.current) return;

    const handleVisibility = async () => {
      if (document.visibilityState === "visible" && pendingUriRef.current) {
        const token = localStorage.getItem("token");
        if (!token) return;

        await new Promise(r => setTimeout(r, 1000));

        const uri = pendingUriRef.current;
        const result = await connectPlay(token, uri);
        if (result.ok) {
          pendingUriRef.current = null;
          setNeedsSpotifyApp(false);
          setPlaying(true);
          currentUriRef.current = uri;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      console.warn("No Spotify token — play button will be disabled");
      return;
    }

    if (mobileRef.current) {
      console.log("📱 Mobile detected — using Spotify Connect fallback (solo)");
      setReady(true);
      return;
    }

    const player = initSDK(
      token,
      "Hitster Solo Player",
      (p, deviceId) => {
        playerRef.current = p;
        deviceIdRef.current = deviceId;
        setReady(true);
      },
      (state) => {
        setPlaying(!state.paused);
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
      try {
        if (playing) {
          await connectPause(token);
          setPlaying(false);
        } else {
          const result = await connectPlay(token, uri);
          if (result.ok) {
            setPlaying(true);
            setNeedsSpotifyApp(false);
            currentUriRef.current = uri;
          } else if (result.needsApp) {
            pendingUriRef.current = uri;
            setNeedsSpotifyApp(true);
          }
        }
      } catch (err) {
        console.error("Connect playback error:", err);
      }
      return;
    }

    if (!playerRef.current || !deviceIdRef.current) return;

    try {
      if (currentUriRef.current === uri && playing) {
        await playerRef.current.pause();
        setPlaying(false);
      } else {
        await fetch(
          `https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ uris: [uri] }),
          }
        );
        setPlaying(true);
        currentUriRef.current = uri;
      }
    } catch (err) {
      console.error("Playback error:", err);
    }
  }, [playing]);

  // Solo: just pause, keep device alive
  const stop = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (mobileRef.current) {
      if (token) connectPause(token).catch(() => {});
      setPlaying(false);
      return;
    }

    if (!playerRef.current) return;
    try {
      await playerRef.current.pause();
      setPlaying(false);
      currentUriRef.current = null;
    } catch (err) {
      console.error("Stop error:", err);
    }
  }, []);

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
    }
  }, []);

  return {
    ready,
    playing,
    togglePlay,
    stop,
    isMobile: mobileRef.current,
    needsSpotifyApp,
    retryPlayback,
  };
}