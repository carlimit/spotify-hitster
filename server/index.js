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
    new URLSearchParams({
      grant_type: "client_credentials"
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.SPOTIFY_CLIENT_ID +
              ":" +
              process.env.SPOTIFY_CLIENT_SECRET
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
    const randomOffset = Math.floor(Math.random() * 500);

    const response = await axios.get(
      "https://api.spotify.com/v1/search",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          q: `genre:${genre} year:${minYear}-${maxYear}`,
          type: "track",
          limit: 50,
          offset: randomOffset
        }
      }
    );

    let tracks = response.data.tracks.items;

    if (!tracks.length)
      return res.status(404).json({ error: "No tracks found" });

    const randomTrack =
      tracks[Math.floor(Math.random() * tracks.length)];

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
          timeline: []
        }
      ],
      currentPlayerIndex: 0,
      started: false
    };

    socket.join(code);
    socket.emit("game_created", { code });
    io.to(code).emit("player_list", games[code].players);
  });

  /* JOIN GAME */
  socket.on("join_game", ({ code, name }) => {
  const game = games[code];
  if (!game) return;

  const alreadyJoined = game.players.find(p => p.id === socket.id);
  if (alreadyJoined) return;

  if (game.started) return;

  game.players.push({
    id: socket.id,
    name,
    score: 0,
    timeline: []
  });

  socket.join(code);

  socket.emit("joined_success", { code }); // 🔥 DAS FEHLT
  io.to(code).emit("player_list", game.players);
});


  /* START GAME */
  socket.on("start_game", ({ code }) => {
  const game = games[code];
  if (!game) return;

  game.started = true;

  io.to(code).emit("game_started", {
    players: game.players,
    currentPlayerIndex: game.currentPlayerIndex
  });

  const activePlayer = game.players[game.currentPlayerIndex];

  io.to(activePlayer.id).emit("your_turn");
});



  /* NEXT TURN */
  socket.on("next_turn", ({ code }) => {
    const game = games[code];
    if (!game) return;

    game.currentPlayerIndex =
      (game.currentPlayerIndex + 1) % game.players.length;

    io.to(code).emit("turn_changed", {
      currentPlayerIndex: game.currentPlayerIndex
    });

    const activePlayer = game.players[game.currentPlayerIndex];
    io.to(activePlayer.id).emit("your_turn");
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

/* ========================================= */

server.listen(3001, async () => {
  await getSpotifyToken();
  console.log("Server running on port 3001");
});
