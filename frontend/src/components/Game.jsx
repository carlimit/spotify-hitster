import { useState, useEffect } from "react";
import { motion, Reorder } from "framer-motion";
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
  const [draggedCardIndex, setDraggedCardIndex] = useState(null);

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
  // 🎯 Handle Drag End - Reorder cards
  // -----------------------------
  const handleDragEnd = (event, info) => {
    const newCardIndex = cards.findIndex(c => c.type === "new");
    const draggedCard = cards[newCardIndex];
    
    // Get positions of all cards
    const cardElements = document.querySelectorAll('.card');
    const positions = Array.from(cardElements).map(el => {
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    
    // Find where to insert based on drag position
    const dragY = event.clientY || (event.touches && event.touches[0].clientY);
    let insertIndex = 0;
    
    for (let i = 0; i < positions.length; i++) {
      if (dragY > positions[i]) {
        insertIndex = i + 1;
      }
    }
    
    // Don't count the dragged card itself
    if (insertIndex > newCardIndex) {
      insertIndex--;
    }
    
    // Reorder
    const newCards = [...cards];
    newCards.splice(newCardIndex, 1);
    newCards.splice(insertIndex, 0, draggedCard);
    setCards(newCards);
    setDraggedCardIndex(null);
  };

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

    <div className="timeline">
      {cards.map((card, index) => (
        <motion.div
          key={card.id}
          className={`card ${
            card.type === "new" && revealed ? "card-expanded" : ""
          }`}
          drag={!revealed && card.type === "new" ? "y" : false}
          dragElastic={0}
          dragMomentum={false}
          onDragStart={() => setDraggedCardIndex(index)}
          onDragEnd={handleDragEnd}
          whileDrag={{ 
            scale: 1.05,
            boxShadow: "0 20px 60px rgba(29, 185, 84, 0.6)",
            zIndex: 1000
          }}
          style={{
            zIndex: draggedCardIndex === index ? 1000 : (card.type === "new" && revealed ? 100 : 1),
            cursor: card.type === "new" && !revealed ? "grab" : "default"
          }}
          animate={draggedCardIndex !== index ? { y: 0 } : {}}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
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
                <img src={card.cover} className="cover-large" alt={card.name} />
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
        </motion.div>
      ))}
    </div>

    <div className="action-container">
  {!revealed && (
    <button onClick={handleReveal}>
      Reveal
    </button>
  )}

  {showNextButton && (
    <button onClick={nextTurn}>
      Next Player
    </button>
  )}
</div>
  </div>
);
}

export default Game;