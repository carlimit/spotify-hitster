import { useState, useEffect } from "react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import { socket } from "../socket";

function Home({
  setGamePhase,
  players,
  setPlayers,
  selectedGenres,
  setSelectedGenres,
  minYear,
  setMinYear,
  maxYear,
  setMaxYear
}) {
  const [playerName, setPlayerName] = useState("");
  const [mode, setMode] = useState("host"); // host | join
  const [gameCode, setGameCode] = useState("");
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);

  // ===============================
  // 🎮 SOCKET LISTENERS
  // ===============================
  useEffect(() => {

    socket.on("player_list", (players) => {
      setLobbyPlayers(players);
    });

    socket.on("game_created", ({ code }) => {
      setGameCode(code);
      setIsHost(true);
      setHasJoined(true);
    });

    socket.on("game_started", ({ players }) => {
      setPlayers(players);
      setGamePhase("playing");
    });

    return () => {
      socket.off("player_list");
      socket.off("game_created");
      socket.off("game_started");
    };

  }, []);

  // ===============================
  // 🎮 CREATE GAME
  // ===============================
  const createGame = () => {
    if (!playerName.trim()) return;
    if (hasJoined) return;

    socket.emit("create_game", { name: playerName });
  };

  // ===============================
  // 🎮 JOIN GAME
  // ===============================
  const joinGame = () => {
    if (!playerName.trim() || !gameCode.trim()) return;
    if (hasJoined) return;

    socket.emit("join_game", {
      code: gameCode,
      name: playerName
    });

    setHasJoined(true);
  };

  // ===============================
  // 🎮 START GAME
  // ===============================
  const startGame = () => {
    if (!isHost) return;
    socket.emit("start_game", { code: gameCode });
  };

  // ===============================
  // 🎛 GENRE TOGGLE
  // ===============================
  const toggleGenre = genre => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  // ===============================
  // 🎨 UI
  // ===============================
  return (
    <div className="container">
      <h1>Hitster Game</h1>

      {/* MODE SWITCH */}
      {!hasJoined && (
        <div className="home-section">
          <h2>Mode</h2>

          <button
            onClick={() => setMode("host")}
            style={{
              background: mode === "host" ? "#1DB954" : "#444",
              marginRight: "10px"
            }}
          >
            Host
          </button>

          <button
            onClick={() => setMode("join")}
            style={{
              background: mode === "join" ? "#1DB954" : "#444"
            }}
          >
            Join
          </button>

          <div style={{ marginTop: "15px" }}>
            <input
              type="text"
              placeholder="Your name"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
            />
          </div>

          {mode === "host" && (
            <button onClick={createGame}>
              Create Game
            </button>
          )}

          {mode === "join" && (
            <>
              <input
                type="text"
                placeholder="Enter Game Code"
                value={gameCode}
                onChange={e =>
                  setGameCode(e.target.value.toUpperCase())
                }
                style={{ marginTop: "10px" }}
              />
              <button onClick={joinGame}>
                Join Game
              </button>
            </>
          )}
        </div>
      )}

      {/* LOBBY */}
      {hasJoined && (
        <div className="home-section">

          <h3>Game Code: {gameCode}</h3>

          <div className="player-list">
            {lobbyPlayers.map((p, i) => (
              <p key={i}>{p.name}</p>
            ))}
          </div>

          {isHost && (
            <button onClick={startGame}>
              Start Game
            </button>
          )}

        </div>
      )}

      {/* SETTINGS NUR HOST */}
      {isHost && hasJoined && (
        <>
          <div className="home-section">
            <h2>Genres</h2>
            <div className="genre-buttons">
              {["pop", "rock", "hiphop", "edm", "jazz", "metal", "house"].map(
                genre => (
                  <button
                    key={genre}
                    onClick={() => toggleGenre(genre)}
                    style={{
                      background: selectedGenres.includes(genre)
                        ? "#1DB954"
                        : "#444",
                      margin: "5px"
                    }}
                  >
                    {genre}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="home-section">
            <h2>Year Range</h2>

            <Slider
              range
              min={1960}
              max={2024}
              value={[minYear, maxYear]}
              onChange={value => {
                setMinYear(value[0]);
                setMaxYear(value[1]);
              }}
            />

            <div style={{ marginTop: "10px", fontWeight: "bold" }}>
              {minYear} – {maxYear}
            </div>
          </div>
        </>
      )}

    </div>
  );
}

export default Home;
