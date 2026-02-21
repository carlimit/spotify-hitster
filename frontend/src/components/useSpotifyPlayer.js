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
  await new Promise(r => setTimeout(r, 300));
}

// Quick play attempt — just hits the play endpoint, no device lookup dance
async function quickPlay(token, uri) {
  const res = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uris: [uri] }),
  });
  return res.ok;
}

async function connectPlay(token, uri) {
  // First: fast attempt, no fallback
  const res = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ uris: [uri] }),
  });

  if (res.ok) return { ok: true };

  if (res.status === 404 || res.status === 502) {
    const device = await getTargetDevice(token);
    if (!device) return { ok: false, needsApp: true };

    await transferPlayback(token, device.id);

    const retry = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${device.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
// Fast retry helper — polls with quickPlay (no slow device
// discovery) so each attempt is just one fast HTTP request.
// On success, calls onSuccess() immediately.
// ─────────────────────────────────────────────────────────────
async function retryUntilReady(token, uri, onSuccess, signal) {
  const MAX_ATTEMPTS = 40; // 40 × 150ms = 6s max
  const INTERVAL = 150;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (signal?.aborted) return;
    // No delay on first attempt — try immediately
    if (i > 0) await new Promise(r => setTimeout(r, INTERVAL));
    if (signal?.aborted) return;

    try {
      // Use quickPlay — just one HTTP request, no device lookup overhead
      const ok = await quickPlay(token, uri);
      if (ok) {
        onSuccess();
        return;
      }
    } catch {
      // network hiccup — keep trying
    }
  }
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
  const retryAbortRef = useRef(null);

  // Auto-retry when returning from Spotify app — fast polling
  useEffect(() => {
    if (!isHost || !mobileRef.current) return;

    let isRetrying = false;

    const startRetry = async () => {
      if (!pendingUriRef.current) return;
      if (isRetrying) return; // already running — don't stack
      isRetrying = true;
      const token = localStorage.getItem("token");
      if (!token) { isRetrying = false; return; }
      const uri = pendingUriRef.current;
      retryAbortRef.current?.abort();
      const controller = new AbortController();
      retryAbortRef.current = controller;
      await retryUntilReady(token, uri, () => {
        pendingUriRef.current = null;
        retryAbortRef.current = null;
        setNeedsSpotifyApp(false);
        setPlaying(true);
        currentUriRef.current = uri;
        socket.emit("player_state", { code: roomCode, playing: true });
      }, controller.signal);
      isRetrying = false;
    };

    const handleVisibility = () => { if (document.visibilityState === "visible") startRetry(); };
    const handleFocus = () => startRetry();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
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

    // Cancel any background polling
    retryAbortRef.current?.abort();
    const controller = new AbortController();
    retryAbortRef.current = controller;

    await retryUntilReady(token, uri, () => {
      pendingUriRef.current = null;
      retryAbortRef.current = null;
      setNeedsSpotifyApp(false);
      setPlaying(true);
      currentUriRef.current = uri;
      socket.emit("player_state", { code: roomCode, playing: true });
    }, controller.signal);
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
  const retryAbortRef = useRef(null);

  // Auto-retry when returning from Spotify app — fast polling
  useEffect(() => {
    if (!mobileRef.current) return;

    let isRetrying = false;

    const startRetry = async () => {
      if (!pendingUriRef.current) return;
      if (isRetrying) return; // already running — don't stack
      isRetrying = true;
      const token = localStorage.getItem("token");
      if (!token) { isRetrying = false; return; }
      const uri = pendingUriRef.current;
      retryAbortRef.current?.abort();
      const controller = new AbortController();
      retryAbortRef.current = controller;
      await retryUntilReady(token, uri, () => {
        pendingUriRef.current = null;
        retryAbortRef.current = null;
        setNeedsSpotifyApp(false);
        setPlaying(true);
        currentUriRef.current = uri;
      }, controller.signal);
      isRetrying = false;
    };

    const handleVisibility = () => { if (document.visibilityState === "visible") startRetry(); };
    const handleFocus = () => startRetry();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
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

    retryAbortRef.current?.abort();
    const controller = new AbortController();
    retryAbortRef.current = controller;

    await retryUntilReady(token, uri, () => {
      pendingUriRef.current = null;
      retryAbortRef.current = null;
      setNeedsSpotifyApp(false);
      setPlaying(true);
      currentUriRef.current = uri;
    }, controller.signal);
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