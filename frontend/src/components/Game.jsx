import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { socket } from "../socket";

function Game({
  players,
  setPlayers,
  selectedGenres,
  minYear,
  maxYear,
  roomCode,
  setScreen,
  setWinner
}) {
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [cards, setCards] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);

  // Drag state
  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragCardIndex, setDragCardIndex] = useState(null);
  const [orderedCards, setOrderedCards] = useState([]);

  // Refs
  const selectedGenresRef = useRef(selectedGenres);
  const minYearRef = useRef(minYear);
  const maxYearRef = useRef(maxYear);
  const cardsRef = useRef(cards);
  const timelineRef = useRef(null);
  const startYRef = useRef(0);
  const cardHeightRef = useRef(0);

  useEffect(() => { selectedGenresRef.current = selectedGenres; }, [selectedGenres]);
  useEffect(() => { minYearRef.current = minYear; }, [minYear]);
  useEffect(() => { maxYearRef.current = maxYear; }, [maxYear]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  const currentPlayer = players[currentPlayerIndex];

  // ============================================================
  // 🚀 ON MOUNT
  // ============================================================

  useEffect(() => {
    const myTurn = players[0]?.id === socket.id;
    setIsMyTurn(myTurn);
    if (myTurn) {
      loadNewCard(players[0]);
    } else {
      setCards(players[0]?.timeline || []);
    }
  }, []);

  // ============================================================
  // 🎮 SOCKET — turn_changed
  // ============================================================

  useEffect(() => {
    socket.on("turn_changed", ({ players: newPlayers, currentPlayerIndex: newIndex }) => {
      // Guard against undefined
      if (!newPlayers || newIndex === undefined) return;

      setPlayers(newPlayers);
      setCurrentPlayerIndex(newIndex);
      setRevealed(false);
      setShowNextButton(false);
      setResult(null);
      setDragging(false);
      setDragCardIndex(null);

      const myTurn = newPlayers[newIndex]?.id === socket.id;
      setIsMyTurn(myTurn);

      if (myTurn) {
        loadNewCard(newPlayers[newIndex]);
      } else {
        setCards(newPlayers[newIndex]?.timeline || []);
      }
    });
    return () => socket.off("turn_changed");
  }, []);

  // Keep orderedCards in sync with cards when not dragging
  useEffect(() => {
    if (!dragging) setOrderedCards(cards);
  }, [cards, dragging]);

  // ============================================================
  // 🎲 GENERATE + LOAD CARD
  // ============================================================

  const generateCard = async () => {
    const genres = selectedGenresRef.current;
    const min = minYearRef.current;
    const max = maxYearRef.current;
    const randomGenre = genres[Math.floor(Math.random() * genres.length)];
    const res = await axios.get(`/api/track?genre=${randomGenre}&minYear=${min}&maxYear=${max}`);
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

  const loadNewCard = async (player) => {
    setLoading(true);
    try {
      const newCard = await generateCard();
      const newCards = [...player.timeline, newCard];
      setCards(newCards);
      setOrderedCards(newCards);
    } catch (err) {
      console.error("Failed to load card:", err);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 👆 DRAG — pure pointer/touch tracking, no physics
  // ============================================================

  const getNewCardIndex = (cardList) => cardList.findIndex(c => c.type === "new");

  const handleDragStart = (e) => {
    if (revealed || !isMyTurn) return;
    e.preventDefault();

    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;

    // measure card height from the timeline
    const firstCard = timelineRef.current?.querySelector(".card");
    if (firstCard) cardHeightRef.current = firstCard.getBoundingClientRect().height + 20; // +gap

    setDragging(true);
    setDragY(0);
    setDragCardIndex(getNewCardIndex(cards));

    window.addEventListener("mousemove", handleDragMove, { passive: false });
    window.addEventListener("touchmove", handleDragMove, { passive: false });
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchend", handleDragEnd);
  };

  const handleDragMove = (e) => {
    e.preventDefault();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const delta = clientY - startYRef.current;
    setDragY(delta);

    // Reorder based on current finger position
    const currentCards = cardsRef.current;
    const newIdx = getNewCardIndex(currentCards);
    const cardH = cardHeightRef.current || 180;

    // How many slots has the card moved?
    const slotsMoved = Math.round(delta / cardH);
    const rawTarget = newIdx + slotsMoved;
    const targetIndex = Math.max(0, Math.min(currentCards.length - 1, rawTarget));

    if (targetIndex !== newIdx) {
      const reordered = [...currentCards];
      const [moved] = reordered.splice(newIdx, 1);
      reordered.splice(targetIndex, 0, moved);
      setCards(reordered);
      setOrderedCards(reordered);
      setDragCardIndex(targetIndex);
      // Reset delta relative to new position
      startYRef.current = clientY - ((rawTarget - targetIndex) * cardH);
    }
  };

  const handleDragEnd = () => {
    setDragging(false);
    setDragY(0);
    setDragCardIndex(null);

    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("touchmove", handleDragMove);
    window.removeEventListener("mouseup", handleDragEnd);
    window.removeEventListener("touchend", handleDragEnd);
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
      timeline: cards.map(c => c.id === newCard.id ? { ...c, type: "fixed" } : c),
      score: currentPlayer.score + 1
    };
    setPlayers(updatedPlayers);

    if (updatedPlayers[currentPlayerIndex].score >= 10) {
      setWinner(updatedPlayers[currentPlayerIndex]);
      setScreen("winner");
      return;
    }

    setTimeout(() => setShowNextButton(true), 700);
  };

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
        <div className="timeline" ref={timelineRef}>
          {cards.map((card, index) => {
            const isNewCard = card.type === "new";
            const isDragged = isNewCard && dragging;

            return (
              <motion.div
                key={card.id}
                className={`card ${isNewCard && revealed ? "card-expanded" : ""}`}
                animate={{ y: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
                style={{
                  position: "relative",
                  zIndex: isDragged ? 1000 : 1,
                  y: isDragged ? dragY : 0,
                  transform: isDragged ? `translateY(${dragY}px) scale(1.04)` : "translateY(0) scale(1)",
                  boxShadow: isDragged ? "0 20px 60px rgba(29,185,84,0.5)" : undefined,
                  cursor: isNewCard && !revealed && isMyTurn ? (dragging ? "grabbing" : "grab") : "default",
                  touchAction: "none",
                  transition: isDragged ? "box-shadow 0.2s, transform 0.05s" : "transform 0.25s ease, box-shadow 0.2s"
                }}
                onMouseDown={isNewCard && !revealed && isMyTurn ? handleDragStart : undefined}
                onTouchStart={isNewCard && !revealed && isMyTurn ? handleDragStart : undefined}
              >
                {isNewCard ? (
                  <div className={`card-inner ${revealed ? "flipped" : ""} ${result === "correct" ? "result-correct" : ""} ${result === "wrong" ? "result-wrong" : ""}`}>
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
            );
          })}
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