import { useState, useEffect } from "react";
import { Reorder } from "framer-motion";
import axios from "axios";
import { socket } from "../socket";

function Game({
  selectedGenres,
  minYear,
  maxYear
}) {
  const [players, setPlayers] = useState([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [cards, setCards] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [gameCode, setGameCode] = useState(null);

  // Spotify
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const currentPlayer = players[currentPlayerIndex];

  // -----------------------------
  // 🎧 Spotify Setup
  // -----------------------------
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!window.Spotify) return;

    const spotifyPlayer = new window.Spotify.Player({
      name: "Spotify Hitster Player",
      getOAuthToken: cb => cb(token),
      volume: 0.5
    });

    spotifyPlayer.addListener("ready", ({ device_id }) => {
      setDeviceId(device_id);
    });

    spotifyPlayer.addListener("player_state_changed", state => {
      if (!state) return;
      setIsPlaying(!state.paused);
    });

    spotifyPlayer.connect();
    setPlayer(spotifyPlayer);
  }, []);

  const handlePlayPause = async (uri) => {
    const token = localStorage.getItem("token");
    if (!deviceId || !player) return;

    if (!isPlaying) {
      await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        {
          method: "PUT",
          body: JSON.stringify({ uris: [uri] }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        }
      );
    } else {
      player.togglePlay();
    }
  };

  // -----------------------------
  // 🎮 Socket Events
  // -----------------------------
  useEffect(() => {
    socket.on("game_started", ({ players, currentPlayerIndex }) => {
      setPlayers(players);
      setCurrentPlayerIndex(currentPlayerIndex);
      setCards(players[currentPlayerIndex].timeline);
    });

    socket.on("turn_changed", ({ currentPlayerIndex }) => {
      setCurrentPlayerIndex(currentPlayerIndex);
      setIsMyTurn(false);
      setRevealed(false);
      setShowNextButton(false);
      setResult(null);
      setCards(players[currentPlayerIndex]?.timeline || []);
    });

    socket.on("your_turn", async () => {
      setIsMyTurn(true);
      setLoading(true);

      const newCard = await generateCard();

      setCards([...currentPlayer.timeline, newCard]);
      setLoading(false);
    });

    return () => {
      socket.off("game_started");
      socket.off("turn_changed");
      socket.off("your_turn");
    };
  }, [players]);

  // -----------------------------
  // 🎲 Generate Card (nur Client sichtbar)
  // -----------------------------
  const generateCard = async () => {
    const randomGenre =
      selectedGenres[Math.floor(Math.random() * selectedGenres.length)];

    const res = await axios.get(
      `/api/track?genre=${randomGenre}&minYear=${minYear}&maxYear=${maxYear}`
    );

    return {
      id: Date.now(),
      year: parseInt(res.data.year),
      name: res.data.name,
      artist: res.data.artist,
      uri: res.data.uri,
      cover: res.data.cover,
      type: "new"
    };
  };

  // -----------------------------
  // 🧠 Reveal Logic (nur lokal)
  // -----------------------------
  const handleReveal = () => {
    if (!isMyTurn) return;

    setRevealed(true);

    const newCardIndex = cards.findIndex(c => c.type === "new");
    const left = cards[newCardIndex - 1];
    const right = cards[newCardIndex + 1];
    const newCard = cards[newCardIndex];

    let correct = true;

    if (left && left.year > newCard.year) correct = false;
    if (right && right.year < newCard.year) correct = false;

    if (!correct) {
      setResult("wrong");
      setTimeout(() => setShowNextButton(true), 600);
      return;
    }

    setResult("correct");
    setTimeout(() => setShowNextButton(true), 600);
  };

  const nextTurn = () => {
    socket.emit("next_turn");
  };

  if (!currentPlayer) {
    return <div className="container">Waiting...</div>;
  }

  return (
    <div className="container">
      <h2>{currentPlayer.name}'s Turn</h2>
      <h3>Score: {currentPlayer.score}</h3>

      <Reorder.Group
        axis="y"
        values={cards}
        onReorder={setCards}
        className="timeline"
      >
        {cards.map(card => (
          <Reorder.Item
            key={card.id}
            value={card}
            dragListener={card.type === "new" && !revealed && isMyTurn}
            dragElastic={0}
            dragMomentum={false}
            whileDrag={{ scale: 1.02 }}
            transition={{ type: "tween", duration: 0.15 }}
            layout="position"
            className={`card ${
              card.type === "new" && revealed ? "card-expanded" : ""
            }`}
          >
            {card.type === "new" ? (
              <div
                className={`card-inner 
                  ${revealed ? "flipped" : ""} 
                  ${result === "correct" ? "result-correct" : ""}
                  ${result === "wrong" ? "result-wrong" : ""}
                `}
              >
                <div className="card-front new">
                  <div
                    className="play-button"
                    onClick={() => handlePlayPause(card.uri)}
                  >
                    {isPlaying ? "⏸" : "▶"}
                  </div>
                  <div>Drag to place</div>
                </div>

                <div className="card-back">
                  <img src={card.cover} className="cover-large" alt="" />
                  <div className="revealed-year">{card.year}</div>
                  <strong>{card.artist}</strong>
                  <div className="song-title">{card.name}</div>
                </div>
              </div>
            ) : (
              <div className="card-front fixed">
                <div>{card.year}</div>
              </div>
            )}
          </Reorder.Item>
        ))}
      </Reorder.Group>

      <div className="action-container">
        {isMyTurn && !revealed && (
          <button onClick={handleReveal}>Reveal</button>
        )}

        {isMyTurn && showNextButton && (
          <button onClick={nextTurn}>Next Player</button>
        )}
      </div>
    </div>
  );
}

export default Game;
