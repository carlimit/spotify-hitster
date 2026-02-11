import { useState, useEffect } from "react";
import Home from "./components/Home";
import Game from "./components/Game";
import Winner from "./components/Winner";
import "./App.css";
import { loginUrl } from "./spotify";

function App() {
  const [token, setToken] = useState(null);

  useEffect(() => {
  const hash = window.location.hash;
  let token = window.localStorage.getItem("token");

  if (!token && hash) {
    const accessToken = hash
      .substring(1)
      .split("&")
      .find(elem => elem.startsWith("access_token"))
      .split("=")[1];

    window.location.hash = "";
    window.localStorage.setItem("token", accessToken);
    setToken(accessToken);
  } else {
    setToken(token);
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
