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
    console.error("Playlist error:", err.response?.data || err.message);
    res.status(500).json({ error: "Could not load playlist" });
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
  socket.on("start_game", ({ code, minYear, maxYear, selectedGenres, playlistTracks }) => {
    const game = games[code];
    if (!game) return;

    game.started = true;
    game.minYear = parseInt(minYear);
    game.maxYear = parseInt(maxYear);
    game.selectedGenres = selectedGenres || [];
    game.playlistTracks = playlistTracks || null;
    game.currentPlayerIndex = 0;

    game.players = game.players.map(player => {
      const randomYear =
        Math.floor(Math.random() * (game.maxYear - game.minYear + 1)) + game.minYear;
      return {
        ...player,
        timeline: [{ id: Date.now() + Math.random(), year: randomYear, type: "fixed" }],
        score: 0
      };
    });

    io.to(code).emit("game_started", {
      players: game.players,
      currentPlayerIndex: game.currentPlayerIndex,
      selectedGenres: game.selectedGenres,
      minYear: game.minYear,
      maxYear: game.maxYear,
      playlistTracks: game.playlistTracks
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
    // Forward to host only
    io.to(game.host).emit("play_track", { uri });
  });

  /* NEXT TURN */
  socket.on("next_turn", ({ code }) => {
    const game = games[code];
    if (!game) return;

    game.currentPlayerIndex =
      (game.currentPlayerIndex + 1) % game.players.length;

    io.to(code).emit("turn_changed", {
      players: game.players,
      currentPlayerIndex: game.currentPlayerIndex,
      selectedGenres: game.selectedGenres,
      minYear: game.minYear,
      maxYear: game.maxYear,
      playlistTracks: game.playlistTracks
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