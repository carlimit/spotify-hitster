import { useState, useEffect } from "react";
import Home from "./components/Home";
import Game from "./components/Game";
import Winner from "./components/Winner";
import "./App.css";
import { getLoginUrl } from "./spotify";

function App() {
  const [token, setToken] = useState(null);
  const [gamePhase, setGamePhase] = useState("home");
  const [players, setPlayers] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [winner, setWinner] = useState(null);

  // 🔥 PKCE Token Exchange
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code) {
      const codeVerifier = localStorage.getItem("code_verifier");

      fetch(`/api/token?code=${code}`, {
        headers: {
          "x-code-verifier": codeVerifier
        }
      })
        .then(res => res.json())
        .then(data => {
          localStorage.setItem("token", data.access_token);
          setToken(data.access_token);
          window.history.replaceState({}, document.title, "/");
        });
    } else {
      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        setToken(storedToken);
      }
    }
  }, []);

  // 🔥 LOGIN SCREEN
  if (!token) {
    return (
      <div className="container">
        <h1>Spotify Hitster</h1>
        <button
          onClick={async () => {
            const url = await getLoginUrl();
            window.location.href = url;
          }}
        >
          Login with Spotify
        </button>
      </div>
    );
  }

  // 🔥 NORMAL APP
  return (
    <div>
      {gamePhase === "home" && (
        <Home
          setGamePhase={setGamePhase}
          players={players}
          setPlayers={setPlayers}
          selectedGenres={selectedGenres}
          setSelectedGenres={setSelectedGenres}
        />
      )}

      {gamePhase === "playing" && (
        <Game
          players={players}
          setPlayers={setPlayers}
          setGamePhase={setGamePhase}
          selectedGenres={selectedGenres}
          setWinner={setWinner}
          minYear={minYear}
          maxYear={maxYear}
        />
      )}

      {gamePhase === "winner" && (
        <Winner winner={winner} setGamePhase={setGamePhase} />
      )}
    </div>
  );
}

export default App;
