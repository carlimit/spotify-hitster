import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { socket } from "../socket";

function Game({
  players,
  setPlayers,
  selectedGenres,
  minYear,
  maxYear,
  isHost
}) {
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [cards, setCards] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [draggedCardIndex, setDraggedCardIndex] = useState(null);

  const currentPlayer = players[currentPlayerIndex];

  // ============================================================
  // 🔁 SYNC CARDS WHEN PLAYERS CHANGE
  // ============================================================

  useEffect(() => {
    if (players.length > 0 && players[currentPlayerIndex]) {
      setCards(players[currentPlayerIndex].timeline || []);
    }
  }, [players, currentPlayerIndex]);

  // ============================================================
  // 🎮 SOCKET EVENTS
  // ============================================================

  useEffect(() => {

    socket.on("game_started", ({ players, currentPlayerIndex }) => {
      setPlayers(players);
      setCurrentPlayerIndex(currentPlayerIndex);
      
      // Check if it's my turn when game starts
      const mySocketId = socket.id;
      const isMyTurnNow = players[currentPlayerIndex]?.id === mySocketId;
      setIsMyTurn(isMyTurnNow);
      
      // Load card if it's my turn
      if (isMyTurnNow) {
        loadNewCard(players[currentPlayerIndex]);
      }
    });

    socket.on("turn_changed", ({ players, currentPlayerIndex }) => {
      setPlayers(players);
      setCurrentPlayerIndex(currentPlayerIndex);
      setRevealed(false);
      setShowNextButton(false);
      setResult(null);
      
      // Check if it's my turn
      const mySocketId = socket.id;
      const isMyTurnNow = players[currentPlayerIndex]?.id === mySocketId;
      setIsMyTurn(isMyTurnNow);
      
      // Load new card if it's my turn
      if (isMyTurnNow) {
        loadNewCard(players[currentPlayerIndex]);
      }
    });

    socket.on("your_turn", () => {
      console.log("🔥 I RECEIVED YOUR TURN");
    });

    return () => {
      socket.off("game_started");
      socket.off("turn_changed");
      socket.off("your_turn");
    };

  }, []);

  // ============================================================
  // 📥 LOAD NEW CARD WHEN IT'S MY TURN
  // ============================================================

  const loadNewCard = async (player) => {
    setLoading(true);
    try {
      const newCard = await generateCard();
      const updatedTimeline = [...player.timeline, newCard];
      setCards(updatedTimeline);
    } catch (error) {
      console.error("Error loading card:", error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 🎲 GENERATE CARD
  // ============================================================

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

  // ============================================================
  // 🎯 Handle Drag End - Reorder cards
  // ============================================================

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

  // ============================================================
  // 🧠 REVEAL
  // ============================================================

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
      setTimeout(() => setShowNextButton(true), 700);
      return;
    }

    setResult("correct");
    
    // Update score locally (you might want to emit this to server)
    const updatedPlayers = [...players];
    updatedPlayers[currentPlayerIndex] = {
      ...currentPlayer,
      timeline: cards.map(c =>
        c.id === newCard.id ? { ...c, type: "fixed" } : c
      ),
      score: currentPlayer.score + 1
    };
    setPlayers(updatedPlayers);
    
    setTimeout(() => setShowNextButton(true), 700);
  };

  const nextTurn = () => {
    socket.emit("next_turn", { code: roomCode }); // Pass actual room code as prop
  };

  // ============================================================
  // UI
  // ============================================================

  if (!currentPlayer) {
    return <div className="container">Waiting for players...</div>;
  }

  return (
    <div className="container">
      <h2>{currentPlayer.name}'s Turn</h2>
      <h3>Score: {currentPlayer.score}</h3>

      {loading && <p>Loading song...</p>}

      <div className="timeline">
        {cards.map((card, index) => (
          <motion.div
            key={card.id}
            className={`card ${
              card.type === "new" && revealed ? "card-expanded" : ""
            }`}
            drag={!revealed && card.type === "new" && isMyTurn ? "y" : false}
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
              cursor: card.type === "new" && !revealed && isMyTurn ? "grab" : "default"
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
          </motion.div>
        ))}
      </div>

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