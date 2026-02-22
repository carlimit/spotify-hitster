const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

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
        Authorization: "Basic " + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET).toString("base64")
      }
    }
  );
  accessToken = response.data.access_token;
  console.log("✅ Spotify token refreshed");
  setTimeout(getSpotifyToken, 50 * 60 * 1000);
}

function extractYear(track) {
  return (track.album?.release_date || "").substring(0, 4);
}

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
    const sameArtist = items.filter(t => t.artists?.some(a => a.name.toLowerCase().includes(artistLower) || artistLower.includes(a.name.toLowerCase())));
    const candidates = sameArtist.length > 0 ? sameArtist : items;
    const years = candidates.map(t => parseInt(t.album?.release_date?.substring(0, 4) || "")).filter(y => !isNaN(y) && y > 1900 && y <= new Date().getFullYear());
    if (!years.length) return albumYear;
    const earliest = Math.min(...years).toString();
    if (albumYear && parseInt(albumYear) - parseInt(earliest) > 60) return albumYear;
    return earliest;
  } catch { return albumYear; }
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
    res.json({ name: randomTrack.name, artist: randomTrack.artists.map(a => a.name).join(", "), year: extractYear(randomTrack), uri: randomTrack.uri, cover: randomTrack.album.images[0]?.url });
  } catch (err) { console.error("Track error:", err.message); res.status(500).json({ error: "Spotify error" }); }
});

/* =========================================
   🔍 SEARCH PLAYLISTS
========================================= */

app.get("/api/search-playlists", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "No query provided", playlists: [] });
  const doSearch = async (token) => {
    const response = await axios.get("https://api.spotify.com/v1/search", { headers: { Authorization: `Bearer ${token}` }, params: { q, type: "playlist", limit: 20 } });
    return (response.data.playlists?.items || []).filter(p => p && p.id && p.tracks?.total > 0).map(p => ({ id: p.id, name: p.name, owner: p.owner?.display_name || "Unknown", tracks: p.tracks?.total || 0, image: p.images?.[0]?.url || null, url: `https://open.spotify.com/playlist/${p.id}` }));
  };
  try {
    if (!accessToken) await getSpotifyToken();
    res.json({ playlists: await doSearch(accessToken) });
  } catch (err) {
    if (err.response?.status === 401) { try { await getSpotifyToken(); return res.json({ playlists: await doSearch(accessToken) }); } catch { return res.status(500).json({ error: "Search failed", playlists: [] }); } }
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
    let tracks = [], offset = 0, total = Infinity;
    while (tracks.length < total && tracks.length < 500) {
      const response = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, { headers: { Authorization: `Bearer ${accessToken}` }, params: { limit: 100, offset, fields: "total,items(track(name,artists,album,uri,popularity))" } });
      const data = response.data; total = data.total;
      tracks.push(...data.items.map(i => i.track).filter(t => t && t.uri && t.album?.release_date));
      offset += 100;
      if (data.items.length < 100) break;
    }
    if (!tracks.length) return res.status(404).json({ error: "No playable tracks in playlist" });
    const playlistInfo = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, { headers: { Authorization: `Bearer ${accessToken}` }, params: { fields: "name,images" } });
    const BATCH = 10; const resolvedTracks = [];
    for (let i = 0; i < tracks.length; i += BATCH) {
      const batch = tracks.slice(i, i + BATCH);
      resolvedTracks.push(...await Promise.all(batch.map(async t => ({ name: t.name, artist: t.artists.map(a => a.name).join(", "), year: await getOriginalYear(t), uri: t.uri, cover: t.album.images?.[0]?.url, popularity: t.popularity }))));
    }
    res.json({ name: playlistInfo.data.name, image: playlistInfo.data.images?.[0]?.url, trackCount: resolvedTracks.filter(t => t.year && !isNaN(parseInt(t.year))).length, tracks: resolvedTracks.filter(t => t.year && !isNaN(parseInt(t.year))) });
  } catch (err) { res.status(500).json({ error: "Could not load playlist", detail: err.response?.data?.error?.message || err.message }); }
});

/* =========================================
   🎮 MULTIPLAYER ROOMS
========================================= */

const games = {};
function generateCode() { return Math.random().toString(36).substring(2, 6).toUpperCase(); }

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create_game", ({ name }) => {
    const code = generateCode();
    games[code] = { host: socket.id, players: [{ id: socket.id, name, score: 0, timeline: [] }], currentPlayerIndex: 0, started: false, minYear: 1990, maxYear: 2024 };
    socket.join(code);
    socket.emit("game_created", { code });
    io.to(code).emit("player_list", games[code].players);
  });

  socket.on("join_game", ({ code, name }) => {
    const game = games[code];
    if (!game) return socket.emit("error", { message: "Game not found" });
    if (game.players.find(p => p.id === socket.id)) return;
    if (game.started) return socket.emit("error", { message: "Game already started" });
    game.players.push({ id: socket.id, name, score: 0, timeline: [] });
    socket.join(code);
    socket.emit("joined_success", { code });
    io.to(code).emit("player_list", game.players);
  });

  socket.on("rejoin_game", ({ code, name }) => {
    const game = games[code];
    if (!game) return socket.emit("error", { message: "Game not found" });
    const player = game.players.find(p => p.name === name);
    if (!player) return socket.emit("error", { message: "Player not found" });
    const oldId = player.id;
    player.id = socket.id;
    if (game.host === oldId) game.host = socket.id;
    socket.join(code);
    socket.emit("rejoin_success", { code, players: game.players, currentPlayerIndex: game.currentPlayerIndex, selectedGenres: game.selectedGenres || [], minYear: game.minYear, maxYear: game.maxYear, playlistTracks: game.playlistTracks || null, usedUris: Array.from(game.usedUris || []), winGoal: game.winGoal || 10, timerSeconds: game.timerSeconds || 0, coins: game.coins || {}, started: game.started });
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
    game.coins = {};
    game.currentCardFinalIndex = undefined;
    game.recognitionClaimed = false;
    game.cardRevealed = false;
    if (playlistTracks?.length) {
      const years = playlistTracks.map(t => parseInt(t.year)).filter(y => !isNaN(y));
      game.minYear = Math.min(...years); game.maxYear = Math.max(...years);
    } else { game.minYear = parseInt(minYear); game.maxYear = parseInt(maxYear); }
    game.players = game.players.map(player => {
      const randomYear = Math.floor(Math.random() * (game.maxYear - game.minYear + 1)) + game.minYear;
      return { ...player, timeline: [{ id: Date.now() + Math.random(), year: randomYear, type: "fixed" }], score: 0, coins: 3 };
    });
    io.to(code).emit("game_started", { players: game.players, currentPlayerIndex: game.currentPlayerIndex, selectedGenres: game.selectedGenres, minYear: game.minYear, maxYear: game.maxYear, playlistTracks: game.playlistTracks, winGoal: game.winGoal, timerSeconds: game.timerSeconds });
  });

  socket.on("update_timeline", ({ code, timeline, score }) => {
    const game = games[code];
    if (!game) return;
    const idx = game.players.findIndex(p => p.id === socket.id);
    if (idx === -1) return;
    game.players[idx].timeline = timeline;
    game.players[idx].score = score;
  });

  socket.on("reveal_card", ({ code, result, cards }) => {
    const game = games[code];
    if (!game) return;
    // Lock recognition: no new claims after this point
    game.cardRevealed = true;
    // Clear all pending coins
    game.coins = {};
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

  socket.on("new_card_loaded", ({ code, cards }) => {
    const game = games[code];
    if (!game) return;
    socket.to(code).emit("new_card_loaded", { cards });
  });

  socket.on("drag_move", ({ code, insertIndex }) => {
    const game = games[code];
    if (!game) return;
    socket.to(code).emit("drag_move", { insertIndex });
  });

  socket.on("drag_end", ({ code, cards }) => {
    const game = games[code];
    if (!game) return;
    socket.to(code).emit("drag_end", { cards });
  });

  socket.on("card_moved", ({ code, finalInsertIndex }) => {
    const game = games[code];
    if (!game || !game.coins) return;
    game.currentCardFinalIndex = finalInsertIndex;
    const refunded = [];
    Object.entries(game.coins).forEach(([playerId, { insertIndex }]) => {
      if (insertIndex === finalInsertIndex) { delete game.coins[playerId]; refunded.push(playerId); }
    });
    refunded.forEach(pid => io.to(pid).emit("coin_refunded"));
    if (refunded.length > 0) io.to(code).emit("coins_updated", { coins: game.coins });
  });

  socket.on("place_coin", ({ code, insertIndex }) => {
    const game = games[code];
    if (!game) return;
    const player = game.players.find(p => p.id === socket.id);
    if (!player || player.coins <= 0) return;
    if (!game.coins) game.coins = {};
    if (game.currentCardFinalIndex !== undefined && insertIndex === game.currentCardFinalIndex) { io.to(socket.id).emit("coin_refunded"); return; }
    game.coins[socket.id] = { playerId: socket.id, insertIndex };
    io.to(code).emit("coins_updated", { coins: game.coins });
  });

  socket.on("remove_coin", ({ code }) => {
    const game = games[code];
    if (!game || !game.coins) return;
    delete game.coins[socket.id];
    io.to(code).emit("coins_updated", { coins: game.coins });
  });

  /**
   * claim_recognition
   * Only valid BEFORE the card is revealed (game.cardRevealed === false).
   * First claimer wins; subsequent claims are silently ignored.
   * Coin is awarded immediately so the active player can see it reflected
   * in the turn_changed players array.
   */
  socket.on("claim_recognition", ({ code }) => {
    const game = games[code];
    if (!game) return;
    // Reject if card is already revealed or someone already claimed this turn
    if (game.cardRevealed || game.recognitionClaimed) return;
    game.recognitionClaimed = true;

    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;

    const player = game.players[playerIndex];
    game.players[playerIndex].coins = (player.coins || 0) + 1;

    // Broadcast who claimed it (everyone sees the name)
    io.to(code).emit("recognition_claimed", { playerName: player.name });
    // Push updated coin totals
    io.to(code).emit("coins_updated_players", { players: game.players });
    console.log(`🎤 "${player.name}" recognised the song in room ${code}`);
  });

  socket.on("resolve_coins", ({ code, activeCorrect, activeInsertIndex, newCard }) => {
    const game = games[code];
    if (!game) return;
    const coins = game.coins || {};
    const activePlayer = game.players[game.currentPlayerIndex];
    const fixedCards = activePlayer.timeline.filter(c => c.type === "fixed").sort((a, b) => a.year - b.year);
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
      if (insertIndex === activeInsertIndex) return; // exact same slot — refund, no change
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
    game.currentCardFinalIndex = undefined;
    game.recognitionClaimed = false;
    game.cardRevealed = false;
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    io.to(code).emit("turn_changed", { players: game.players, currentPlayerIndex: game.currentPlayerIndex, selectedGenres: game.selectedGenres, minYear: game.minYear, maxYear: game.maxYear, playlistTracks: game.playlistTracks, usedUris: Array.from(game.usedUris), coins: {} });
  });

  socket.on("mark_used", ({ code, uri }) => { const game = games[code]; if (game) game.usedUris.add(uri); });

  socket.on("next_turn", ({ code }) => {
    const game = games[code];
    if (!game) return;
    game.coins = {}; game.currentCardFinalIndex = undefined;
    game.recognitionClaimed = false; game.cardRevealed = false;
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    io.to(code).emit("turn_changed", { players: game.players, currentPlayerIndex: game.currentPlayerIndex, selectedGenres: game.selectedGenres, minYear: game.minYear, maxYear: game.maxYear, playlistTracks: game.playlistTracks, usedUris: Array.from(game.usedUris), coins: {} });
  });

  socket.on("disconnect", () => { console.log("User disconnected:", socket.id); });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => { await getSpotifyToken(); console.log("Server running on port " + PORT); });