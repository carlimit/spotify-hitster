import { useState, useEffect } from "react";
import { Reorder } from "framer-motion";
import axios from "axios";

function Game({
  players,
  setPlayers,
  setGamePhase,
  setWinner,
  selectedGenres,
  minYear,
  maxYear
}) {
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [cards, setCards] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNextButton, setShowNextButton] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Spotify
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const currentPlayer = players[currentPlayerIndex];

  // -----------------------------
  // 🎵 Spotify SDK Loader
  // -----------------------------
  useEffect(() => {
    const token = localStorage.getItem("token");

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      window.onSpotifyWebPlaybackSDKReady = () => {
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

        spotifyPlayer.addListener("initialization_error", e =>
          console.error(e)
        );
        spotifyPlayer.addListener("authentication_error", e =>
          console.error(e)
        );
        spotifyPlayer.addListener("account_error", e =>
          console.error(e)
        );
        spotifyPlayer.addListener("playback_error", e =>
          console.error(e)
        );

        spotifyPlayer.connect();
        setPlayer(spotifyPlayer);
      };
    };
  }, []);

  // -----------------------------
  // 🎵 Play / Pause
  // -----------------------------
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
  // 🎲 Generate Card
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
  // 🔄 Load New Card
  // -----------------------------
  useEffect(() => {
    const loadCard = async () => {
      setLoading(true);
      const newCard = await generateCard();
      setCards([...currentPlayer.timeline, newCard]);
      setLoading(false);
    };

    loadCard();
  }, [currentPlayerIndex]);

  // -----------------------------
  // 🧠 Reveal Logic
  // -----------------------------
  const handleReveal = () => {
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

    const updatedPlayers = [...players];

    updatedPlayers[currentPlayerIndex] = {
      ...currentPlayer,
      timeline: cards.map(c =>
        c.id === newCard.id ? { ...c, type: "fixed" } : c
      ),
      score: currentPlayer.score + 1
    };

    setTimeout(() => {
      setPlayers(updatedPlayers);

      if (updatedPlayers[currentPlayerIndex].score >= 10) {
        setWinner(updatedPlayers[currentPlayerIndex]);
        setGamePhase("winner");
        return;
      }

      setShowNextButton(true);
    }, 600);
  };

  const nextTurn = () => {
    const nextIndex = (currentPlayerIndex + 1) % players.length;
    setCurrentPlayerIndex(nextIndex);
    setRevealed(false);
    setResult(null);
    setShowNextButton(false);
    setIsPlaying(false);
  };

  if (loading) {
    return (
      <div className="container">
        <h2>Loading song...</h2>
      </div>
    );
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
            drag={!revealed}
            dragListener={card.type === "new"}
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
                  <img src={card.cover} className="cover-large" />
                  <div className="revealed-year">{card.year}</div>
                  <strong>{card.artist}</strong>
                  <div className="song-title">{card.name}</div>
                </div>
              </div>
            ) : (
              <div className="card-front fixed">
                <div className="year">{card.year}</div>
              </div>
            )}
          </Reorder.Item>
        ))}
      </Reorder.Group>

      {!revealed && (
        <button className="reveal-button" onClick={handleReveal}>
          Reveal
        </button>
      )}

      {showNextButton && (
        <button onClick={nextTurn}>Next Player</button>
      )}
    </div>
  );
}

export default Game;
