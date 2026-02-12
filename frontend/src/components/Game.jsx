import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { socket } from "../socket";

function Game({
  players,
  setPlayers,
  selectedGenres,
  minYear,
  maxYear,
  roomCode
}) {
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [cards, setCards] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [draggedCardIndex, setDraggedCardIndex] = useState(null);

  // Always-fresh refs to avoid stale closures
  const selectedGenresRef = useRef(selectedGenres);
  const minYearRef = useRef(minYear);
  const maxYearRef = useRef(maxYear);
  useEffect(() => { selectedGenresRef.current = selectedGenres; }, [selectedGenres]);
  useEffect(() => { minYearRef.current = minYear; }, [minYear]);
  useEffect(() => { maxYearRef.current = maxYear; }, [maxYear]);

  const currentPlayer = players[currentPlayerIndex];

  // ============================================================
  // 🚀 ON MOUNT — figure out if it's my turn and load card
  // We can't rely on game_started socket event here because
  // App.jsx already handled it and switched to this component —
  // by the time Game mounts, that event is long gone.
  // ============================================================

  useEffect(() => {
    const myPlayer = players.find(p => p.id === socket.id);
    const myIndex = players.findIndex(p => p.id === socket.id);
    const startIndex = 0; // currentPlayerIndex starts at 0

    const myTurn = players[startIndex]?.id === socket.id;
    setIsMyTurn(myTurn);
    setCurrentPlayerIndex(startIndex);

    if (myTurn) {
      // It's my turn — load a new card on top of my timeline
      loadNewCard(players[startIndex]);
    } else {
      // Not my turn — just show the current player's timeline
      setCards(players[startIndex]?.timeline || []);
    }
  }, []); // runs once on mount

  // ============================================================
  // 🎮 SOCKET — turn_changed
  // ============================================================

  useEffect(() => {
    socket.on("turn_changed", ({ players, currentPlayerIndex }) => {
      setPlayers(players);
      setCurrentPlayerIndex(currentPlayerIndex);
      setRevealed(false);
      setShowNextButton(false);
      setResult(null);

      const myTurn = players[currentPlayerIndex]?.id === socket.id;
      setIsMyTurn(myTurn);

      if (myTurn) {
        loadNewCard(players[currentPlayerIndex]);
      } else {
        setCards(players[currentPlayerIndex]?.timeline || []);
      }
    });

    return () => socket.off("turn_changed");
  }, []);

  // ============================================================
  // 🎲 GENERATE CARD
  // ============================================================

  const generateCard = async () => {
    const genres = selectedGenresRef.current;
    const min = minYearRef.current;
    const max = maxYearRef.current;
    const randomGenre = genres[Math.floor(Math.random() * genres.length)];

    const res = await axios.get(
      `/api/track?genre=${randomGenre}&minYear=${min}&maxYear=${max}`
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
  // 📥 LOAD NEW CARD
  // ============================================================

  const loadNewCard = async (player) => {
    setLoading(true);
    try {
      const newCard = await generateCard();
      setCards([...player.timeline, newCard]);
    } catch (err) {
      console.error("Failed to load card:", err);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 🎯 DRAG END
  // ============================================================

  const handleDragEnd = (event) => {
    const newCardIndex = cards.findIndex(c => c.type === "new");
    const draggedCard = cards[newCardIndex];

    const cardElements = document.querySelectorAll(".card");
    const positions = Array.from(cardElements).map(el => {
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });

    const dragY = event.clientY ?? event.changedTouches?.[0]?.clientY;
    let insertIndex = 0;
    for (let i = 0; i < positions.length; i++) {
      if (dragY > positions[i]) insertIndex = i + 1;
    }
    if (insertIndex > newCardIndex) insertIndex--;

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

  // ============================================================
  // ➡️ NEXT TURN
  // ============================================================

  const nextTurn = () => {
    socket.emit("next_turn", { code: roomCode });
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
      <h3>{isMyTurn ? "Your turn!" : `Waiting for ${currentPlayer.name}...`}</h3>

      {loading && <div className="loading-card">Loading song...</div>}

      {!loading && (
        <div className="timeline">
          {cards.map((card, index) => (
            <motion.div
              key={card.id}
              className={`card ${card.type === "new" && revealed ? "card-expanded" : ""}`}
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
                    <div>{isMyTurn ? "Drag to place" : `${currentPlayer.name} is playing...`}</div>
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
      )}

      <div className="action-container">
        {isMyTurn && !revealed && !loading && (
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