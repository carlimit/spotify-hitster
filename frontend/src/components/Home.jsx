import { useState, useEffect } from "react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import { socket } from "../socket";

function Home({
  setGamePhase,
  setPlayers,
  selectedGenres,
  setSelectedGenres,
  minYear,
  setMinYear,
  maxYear,
  setMaxYear,
  isHost
}) {
  const [playerName, setPlayerName] = useState("");
  const [gameCode, setGameCode] = useState("");
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [hasJoined, setHasJoined] = useState(false);

  // -----------------------------
  // SOCKET LISTENERS
  // -----------------------------
  useEffect(() => {
    socket.on("player_list", players => {
      setLobbyPlayers(players);
    });

    socket.on("game_created", ({ code }) => {
      setGameCode(code);
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

  // -----------------------------
  // CREATE GAME (HOST ONLY)
  // -----------------------------
  const createGame = () => {
    if (!playerName.trim()) return;
    socket.emit("create_game", { name: playerName });
  };

  // -----------------------------
  // JOIN GAME
  // -----------------------------
  const joinGame = () => {
    if (!playerName.trim() || !gameCode.trim()) return;
    socket.emit("join_game", { code: gameCode, name: playerName });
    setHasJoined(true);
  };

  // -----------------------------
  // START GAME (HOST ONLY)
  // -----------------------------
  const startGame = () => {
    socket.emit("start_game", { code: gameCode });
  };

  const toggleGenre = genre => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  return (
    <div className="container">
      <h1>Lobby</h1>

      {/* NAME INPUT */}
      {!hasJoined && (
        <>
          <input
            type="text"
            placeholder="Your name"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
          />

          {isHost ? (
            <button onClick={createGame}>
              Create Game
            </button>
          ) : (
            <>
              <input
                type="text"
                placeholder="Enter Game Code"
                value={gameCode}
                onChange={e =>
                  setGameCode(e.target.value.toUpperCase())
                }
              />
              <button onClick={joinGame}>
                Join Game
              </button>
            </>
          )}
        </>
      )}

      {/* LOBBY */}
      {hasJoined && (
        <>
          <h2>Game Code: {gameCode}</h2>

          <div className="player-list">
            {lobbyPlayers.map((p, i) => (
              <p key={i}>{p.name}</p>
            ))}
          </div>

          {isHost && (
            <>
              <h2>Settings</h2>

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

              <button onClick={startGame}>
                Start Game
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Home;
