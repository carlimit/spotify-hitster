import { useState, useEffect } from "react";
import Home from "./components/Home";
import Game from "./components/Game";
import Winner from "./components/Winner";
import "./App.css";
import { getLoginUrl } from "./spotify";

function App() {
  const [token, setToken] = useState(null);

  useEffect(() => {
  const hash = window.location.hash;
  let token = window.localStorage.getItem("token");

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
        window.location.href = "/";
      });
  }
}, []);


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
}, []);


  const [gamePhase, setGamePhase] = useState("home");
  const [players, setPlayers] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [winner, setWinner] = useState(null);

if (!token) {
  return (
    <div className="container">
      <h1>Spotify Hitster</h1>
      <a href={loginUrl}>
        <button>Login with Spotify</button>
      </a>
    </div>
  );
}


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
        />
      )}

      {gamePhase === "winner" && (
        <Winner winner={winner} setGamePhase={setGamePhase} />
      )}
    </div>
  );
}

export default App;
