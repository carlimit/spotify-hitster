const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

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
      players: [{ id: socket.id, name }]
    };

    socket.join(code);

    socket.emit("game_created", { code });
  });

  socket.on("join_game", ({ code, name }) => {
    if (!games[code]) {
      socket.emit("error_message", "Game not found");
      return;
    }

    games[code].players.push({ id: socket.id, name });
    socket.join(code);

    io.to(code).emit("player_list", games[code].players);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(3001, () => {
  console.log("Server running on port 3001");
});
