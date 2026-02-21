import { useState, useEffect, useRef, useCallback } from "react";
import { socket } from "../socket";

// ─────────────────────────────────────────────────────────────
// Mobile detection — the Spotify Web Playback SDK does NOT work
// on iOS/Android browsers. On mobile we fall back to Spotify
// Connect, which plays on the user's Spotify app instead.
// ─────────────────────────────────────────────────────────────
function isMobileBrowser() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

// ─────────────────────────────────────────────────────────────
// Shared helper — initialises the Spotify Web Playback SDK once
// (desktop only) and calls `onReady(player, deviceId)` when ready.
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
// Spotify Connect helpers — used on mobile where the Web
// Playback SDK doesn't work.
//
// The key challenge: if Spotify has been idle, there's no
// "active device" and play calls fail with 404. We solve this
// by checking /me/player/devices, finding a suitable device,
// and transferring playback to it first (which wakes it up).
// ─────────────────────────────────────────────────────────────

// Find a usable device, preferring the active one, then phone, then any
async function getTargetDevice(token) {
  const res = await fetch("https://api.spotify.com/v1/me/player/devices", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const devices = data.devices || [];
  if (!devices.length) return null;

  // Prefer already-active device
  const active = devices.find(d => d.is_active);
  if (active) return active;

  // Prefer smartphone
  const phone = devices.find(d => d.type === "Smartphone");
  if (phone) return phone;

  // Any device
  return devices[0];
}

// Transfer playback to a device (wakes it up if idle)
async function transferPlayback(token, deviceId) {
  await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
  // Give Spotify a moment to activate the device
  await new Promise(r => setTimeout(r, 300));
}

async function connectPlay(token, uri) {
  // First try playing directly (works if there's an active device)
  const res = await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ uris: [uri] }),
  });

  if (res.ok) return true;

  // If 404 (no active device) — find and wake a device, then retry
  if (res.status === 404 || res.status === 502) {
    console.log("📱 No active device — looking for available devices...");
    const device = await getTargetDevice(token);
    if (!device) {
      console.warn("📱 No Spotify devices found. Is the Spotify app open?");
      return false;
    }

    console.log(`📱 Waking device: ${device.name} (${device.type})`);
    await transferPlayback(token, device.id);

    // Retry play on the now-active device
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

    if (!retry.ok) {
      console.warn("📱 Retry failed:", retry.status);
      return false;
    }
    return true;
  }

  console.warn("📱 Play failed:", res.status);
  return false;
}

async function connectPause(token) {
  const res = await fetch("https://api.spotify.com/v1/me/player/pause", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 just means nothing is playing — that's fine
  return res.ok || res.status === 404;
}

// ─────────────────────────────────────────────────────────────
// Multiplayer hook — used in Game.jsx
//
// Host on desktop  → Web Playback SDK (plays in browser)
// Host on mobile   → Spotify Connect (plays on Spotify app)
// Non-host         → relay play/pause to host via socket
// ─────────────────────────────────────────────────────────────
export function useSpotifyPlayer(roomCode, isHost) {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const currentUriRef = useRef(null);
  const mobileRef = useRef(isMobileBrowser());

  useEffect(() => {
    if (!isHost) {
      // Non-host: mark ready so play button is enabled.
      // Playback is relayed to host via socket.
      setReady(true);

      const onPlayerState = ({ playing: isPlaying }) => {
        setPlaying(isPlaying);
      };
      socket.on("player_state", onPlayerState);

      return () => {
        socket.off("player_state", onPlayerState);
      };
    }

    // ── Host path ──
    const token = localStorage.getItem("token");
    if (!token) {
      console.warn("No Spotify token — play button will be disabled");
      return;
    }

    if (mobileRef.current) {
      // Mobile host: skip SDK, use Spotify Connect
      console.log("📱 Mobile detected — using Spotify Connect fallback");
      setReady(true);

      // Listen for play/pause requests from non-host players
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

    // Desktop host: initialise the Web Playback SDK
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
        // Broadcast state to non-host players
        socket.emit("player_state", { code: roomCode, playing: isPlaying });
      }
    );

    if (player) playerRef.current = player;

    // Host listens for play/pause requests from non-host players
    const onPlayTrack = ({ uri }) => {
      hostPlayUriSDK(uri);
    };
    const onPauseTrack = () => {
      if (playerRef.current) {
        playerRef.current.pause();
      }
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

  // Desktop SDK play helper
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
      // Non-host: relay to host via socket
      if (playing) {
        socket.emit("pause_track", { code: roomCode });
      } else {
        socket.emit("play_track", { code: roomCode, uri });
      }
      setPlaying((p) => !p);
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      console.warn("Cannot play — no token");
      return;
    }

    if (mobileRef.current) {
      // Mobile host: use Spotify Connect
      try {
        if (playing) {
          await connectPause(token);
          setPlaying(false);
          socket.emit("player_state", { code: roomCode, playing: false });
        } else {
          const ok = await connectPlay(token, uri);
          if (ok) {
            setPlaying(true);
            currentUriRef.current = uri;
            socket.emit("player_state", { code: roomCode, playing: true });
          }
        }
      } catch (err) {
        console.error("Connect playback error:", err);
      }
      return;
    }

    // Desktop host: control SDK directly
    if (!playerRef.current || !deviceIdRef.current) {
      console.warn("Cannot play — player not ready");
      return;
    }

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
      if (token) {
        connectPause(token).catch(() => {});
      }
      setPlaying(false);
      currentUriRef.current = null;
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

  return { ready, playing, togglePlay, stop, isMobile: mobileRef.current };
}

// ─────────────────────────────────────────────────────────────
// Single-player hook — used in SinglePlayerGame.jsx
//
// Desktop → Web Playback SDK (plays in browser)
// Mobile  → Spotify Connect (plays on Spotify app)
// ─────────────────────────────────────────────────────────────
export function useSpotifyDirect() {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef(null);
  const deviceIdRef = useRef(null);
  const currentUriRef = useRef(null);
  const mobileRef = useRef(isMobileBrowser());

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

    // Desktop: initialise SDK
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
    if (!token) {
      console.warn("Cannot play — no token");
      return;
    }

    if (mobileRef.current) {
      try {
        if (playing) {
          await connectPause(token);
          setPlaying(false);
        } else {
          const ok = await connectPlay(token, uri);
          if (ok) {
            setPlaying(true);
            currentUriRef.current = uri;
          }
        }
      } catch (err) {
        console.error("Connect playback error:", err);
      }
      return;
    }

    // Desktop: use SDK
    if (!playerRef.current || !deviceIdRef.current) {
      console.warn("Cannot play — player not ready");
      return;
    }

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
      if (token) {
        connectPause(token).catch(() => {});
      }
      setPlaying(false);
      currentUriRef.current = null;
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

  return { ready, playing, togglePlay, stop, isMobile: mobileRef.current };
}