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
  isHost,
  setRoomCode // 🔥 NEW - passed from App
}) {
  const [playerName, setPlayerName] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [localRoomCode, setLocalRoomCode] = useState(null);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [hasJoined, setHasJoined] = useState(false);

  // ============================================================
  // SOCKET LISTENERS
  // ============================================================

  useEffect(() => {
    socket.on("player_list", players => {
      setLobbyPlayers(players);
    });

    socket.on("game_created", ({ code }) => {
      setLocalRoomCode(code);
      setRoomCode(code); // 🔥 Save to App
      setHasJoined(true);
    });

    socket.on("joined_success", ({ code }) => {
      setLocalRoomCode(code);
      setRoomCode(code); // 🔥 Save to App
      setHasJoined(true);
    });

    socket.on("game_started", ({ players }) => {
      setPlayers(players);
      setGamePhase("playing");
    });

    return () => {
      socket.off("player_list");
      socket.off("game_created");
      socket.off("joined_success");
      socket.off("game_started");
    };
  }, []);

  // ============================================================
  // CREATE GAME (HOST)
  // ============================================================

  const createGame = () => {
    if (!playerName.trim()) return;
    socket.emit("create_game", { name: playerName });
  };

  // ============================================================
  // JOIN GAME
  // ============================================================

  const joinGame = () => {
    if (!playerName.trim() || !inputCode.trim()) return;
    socket.emit("join_game", { code: inputCode, name: playerName });
  };

  // ============================================================
  // START GAME (HOST ONLY)
  // ============================================================

  const startGame = () => {
    if (!localRoomCode) return;
    socket.emit("start_game", { code: localRoomCode, minYear, maxYear });
  };

  // ============================================================
  // GENRE TOGGLE
  // ============================================================

  const toggleGenre = genre => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="container">
      <h1>Lobby</h1>

      {/* ===================== JOIN / CREATE ===================== */}

      {!hasJoined && (
        <div className="home-section">
          <input
            type="text"
            placeholder="Your name"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            onKeyPress={e => e.key === "Enter" && (isHost ? createGame() : joinGame())}
          />

          {isHost ? (
            <button onClick={createGame}>Create Game</button>
          ) : (
            <>
              <input
                type="text"
                placeholder="Enter Game Code"
                value={inputCode}
                onChange={e => setInputCode(e.target.value.toUpperCase())}
              />
              <button onClick={joinGame}>Join Game</button>
            </>
          )}
        </div>
      )}

      {/* ===================== LOBBY ===================== */}

      {hasJoined && (
        <>
          <div className="home-section">
            <h2>Game Code</h2>
            <div className="room-code">{localRoomCode}</div>
          </div>

          <div className="home-section">
            <h2>Players</h2>
            <div className="player-list">
              {lobbyPlayers.map((p, i) => (
                <p key={p.id || i}>{p.name}</p>
              ))}
            </div>
          </div>

          {isHost && (
            <>
              <div className="home-section">
                <h2>Genres</h2>
                <div className="genre-buttons">
                  {["pop", "rock", "hiphop", "edm", "jazz", "metal", "house"].map(genre => (
                    <button
                      key={genre}
                      onClick={() => toggleGenre(genre)}
                      style={{
                        background: selectedGenres.includes(genre) ? "#1DB954" : "#444"
                      }}
                    >
                      {genre}
                    </button>
                  ))}
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

              <button className="start-button" onClick={startGame}>
                Start Game
              </button>
            </>
          )}

          {!isHost && (
            <div className="home-section">
              <p style={{ color: "#b3b3b3", textAlign: "center" }}>
                Waiting for host to start the game...
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Home;