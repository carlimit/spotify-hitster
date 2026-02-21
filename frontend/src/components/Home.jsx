import { useState, useEffect } from "react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import axios from "axios";
import { socket } from "../socket";
import PlaylistPicker from "./PlaylistPicker";

function Home({ t, lang,
  setScreen,
  setPlayers,
  selectedGenres,
  setSelectedGenres,
  minYear,
  setMinYear,
  maxYear,
  setMaxYear,
  isHost,
  setRoomCode,
  setPlaylistTracks,
  winGoal,
  setWinGoal,
  timerSeconds,
  setTimerSeconds
}) {
  const [playerName, setPlayerName] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [localRoomCode, setLocalRoomCode] = useState(null);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [hasJoined, setHasJoined] = useState(false);

  // Playlist mode
  const [playlistInfo, setPlaylistInfo] = useState(null);
  const [musicMode, setMusicMode] = useState("random"); // "random" | "playlist"
  const currentYear = new Date().getFullYear();

  // ============================================================
  // SOCKET LISTENERS
  // ============================================================

  useEffect(() => {
    // Ensure socket is connected on mount (may have dropped after OAuth redirect)
    if (!socket.connected) socket.connect();

    socket.on("player_list", players => {
      setLobbyPlayers(players);
    });

    socket.on("game_created", ({ code }) => {
      setLocalRoomCode(code);
      setRoomCode(code);
      setHasJoined(true);
    });

    socket.on("joined_success", ({ code }) => {
      setLocalRoomCode(code);
      setRoomCode(code);
      setHasJoined(true);
    });

    socket.on("game_started", ({ players, selectedGenres: genres, minYear: min, maxYear: max, playlistTracks }) => {
      setPlayers(players);
      if (genres && genres.length) setSelectedGenres(genres);
      if (min) setMinYear(Number(min));
      if (max) setMaxYear(Number(max));
      setPlaylistTracks(playlistTracks || null);
      setScreen("playing");
    });

    return () => {
      socket.off("player_list");
      socket.off("game_created");
      socket.off("joined_success");
      socket.off("game_started");
    };
  }, []);

  // ============================================================
  // ACTIONS
  // ============================================================

  const createGame = () => {
    if (!playerName.trim()) return;
    if (!socket.connected) {
      socket.connect();
      socket.once("connect", () => socket.emit("create_game", { name: playerName }));
    } else {
      socket.emit("create_game", { name: playerName });
    }
  };

  const joinGame = () => {
    if (!playerName.trim() || !inputCode.trim()) return;
    if (!socket.connected) {
      socket.connect();
      socket.once("connect", () => socket.emit("join_game", { code: inputCode.toUpperCase(), name: playerName }));
    } else {
      socket.emit("join_game", { code: inputCode.toUpperCase(), name: playerName });
    }
  };

  const startGame = () => {
    if (!localRoomCode) return;
    socket.emit("start_game", {
      code: localRoomCode,
      minYear,
      maxYear,
      selectedGenres,
      playlistTracks: playlistInfo?.tracks || null,
      winGoal,
      timerSeconds
    });
  };

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
      <h1>{t.lobby}</h1>

      {!hasJoined && (
        <div className="home-section">
          <input type="text" placeholder={lang === "de" ? "Dein Name" : "Your name"} value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            onKeyPress={e => e.key === "Enter" && (isHost ? createGame() : joinGame())}
          />
          {isHost ? (
            <button onClick={createGame}>{lang === "de" ? "Spiel erstellen" : "Create Game"}</button>
          ) : (
            <>
              <input type="text" placeholder={lang === "de" ? "Spielcode eingeben" : "Enter Game Code"}
                value={inputCode} onChange={e => setInputCode(e.target.value.toUpperCase())}
              />
              <button onClick={joinGame}>{t.joinGame}</button>
            </>
          )}
        </div>
      )}

      {hasJoined && (
        <>
          <div className="home-section">
            <h2>{t.gameCode}</h2>
            <div className="room-code">{localRoomCode}</div>
          </div>

          <div className="home-section">
            <h2>{t.players}</h2>
            <div className="player-list">
              {lobbyPlayers.map((p, i) => <p key={p.id || i}>{p.name}</p>)}
            </div>
          </div>

          {isHost && (
            <>
              {/* ── Mode Switch ── */}
              <div className="home-section">
                <div style={{
                  display: "flex",
                  background: "#1a1a1a",
                  borderRadius: 12,
                  padding: 3,
                  gap: 3,
                }}>
                  <button
                    onClick={() => { setMusicMode("random"); setPlaylistInfo(null); }}
                    style={{
                      flex: 1,
                      padding: "10px 8px",
                      fontSize: 14,
                      fontWeight: musicMode === "random" ? 700 : 500,
                      background: musicMode === "random" ? "#1DB954" : "transparent",
                      color: musicMode === "random" ? "#fff" : "#888",
                      border: "none",
                      borderRadius: 10,
                      cursor: "pointer",
                      boxShadow: "none",
                      minWidth: "unset",
                      margin: 0,
                      transition: "all 0.2s ease",
                    }}
                  >
                    🎲 {lang === "de" ? "Zufällig" : "Random"}
                  </button>
                  <button
                    onClick={() => setMusicMode("playlist")}
                    style={{
                      flex: 1,
                      padding: "10px 8px",
                      fontSize: 14,
                      fontWeight: musicMode === "playlist" ? 700 : 500,
                      background: musicMode === "playlist" ? "#1DB954" : "transparent",
                      color: musicMode === "playlist" ? "#fff" : "#888",
                      border: "none",
                      borderRadius: 10,
                      cursor: "pointer",
                      boxShadow: "none",
                      minWidth: "unset",
                      margin: 0,
                      transition: "all 0.2s ease",
                    }}
                  >
                    🎵 Playlist
                  </button>
                </div>
              </div>

              {/* ── Random mode: genres + year ── */}
              {musicMode === "random" && (
                <>
                  <div className="home-section">
                    <h2>{t.genres}</h2>
                    <div className="genre-buttons">
                      {["pop", "rock", "hiphop", "edm", "jazz", "metal", "house"].map(genre => (
                        <button key={genre} onClick={() => toggleGenre(genre)}
                          style={{ background: selectedGenres.includes(genre) ? "#1DB954" : "#444" }}>
                          {genre}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="home-section">
                    <h2>{t.yearRange}</h2>
                    <Slider range min={1920} max={currentYear} value={[minYear, maxYear]}
                      onChange={value => { setMinYear(value[0]); setMaxYear(value[1]); }} />
                    <div style={{ marginTop: "10px", fontWeight: "bold" }}>{minYear} – {maxYear}</div>
                  </div>
                </>
              )}

              {/* ── Playlist mode: editions / search / link ── */}
              {musicMode === "playlist" && (
                <div className="home-section">
                  <PlaylistPicker
                    t={t}
                    lang={lang}
                    playlist={playlistInfo}
                    setPlaylist={setPlaylistInfo}
                  />
                </div>
              )}

              <div className="home-section">
                <h2>{t.cardsToWin}</h2>
                <div className="number-picker">
                  <button onClick={() => setWinGoal(g => Math.max(3, g - 1))}>−</button>
                  <span>{winGoal}</span>
                  <button onClick={() => setWinGoal(g => Math.min(20, g + 1))}>+</button>
                </div>
              </div>

              <div className="home-section">
                <h2>{t.timer}</h2>
                <div className="timer-options">
                  {[0, 15, 30, 45, 60].map(s => (
                    <button key={s} onClick={() => setTimerSeconds(s)}
                      style={{ background: timerSeconds === s ? "#1DB954" : "#444" }}>
                      {s === 0 ? t.timerOff : `${s}s`}
                    </button>
                  ))}
                </div>
              </div>

              <button className="start-button" onClick={startGame}>{t.startGame}</button>
            </>
          )}

          {!isHost && (
            <div className="home-section">
              <p style={{ color: "#b3b3b3", textAlign: "center" }}>{t.waitingForHost}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Home;