const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

/* =========================================
   🎵 SPOTIFY TOKEN
========================================= */

let accessToken = "";

async function getSpotifyToken() {
  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "client_credentials" }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
          ).toString("base64")
      }
    }
  );
  accessToken = response.data.access_token;
  console.log("✅ Spotify token refreshed");
  setTimeout(getSpotifyToken, 50 * 60 * 1000);
}

/* =========================================
   🎵 YEAR HELPER
   Spotify's release_date can be a re-release date.
   We always use the earliest/original year by preferring
   the album's release_date and stripping to just the year.
========================================= */
function extractYear(track) {
  const date = track.album?.release_date || "";
  return date.substring(0, 4);
}

/* =========================================
   🎵 ORIGINAL YEAR LOOKUP
   Searches Spotify for the track name + artist and returns the
   earliest release year found across all results. This catches the
   original studio release even when a playlist contains a remaster
   or re-release. Falls back to the album's own release_date if the
   search returns nothing useful.

   Only used for playlist loading (called once per track at load time,
   results are cached in the track objects sent to clients).
========================================= */
async function getOriginalYear(track) {
  const trackName = track.name;
  const artistName = track.artists?.[0]?.name || "";
  const albumYear = track.album?.release_date?.substring(0, 4) || "";

  try {
    // Search for all versions of this track by this artist
    const query = `track:"${trackName}" artist:"${artistName}"`;
    const response = await axios.get("https://api.spotify.com/v1/search", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { q: query, type: "track", limit: 50 }
    });

    const items = response.data.tracks?.items || [];
    if (!items.length) return albumYear;

    // Keep only tracks where at least one artist matches (case-insensitive)
    const artistLower = artistName.toLowerCase();
    const sameArtist = items.filter(t =>
      t.artists?.some(a =>
        a.name.toLowerCase().includes(artistLower) ||
        artistLower.includes(a.name.toLowerCase())
      )
    );

    const candidates = sameArtist.length > 0 ? sameArtist : items;

    // Collect valid years
    const years = candidates
      .map(t => parseInt(t.album?.release_date?.substring(0, 4) || ""))
      .filter(y => !isNaN(y) && y > 1900 && y <= new Date().getFullYear());

    if (!years.length) return albumYear;

    const earliest = Math.min(...years).toString();

    // Sanity guard: if earliest is more than 60 years before the album date,
    // something weird matched — trust the album date instead
    if (albumYear) {
      const diff = parseInt(albumYear) - parseInt(earliest);
      if (diff > 60) return albumYear;
    }

    return earliest;
  } catch {
    // Any network / parse error → fall back silently
    return albumYear;
  }
}

/* =========================================
   🎵 TRACK ENDPOINT
========================================= */

app.get("/api/track", async (req, res) => {
  const { genre, minYear, maxYear, usedUris } = req.query;

  // Parse used URIs from query so server can exclude them
  let used = new Set();
  try { if (usedUris) used = new Set(JSON.parse(usedUris)); } catch {}

  try {
    const genreFilter = (genre && genre !== "undefined") ? `genre:${genre} ` : "";
    const query = `${genreFilter}year:${minYear}-${maxYear}`;
    const randomOffset = Math.floor(Math.random() * 5) * 50;

    const response = await axios.get("https://api.spotify.com/v1/search", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { q: query, type: "track", limit: 50, offset: randomOffset }
    });

    let tracks = response.data.tracks?.items || [];
    if (!tracks.length) return res.status(404).json({ error: "No tracks found" });

    // Filter out already-used URIs to prevent repeats
    const unused = tracks.filter(t => !used.has(t.uri));
    const pool = unused.length >= 3 ? unused : tracks;

    // Prefer popular tracks
    const popular = pool.filter(t => t.popularity > 40);
    const candidates = popular.length >= 3 ? popular : pool;

    const randomTrack = candidates[Math.floor(Math.random() * candidates.length)];

    res.json({
      name: randomTrack.name,
      artist: randomTrack.artists[0].name,
      year: extractYear(randomTrack),
      uri: randomTrack.uri,
      cover: randomTrack.album.images[0]?.url
    });
  } catch (err) {
    console.error("Track error:", err.message);
    res.status(500).json({ error: "Spotify error" });
  }
});

/* =========================================
   🎵 PLAYLIST ENDPOINT
   For each track, we do a secondary search to find the earliest
   known release year — so remasters/re-releases get the original date.
========================================= */

app.get("/api/playlist", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  if (!match) return res.status(400).json({ error: "Invalid playlist URL" });

  const playlistId = match[1];

  try {
    let tracks = [];
    let offset = 0;
    let total = Infinity;

    while (tracks.length < total && tracks.length < 500) {
      const response = await axios.get(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { limit: 100, offset, fields: "total,items(track(name,artists,album,uri,popularity))" }
        }
      );

      const data = response.data;
      total = data.total;

      const valid = data.items
        .map(i => i.track)
        .filter(t => t && t.uri && t.album?.release_date);

      tracks.push(...valid);
      offset += 100;

      if (data.items.length < 100) break;
    }

    if (!tracks.length) return res.status(404).json({ error: "No playable tracks in playlist" });

    const playlistInfo = await axios.get(
      `https://api.spotify.com/v1/playlists/${playlistId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { fields: "name,images" }
      }
    );

    // ✅ FIX: For each track, look up the earliest known release year.
    // We process in batches of 10 to avoid hammering the API and stay
    // within rate limits, while still being fast enough for reasonable playlists.
    const BATCH = 10;
    const resolvedTracks = [];

    for (let i = 0; i < tracks.length; i += BATCH) {
      const batch = tracks.slice(i, i + BATCH);
      const resolved = await Promise.all(
        batch.map(async t => {
          const originalYear = await getOriginalYear(t);
          return {
            name: t.name,
            artist: t.artists[0].name,
            year: originalYear,             // ← earliest year found, not album date
            uri: t.uri,
            cover: t.album.images?.[0]?.url,
            popularity: t.popularity
          };
        })
      );
      resolvedTracks.push(...resolved);
    }

    // Filter out any tracks where year resolution failed completely
    const validResolved = resolvedTracks.filter(t => t.year && !isNaN(parseInt(t.year)));

    res.json({
      name: playlistInfo.data.name,
      image: playlistInfo.data.images?.[0]?.url,
      trackCount: validResolved.length,
      tracks: validResolved
    });
  } catch (err) {
    const spotifyError = err.response?.data;
    console.error("Playlist error:", spotifyError || err.message);
    res.status(500).json({
      error: "Could not load playlist",
      detail: spotifyError?.error?.message || err.message
    });
  }
});

/* =========================================
   🎮 MULTIPLAYER ROOMS
========================================= */

const games = {};

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create_game", ({ name }) => {
    const code = generateCode();
    games[code] = {
      host: socket.id,
      players: [{ id: socket.id, name, score: 0, timeline: [] }],
      currentPlayerIndex: 0,
      started: false,
      minYear: 1990,
      maxYear: 2024,
      isOnlineMode: false
    };
    socket.join(code);
    socket.emit("game_created", { code });
    io.to(code).emit("player_list", games[code].players);
  });

  socket.on("join_game", ({ code, name }) => {
    const game = games[code];
    if (!game) return socket.emit("error", { message: "Game not found" });
    const alreadyJoined = game.players.find(p => p.id === socket.id);
    if (alreadyJoined) return;
    if (game.started) return socket.emit("error", { message: "Game already started" });
    game.players.push({ id: socket.id, name, score: 0, timeline: [] });
    socket.join(code);
    socket.emit("joined_success", { code });
    io.to(code).emit("player_list", game.players);
  });

  socket.on("start_game", ({ code, minYear, maxYear, selectedGenres, playlistTracks, winGoal, timerSeconds, isOnlineMode }) => {
    const game = games[code];
    if (!game) return;

    game.started = true;
    game.selectedGenres = selectedGenres || [];
    game.playlistTracks = playlistTracks || null;
    game.usedUris = new Set();
    game.currentPlayerIndex = 0;
    game.winGoal = winGoal || 10;
    game.timerSeconds = timerSeconds || 0;
    game.isOnlineMode = isOnlineMode || false; // NEW

    if (playlistTracks && playlistTracks.length) {
      const years = playlistTracks.map(t => parseInt(t.year)).filter(y => !isNaN(y));
      game.minYear = Math.min(...years);
      game.maxYear = Math.max(...years);
    } else {
      game.minYear = parseInt(minYear);
      game.maxYear = parseInt(maxYear);
    }

    game.players = game.players.map(player => {
      const randomYear = Math.floor(Math.random() * (game.maxYear - game.minYear + 1)) + game.minYear;
      return {
        ...player,
        timeline: [{ id: Date.now() + Math.random(), year: randomYear, type: "fixed" }],
        score: 0,
        coins: 3
      };
    });

    io.to(code).emit("game_started", {
      players: game.players,
      currentPlayerIndex: game.currentPlayerIndex,
      selectedGenres: game.selectedGenres,
      minYear: game.minYear,
      maxYear: game.maxYear,
      playlistTracks: game.playlistTracks,
      winGoal: game.winGoal,
      timerSeconds: game.timerSeconds,
      isOnlineMode: game.isOnlineMode // NEW
    });
  });

  socket.on("update_timeline", ({ code, timeline, score }) => {
    const game = games[code];
    if (!game) return;
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    game.players[playerIndex].timeline = timeline;
    game.players[playerIndex].score = score;
  });

  socket.on("reveal_card", ({ code, result, cards }) => {
    const game = games[code];
    if (!game) return;
    socket.to(code).emit("card_revealed", { result, cards });
  });

  // NEW: Broadcast new card to all players in online mode
  socket.on("broadcast_card", ({ code, card }) => {
    const game = games[code];
    if (!game || !game.isOnlineMode) return;
    socket.to(code).emit("new_card_broadcast", { card });
  });

  // NEW: Sync playback across all devices in online mode
  socket.on("sync_playback", ({ code, uri, action }) => {
    const game = games[code];
    if (!game || !game.isOnlineMode) return;
    socket.to(code).emit("playback_sync", { uri, action });
  });

  socket.on("play_track", ({ code, uri }) => {
    const game = games[code];
    if (!game) return;
    io.to(game.host).emit("play_track", { uri });
  });

  socket.on("pause_track", ({ code }) => {
    const game = games[code];
    if (!game) return;
    io.to(game.host).emit("pause_track");
  });

  socket.on("player_state", ({ code, playing }) => {
    const game = games[code];
    if (!game) return;
    socket.to(code).emit("player_state", { playing });
  });

  socket.on("give_coin", ({ code }) => {
    const game = games[code];
    if (!game) return;
    const activePlayer = game.players[game.currentPlayerIndex];
    if (!activePlayer) return;
    activePlayer.coins = (activePlayer.coins || 0) + 1;
    io.to(code).emit("coins_updated_players", { players: game.players });
  });

  socket.on("place_coin", ({ code, insertIndex }) => {
    const game = games[code];
    if (!game) return;
    const player = game.players.find(p => p.id === socket.id);
    if (!player || player.coins <= 0) return;
    if (!game.coins) game.coins = {};
    game.coins[socket.id] = { playerId: socket.id, insertIndex };
    io.to(code).emit("coins_updated", { coins: game.coins });
  });

  socket.on("remove_coin", ({ code }) => {
    const game = games[code];
    if (!game || !game.coins) return;
    delete game.coins[socket.id];
    io.to(code).emit("coins_updated", { coins: game.coins });
  });

  socket.on("claim_recognition", ({ code }) => {
    const game = games[code];
    if (!game) return;
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    game.players[playerIndex].coins = (game.players[playerIndex].coins || 0) + 1;
    io.to(code).emit("coins_updated_players", { players: game.players });
  });

  socket.on("resolve_coins", ({ code, activeCorrect, activeInsertIndex, newCard }) => {
    const game = games[code];
    if (!game) return;

    const coins = game.coins || {};
    const activePlayer = game.players[game.currentPlayerIndex];
    const fixedCards = activePlayer.timeline
      .filter(c => c.type === "fixed")
      .sort((a, b) => a.year - b.year);

    const isSlotCorrect = (slotIndex) => {
      const cardYear = parseInt(newCard.year);
      const leftYear = slotIndex > 0 ? parseInt(fixedCards[slotIndex - 1]?.year ?? 0) : -Infinity;
      const rightYear = slotIndex < fixedCards.length ? parseInt(fixedCards[slotIndex]?.year ?? Infinity) : Infinity;
      return cardYear >= leftYear && cardYear <= rightYear;
    };

    Object.values(coins).forEach(({ playerId, insertIndex }) => {
      const coinPlayerIndex = game.players.findIndex(p => p.id === playerId);
      if (coinPlayerIndex === -1) return;
      const coinPlayer = game.players[coinPlayerIndex];
      const coinCorrect = isSlotCorrect(insertIndex);

      if (activeCorrect && coinCorrect) {
        // both right — coin returned (no change)
      } else if (activeCorrect && !coinCorrect) {
        game.players[coinPlayerIndex].coins = Math.max(0, (coinPlayer.coins || 0) - 1);
      } else if (!activeCorrect && coinCorrect) {
        const cardWithFixed = { ...newCard, type: "fixed" };
        const newTimeline = [...coinPlayer.timeline, cardWithFixed].sort((a, b) => a.year - b.year);
        game.players[coinPlayerIndex].timeline = newTimeline;
        game.players[coinPlayerIndex].score = (coinPlayer.score || 0) + 1;
      } else {
        game.players[coinPlayerIndex].coins = Math.max(0, (coinPlayer.coins || 0) - 1);
      }
    });

    game.coins = {};
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;

    io.to(code).emit("turn_changed", {
      players: game.players,
      currentPlayerIndex: game.currentPlayerIndex,
      selectedGenres: game.selectedGenres,
      minYear: game.minYear,
      maxYear: game.maxYear,
      playlistTracks: game.playlistTracks,
      usedUris: Array.from(game.usedUris),
      coins: {},
      isOnlineMode: game.isOnlineMode // NEW
    });
  });

  socket.on("mark_used", ({ code, uri }) => {
    const game = games[code];
    if (!game) return;
    game.usedUris.add(uri);
  });

  socket.on("next_turn", ({ code }) => {
    const game = games[code];
    if (!game) return;
    game.coins = {};
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    io.to(code).emit("turn_changed", {
      players: game.players,
      currentPlayerIndex: game.currentPlayerIndex,
      selectedGenres: game.selectedGenres,
      minYear: game.minYear,
      maxYear: game.maxYear,
      playlistTracks: game.playlistTracks,
      usedUris: Array.from(game.usedUris),
      coins: {},
      isOnlineMode: game.isOnlineMode // NEW
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// NEW: Handle playback requests from non-host players in online mode
socket.on("request_playback", ({ code, uri, action }) => {
  const game = games[code];
  if (!game || !game.isOnlineMode) return;
  
  // Forward the request to the host who controls the SDK
  io.to(game.host).emit("control_playback", { uri, action });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  await getSpotifyToken();
  console.log("Server running on port " + PORT);
});