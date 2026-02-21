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
========================================= */
function extractYear(track) {
  const date = track.album?.release_date || "";
  return date.substring(0, 4);
}

/* =========================================
   🎵 ORIGINAL YEAR LOOKUP
========================================= */
async function getOriginalYear(track) {
  const trackName = track.name;
  const artistName = track.artists?.[0]?.name || "";
  const albumYear = track.album?.release_date?.substring(0, 4) || "";

  try {
    const query = `track:"${trackName}" artist:"${artistName}"`;
    const response = await axios.get("https://api.spotify.com/v1/search", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { q: query, type: "track", limit: 50 }
    });

    const items = response.data.tracks?.items || [];
    if (!items.length) return albumYear;

    const artistLower = artistName.toLowerCase();
    const sameArtist = items.filter(t =>
      t.artists?.some(a =>
        a.name.toLowerCase().includes(artistLower) ||
        artistLower.includes(a.name.toLowerCase())
      )
    );

    const candidates = sameArtist.length > 0 ? sameArtist : items;

    const years = candidates
      .map(t => parseInt(t.album?.release_date?.substring(0, 4) || ""))
      .filter(y => !isNaN(y) && y > 1900 && y <= new Date().getFullYear());

    if (!years.length) return albumYear;

    const earliest = Math.min(...years).toString();

    if (albumYear) {
      const diff = parseInt(albumYear) - parseInt(earliest);
      if (diff > 60) return albumYear;
    }

    return earliest;
  } catch {
    return albumYear;
  }
}

/* =========================================
   🎵 TRACK ENDPOINT
========================================= */

app.get("/api/track", async (req, res) => {
  const { genre, minYear, maxYear, usedUris } = req.query;

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

    const unused = tracks.filter(t => !used.has(t.uri));
    const pool = unused.length >= 3 ? unused : tracks;

    const popular = pool.filter(t => t.popularity > 40);
    const candidates = popular.length >= 3 ? popular : pool;

    const randomTrack = candidates[Math.floor(Math.random() * candidates.length)];

    res.json({
      name: randomTrack.name,
      artist: randomTrack.artists.map(a => a.name).join(", "),
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
   🔍 SEARCH PLAYLISTS ENDPOINT
   Searches Spotify for playlists by name.
========================================= */

app.get("/api/search-playlists", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "No query provided", playlists: [] });

  const doSearch = async (token) => {
    const response = await axios.get("https://api.spotify.com/v1/search", {
      headers: { Authorization: `Bearer ${token}` },
      params: { q, type: "playlist", limit: 20 }
    });
    const items = response.data.playlists?.items || [];
    return items
      .filter(p => p && p.id && p.tracks?.total > 0)
      .map(p => ({
        id: p.id,
        name: p.name,
        owner: p.owner?.display_name || "Unknown",
        tracks: p.tracks?.total || 0,
        image: p.images?.[0]?.url || null,
        url: `https://open.spotify.com/playlist/${p.id}`
      }));
  };

  try {
    if (!accessToken) await getSpotifyToken();
    const playlists = await doSearch(accessToken);
    res.json({ playlists });
  } catch (err) {
    // If 401, refresh token and retry once
    if (err.response?.status === 401) {
      try {
        await getSpotifyToken();
        const playlists = await doSearch(accessToken);
        return res.json({ playlists });
      } catch (retryErr) {
        console.error("Search retry failed:", retryErr.response?.data || retryErr.message);
        return res.status(500).json({ error: "Search failed", playlists: [] });
      }
    }
    console.error("Search playlists error:", err.response?.data || err.message);
    res.status(500).json({ error: "Search failed", playlists: [] });
  }
});

/* =========================================
   🎵 PLAYLIST ENDPOINT
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

    const BATCH = 10;
    const resolvedTracks = [];

    for (let i = 0; i < tracks.length; i += BATCH) {
      const batch = tracks.slice(i, i + BATCH);
      const resolved = await Promise.all(
        batch.map(async t => {
          const originalYear = await getOriginalYear(t);
          return {
            name: t.name,
            artist: t.artists.map(a => a.name).join(", "),
            year: originalYear,
            uri: t.uri,
            cover: t.album.images?.[0]?.url,
            popularity: t.popularity
          };
        })
      );
      resolvedTracks.push(...resolved);
    }

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
   🎮 MULTIPLAYER ROOMS (Local pass-and-play)
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
      maxYear: 2024
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

  // Rejoin after disconnect (phone screen off, network drop, etc.)
  // Finds the player by name, remaps their old socket ID to the new one,
  // and sends them the full current game state so they can recover.
  socket.on("rejoin_game", ({ code, name }) => {
    const game = games[code];
    if (!game) return socket.emit("error", { message: "Game not found" });

    const player = game.players.find(p => p.name === name);
    if (!player) return socket.emit("error", { message: "Player not found" });

    const oldId = player.id;
    player.id = socket.id;

    // Update host reference if this was the host
    if (game.host === oldId) {
      game.host = socket.id;
    }

    socket.join(code);

    // Send full game state so client can recover
    socket.emit("rejoin_success", {
      code,
      players: game.players,
      currentPlayerIndex: game.currentPlayerIndex,
      selectedGenres: game.selectedGenres || [],
      minYear: game.minYear,
      maxYear: game.maxYear,
      playlistTracks: game.playlistTracks || null,
      usedUris: Array.from(game.usedUris || []),
      winGoal: game.winGoal || 10,
      timerSeconds: game.timerSeconds || 0,
      coins: game.coins || {},
      started: game.started,
    });

    console.log(`🔄 Player "${name}" rejoined game ${code} (${oldId} → ${socket.id})`);
  });

  socket.on("start_game", ({ code, minYear, maxYear, selectedGenres, playlistTracks, winGoal, timerSeconds }) => {
    const game = games[code];
    if (!game) return;

    game.started = true;
    game.selectedGenres = selectedGenres || [];
    game.playlistTracks = playlistTracks || null;
    game.usedUris = new Set();
    game.currentPlayerIndex = 0;
    game.winGoal = winGoal || 10;
    game.timerSeconds = timerSeconds || 0;

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
      timerSeconds: game.timerSeconds
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
      coins: {}
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
      coins: {}
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  await getSpotifyToken();
  console.log("Server running on port " + PORT);
});