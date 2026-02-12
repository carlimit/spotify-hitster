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
  // Auto-refresh every 50 minutes (token expires in 60)
  setTimeout(getSpotifyToken, 50 * 60 * 1000);
}

/* =========================================
   🎵 TRACK ENDPOINT
========================================= */

app.get("/api/track", async (req, res) => {
  const { genre, minYear, maxYear } = req.query;
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

    const popular = tracks.filter(t => t.popularity > 40);
    const pool = popular.length >= 5 ? popular : tracks;
    const randomTrack = pool[Math.floor(Math.random() * pool.length)];

    res.json({
      name: randomTrack.name,
      artist: randomTrack.artists[0].name,
      year: randomTrack.album.release_date.substring(0, 4),
      uri: randomTrack.uri,
      cover: randomTrack.album.images[0]?.url
    });
  } catch (err) {
    res.status(500).json({ error: "Spotify error" });
  }
});

/* =========================================
   🎵 PLAYLIST ENDPOINT
   Fetches all tracks from a playlist URL/ID
========================================= */

app.get("/api/playlist", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  // Extract playlist ID from any Spotify URL format
  // e.g. https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  if (!match) return res.status(400).json({ error: "Invalid playlist URL" });

  const playlistId = match[1];

  try {
    // Fetch up to 500 tracks (Spotify max per request is 100, so paginate)
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

      // Filter out null tracks (local files etc)
      const valid = data.items
        .map(i => i.track)
        .filter(t => t && t.uri && t.album?.release_date);

      tracks.push(...valid);
      offset += 100;

      if (data.items.length < 100) break;
    }

    if (!tracks.length) return res.status(404).json({ error: "No playable tracks in playlist" });

    // Return playlist name + track count for UI feedback
    const playlistInfo = await axios.get(
      `https://api.spotify.com/v1/playlists/${playlistId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { fields: "name,images" }
      }
    );

    res.json({
      name: playlistInfo.data.name,
      image: playlistInfo.data.images?.[0]?.url,
      trackCount: tracks.length,
      tracks: tracks.map(t => ({
        name: t.name,
        artist: t.artists[0].name,
        year: t.album.release_date.substring(0, 4),
        uri: t.uri,
        cover: t.album.images?.[0]?.url,
        popularity: t.popularity
      }))
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

  /* CREATE GAME */
  socket.on("create_game", ({ name }) => {
    const code = generateCode();

    games[code] = {
      host: socket.id,
      players: [
        {
          id: socket.id,
          name,
          score: 0,
          timeline: []  // will be set on start_game
        }
      ],
      currentPlayerIndex: 0,
      started: false,
      minYear: 1990,
      maxYear: 2024
    };

    socket.join(code);
    socket.emit("game_created", { code });
    io.to(code).emit("player_list", games[code].players);
  });

  /* JOIN GAME */
  socket.on("join_game", ({ code, name }) => {
    const game = games[code];
    if (!game) return socket.emit("error", { message: "Game not found" });

    const alreadyJoined = game.players.find(p => p.id === socket.id);
    if (alreadyJoined) return;
    if (game.started) return socket.emit("error", { message: "Game already started" });

    game.players.push({
      id: socket.id,
      name,
      score: 0,
      timeline: []
    });

    socket.join(code);
    socket.emit("joined_success", { code });
    io.to(code).emit("player_list", game.players);
  });

  /* START GAME */
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
      const randomYear =
        Math.floor(Math.random() * (game.maxYear - game.minYear + 1)) + game.minYear;
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


  /* UPDATE TIMELINE */
  socket.on("update_timeline", ({ code, timeline, score }) => {
    const game = games[code];
    if (!game) return;

    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;

    game.players[playerIndex].timeline = timeline;
    game.players[playerIndex].score = score;
  });

  /* PLAY TRACK — any player can trigger, host's device plays it */
  socket.on("play_track", ({ code, uri }) => {
    const game = games[code];
    if (!game) return;
    io.to(game.host).emit("play_track", { uri });
  });

  /* PAUSE TRACK — any player can trigger */
  socket.on("pause_track", ({ code }) => {
    const game = games[code];
    if (!game) return;
    io.to(game.host).emit("pause_track");
  });

  /* PLAYER STATE — host broadcasts play/pause state to all */
  socket.on("player_state", ({ code, playing }) => {
    const game = games[code];
    if (!game) return;
    // Broadcast to everyone in the room except the host
    socket.to(code).emit("player_state", { playing });
  });

  /* GIVE COIN — next player rewards active player for guessing correctly */
  socket.on("give_coin", ({ code }) => {
    const game = games[code];
    if (!game) return;
    const activePlayer = game.players[game.currentPlayerIndex];
    if (!activePlayer) return;
    activePlayer.coins = (activePlayer.coins || 0) + 1;
    io.to(code).emit("coins_updated_players", { players: game.players });
  });

  /* PLACE COIN — spectator places a coin between two cards */
  socket.on("place_coin", ({ code, insertIndex }) => {
    const game = games[code];
    if (!game) return;
    const player = game.players.find(p => p.id === socket.id);
    if (!player || player.coins <= 0) return;

    // Store coin: who placed it and where
    if (!game.coins) game.coins = {};
    game.coins[socket.id] = { playerId: socket.id, insertIndex };

    io.to(code).emit("coins_updated", { coins: game.coins });
  });

  /* REMOVE COIN — spectator picks their coin back up */
  socket.on("remove_coin", ({ code }) => {
    const game = games[code];
    if (!game || !game.coins) return;
    delete game.coins[socket.id];
    io.to(code).emit("coins_updated", { coins: game.coins });
  });

  /* CLAIM RECOGNITION — spectator taps "I know this song" after reveal */
  socket.on("claim_recognition", ({ code }) => {
    const game = games[code];
    if (!game) return;
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    game.players[playerIndex].coins = (game.players[playerIndex].coins || 0) + 1;
    // Just give them the coin immediately — honor system
    io.to(code).emit("coins_updated_players", { players: game.players });
  });

  /* RESOLVE COINS — called by active player when pressing Next Turn
     activeCorrect: bool — was the active player's placement correct?
     activeInsertIndex: number — where the active player placed the card
     newCard: the card object that was played
  */
  socket.on("resolve_coins", ({ code, activeCorrect, activeInsertIndex, newCard }) => {
    const game = games[code];
    if (!game) return;

    const coins = game.coins || {};

    // Build the timeline WITHOUT the new card to get the fixed cards in order
    // activeInsertIndex is where the new card was dropped among all cards
    // We need to figure out the year boundaries for each slot

    // Get fixed cards only (sorted by year), these are the reference points
    // The active player's timeline (before this turn) is their existing fixed cards
    const activePlayer = game.players[game.currentPlayerIndex];
    const fixedCards = activePlayer.timeline
      .filter(c => c.type === "fixed")
      .sort((a, b) => a.year - b.year);

    // For a slot index i (0 = before all, fixedCards.length = after all):
    // correct if newCard.year >= fixedCards[i-1].year (or i=0)
    //        AND newCard.year <= fixedCards[i].year (or i=fixedCards.length)
    const isSlotCorrect = (slotIndex) => {
      const cardYear = parseInt(newCard.year);
      const leftYear = slotIndex > 0 ? parseInt(fixedCards[slotIndex - 1]?.year ?? 0) : -Infinity;
      const rightYear = slotIndex < fixedCards.length ? parseInt(fixedCards[slotIndex]?.year ?? Infinity) : Infinity;
      return cardYear >= leftYear && cardYear <= rightYear;
    };

    // Evaluate each coin
    Object.values(coins).forEach(({ playerId, insertIndex }) => {
      const coinPlayerIndex = game.players.findIndex(p => p.id === playerId);
      if (coinPlayerIndex === -1) return;
      const coinPlayer = game.players[coinPlayerIndex];

      // Coin is correct if the year fits in that slot
      const coinCorrect = isSlotCorrect(insertIndex);

      if (activeCorrect && coinCorrect) {
        // Both right → coin returned (no change to coins)
      } else if (activeCorrect && !coinCorrect) {
        // Active right, coin wrong → lose coin
        game.players[coinPlayerIndex].coins = Math.max(0, (coinPlayer.coins || 0) - 1);
      } else if (!activeCorrect && coinCorrect) {
        // Active wrong, coin right → coin returned + win the card
        const cardWithFixed = { ...newCard, type: "fixed" };
        const newTimeline = [...coinPlayer.timeline, cardWithFixed]
          .sort((a, b) => a.year - b.year);
        game.players[coinPlayerIndex].timeline = newTimeline;
        game.players[coinPlayerIndex].score = (coinPlayer.score || 0) + 1;
      } else {
        // Both wrong → lose coin
        game.players[coinPlayerIndex].coins = Math.max(0, (coinPlayer.coins || 0) - 1);
      }
    });

    // Clear coins for next round
    game.coins = {};

    // Advance turn
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

  /* MARK TRACK USED — called when a card is dealt to prevent repeats */
  socket.on("mark_used", ({ code, uri }) => {
    const game = games[code];
    if (!game) return;
    game.usedUris.add(uri);
  });

  /* NEXT TURN — now only used as fallback, coins use resolve_coins */
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

/* ========================================= */

const PORT = process.env.PORT || 3001;

server.listen(PORT, async () => {
  await getSpotifyToken();
  console.log("Server running on port " + PORT);
});