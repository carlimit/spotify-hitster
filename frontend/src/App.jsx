import { useState, useEffect } from "react";
import Home from "./components/Home";
import Game from "./components/Game";
import Winner from "./components/Winner";
import SinglePlayerSetup from "./components/SinglePlayerSetup";
import SinglePlayerGame from "./components/SinglePlayerGame";
import "./App.css";
import { getLoginUrl } from "./spotify";
import { socket } from "./socket";

function App() {

  const [isHost, setIsHost] = useState(false);
  const [token, setToken] = useState(null);
  const [screen, setScreen] = useState("start");
  const [players, setPlayers] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [winner, setWinner] = useState(null);
  const [minYear, setMinYear] = useState(1990);
  const [maxYear, setMaxYear] = useState(2024);
  const [roomCode, setRoomCode] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState(null);
  const [winGoal, setWinGoal] = useState(10);
  const [timerSeconds, setTimerSeconds] = useState(0); // 0 = no timer
  // Singleplayer settings (reuse genre/year/playlist)
  const [singlePlayerGenres, setSinglePlayerGenres] = useState([]);
  const [singlePlayerMinYear, setSinglePlayerMinYear] = useState(1990);
  const [singlePlayerMaxYear, setSinglePlayerMaxYear] = useState(2024);
  const [singlePlayerPlaylist, setSinglePlayerPlaylist] = useState(null);

  // ============================================================
  // 🔐 Spotify Redirect — runs on load, handles OAuth callback
  // ============================================================

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) setToken(storedToken);

    const params = new URLSearchParams(window.location.search);
    const spotifyCode = params.get("code");

    if (spotifyCode) {
      const codeVerifier = localStorage.getItem("code_verifier");
      fetch(`/api/token?code=${spotifyCode}`, {
        headers: { "x-code-verifier": codeVerifier }
      })
        .then(res => res.json())
        .then(data => {
          localStorage.setItem("token", data.access_token);
          setToken(data.access_token);
          setIsHost(true);
          window.history.replaceState({}, document.title, "/");
          setScreen("lobby"); // ✅ go straight to lobby after login
        });
    }
  }, []);

  // ============================================================
  // 🟢 START SCREEN
  // ============================================================

  if (screen === "start") {
    return (
      <div className="container">
        <h1>Spotify Hitster</h1>
        <button onClick={() => {
          setIsHost(true);
          setScreen("host-login");
        }}>
          Host Game
        </button>
        <button
          style={{ marginTop: "15px", background: "#444" }}
          onClick={() => {
            setIsHost(false);
            setScreen("lobby");
          }}
        >
          Join Game
        </button>
        <button
          style={{ marginTop: "15px", background: "#1a472a" }}
          onClick={() => setScreen("singleplayer-setup")}
        >
          🎮 Solo Mode
        </button>
      </div>
    );
  }

  // ============================================================
  // 🟢 HOST LOGIN SCREEN
  // ============================================================

  if (screen === "host-login") {
    return (
      <div className="container">
        <h1>Spotify Hitster</h1>
        <h2>Login to host</h2>
        <button onClick={async () => {
          const url = await getLoginUrl();
          window.location.href = url;
        }}>
          Login with Spotify
        </button>
      </div>
    );
  }

  // ============================================================
  // 🟢 LOBBY
  // ============================================================

  if (screen === "lobby") {
    return (
      <Home
        setScreen={setScreen}
        setPlayers={setPlayers}
        selectedGenres={selectedGenres}
        setSelectedGenres={setSelectedGenres}
        minYear={minYear}
        setMinYear={setMinYear}
        maxYear={maxYear}
        setMaxYear={setMaxYear}
        isHost={isHost}
        setRoomCode={setRoomCode}
        setPlaylistTracks={setPlaylistTracks}
        winGoal={winGoal}
        setWinGoal={setWinGoal}
        timerSeconds={timerSeconds}
        setTimerSeconds={setTimerSeconds}
      />
    );
  }

  if (screen === "playing") {
    return (
      <Game
        players={players}
        setPlayers={setPlayers}
        selectedGenres={selectedGenres}
        minYear={minYear}
        maxYear={maxYear}
        roomCode={roomCode}
        setScreen={setScreen}
        setWinner={setWinner}
        playlistTracks={playlistTracks}
        winGoal={winGoal}
        timerSeconds={timerSeconds}
      />
    );
  }

  if (screen === "singleplayer-setup") {
    return (
      <SinglePlayerSetup
        setScreen={setScreen}
        genres={singlePlayerGenres}
        setGenres={setSinglePlayerGenres}
        minYear={singlePlayerMinYear}
        setMinYear={setSinglePlayerMinYear}
        maxYear={singlePlayerMaxYear}
        setMaxYear={setSinglePlayerMaxYear}
        playlist={singlePlayerPlaylist}
        setPlaylist={setSinglePlayerPlaylist}
        timerSeconds={timerSeconds}
        setTimerSeconds={setTimerSeconds}
      />
    );
  }

  if (screen === "singleplayer") {
    return (
      <SinglePlayerGame
        setScreen={setScreen}
        selectedGenres={singlePlayerGenres}
        minYear={singlePlayerMinYear}
        maxYear={singlePlayerMaxYear}
        playlistTracks={singlePlayerPlaylist}
        timerSeconds={timerSeconds}
      />
    );
  }

  if (screen === "winner") {
    return (
      <Winner
        winner={winner}
        onBack={() => setScreen("start")}
      />
    );
  }

  return null;
}

export default App;