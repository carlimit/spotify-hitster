import { useState, useEffect } from "react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import axios from "axios";
import { socket } from "../socket";

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
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistInfo, setPlaylistInfo] = useState(null); // { name, trackCount, tracks }
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState(null);

  // ============================================================
  // SOCKET LISTENERS
  // ============================================================

  useEffect(() => {
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
      if (playlistTracks) setPlaylistTracks(playlistTracks);
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
    socket.emit("create_game", { name: playerName });
  };

  const joinGame = () => {
    if (!playerName.trim() || !inputCode.trim()) return;
    socket.emit("join_game", { code: inputCode.toUpperCase(), name: playerName });
  };

  const loadPlaylist = async () => {
    if (!playlistUrl.trim()) return;
    setPlaylistLoading(true);
    setPlaylistError(null);
    setPlaylistInfo(null);
    try {
      const res = await axios.get(`/api/playlist?url=${encodeURIComponent(playlistUrl)}`);
      setPlaylistInfo(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setPlaylistError(detail
        ? `Spotify error: ${detail}`
        : "Couldn't load playlist. Make sure it's a public Spotify playlist URL.");
    } finally {
      setPlaylistLoading(false);
    }
  };

  const clearPlaylist = () => {
    setPlaylistInfo(null);
    setPlaylistUrl("");
    setPlaylistError(null);
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
                <h2>{t.orUsePlaylist}</h2>
                {!playlistInfo ? (
                  <>
                    <input type="text" placeholder={t.pastePlaceholder} value={playlistUrl}
                      onChange={e => setPlaylistUrl(e.target.value)}
                      onKeyPress={e => e.key === "Enter" && loadPlaylist()}
                    />
                    <button onClick={loadPlaylist} disabled={playlistLoading || !playlistUrl.trim()} style={{ background: "#444" }}>
                      {playlistLoading ? t.loading : t.loadPlaylist}
                    </button>
                    {playlistError && <p style={{ color: "#ff5555", fontSize: "13px", marginTop: "8px" }}>{playlistError}</p>}
                  </>
                ) : (
                  <div className="playlist-info">
                    <div className="playlist-name">🎵 {playlistInfo.name}</div>
                    <div className="playlist-count">{playlistInfo.trackCount} tracks</div>
                    <button onClick={clearPlaylist} style={{ background: "#444", marginTop: "8px" }}>{t.remove}</button>
                  </div>
                )}
              </div>

              <div className="home-section">
                <h2>{t.yearRange}</h2>
                <Slider range min={1960} max={2024} value={[minYear, maxYear]}
                  onChange={value => { setMinYear(value[0]); setMaxYear(value[1]); }} />
                <div style={{ marginTop: "10px", fontWeight: "bold" }}>{minYear} – {maxYear}</div>
              </div>

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