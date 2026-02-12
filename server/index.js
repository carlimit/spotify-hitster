const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

const games = {};

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // CREATE GAME
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

  // JOIN GAME
  socket.on("join_game", ({ code, name }) => {
    if (!games[code]) return;

    games[code].players.push({
      id: socket.id,
      name,
      score: 0,
      timeline: []
    });

    socket.join(code);
    io.to(code).emit("player_list", games[code].players);
  });

  // START GAME
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

  // NEXT TURN
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

server.listen(3001, () => {
  console.log("Server running on port 3001");
});
