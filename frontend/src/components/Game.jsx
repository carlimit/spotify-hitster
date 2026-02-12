import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { socket } from "../socket";

function Game({
  players: initialPlayers,
  setPlayers,
  selectedGenres,
  minYear,
  maxYear,
  roomCode,
  setScreen,
  setWinner
}) {
  const [players, setLocalPlayers] = useState(initialPlayers);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [cards, setCards] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Drag state
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [insertIndex, setInsertIndex] = useState(null); // where card WOULD land

  // Refs — always fresh, avoids stale closure bugs
  const selectedGenresRef = useRef(selectedGenres);
  const minYearRef = useRef(minYear);
  const maxYearRef = useRef(maxYear);
  const cardsRef = useRef(cards);
  const isMyTurnRef = useRef(false);
  const revealedRef = useRef(false);
  const timelineRef = useRef(null);
  const startYRef = useRef(0);
  const draggingRef = useRef(false);
  const originalIndexRef = useRef(null);

  useEffect(() => { selectedGenresRef.current = selectedGenres; }, [selectedGenres]);
  useEffect(() => { minYearRef.current = minYear; }, [minYear]);
  useEffect(() => { maxYearRef.current = maxYear; }, [maxYear]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { revealedRef.current = revealed; }, [revealed]);

  const updatePlayers = (p) => { setLocalPlayers(p); setPlayers(p); };
  const currentPlayer = players[currentPlayerIndex];

  // ============================================================
  // 🚀 ON MOUNT
  // ============================================================

  useEffect(() => {
    const myTurn = players[0]?.id === socket.id;
    isMyTurnRef.current = myTurn;
    if (myTurn) {
      loadNewCard(players[0]);
    } else {
      const c = players[0]?.timeline || [];
      setCards(c);
      cardsRef.current = c;
    }
  }, []);

  // ============================================================
  // 🎮 SOCKET — turn_changed
  // ============================================================

  useEffect(() => {
    socket.on("turn_changed", ({ players: newPlayers, currentPlayerIndex: newIndex }) => {
      if (!newPlayers || newIndex === undefined) return;

      updatePlayers(newPlayers);
      setCurrentPlayerIndex(newIndex);
      setRevealed(false);
      revealedRef.current = false;
      setShowNextButton(false);
      setResult(null);
      setDragging(false);
      draggingRef.current = false;
      setDragY(0);
      setInsertIndex(null);

      const myTurn = newPlayers[newIndex]?.id === socket.id;
      isMyTurnRef.current = myTurn;

      if (myTurn) {
        loadNewCard(newPlayers[newIndex]);
      } else {
        const c = newPlayers[newIndex]?.timeline || [];
        setCards(c);
        cardsRef.current = c;
      }
    });

    return () => socket.off("turn_changed");
  }, []);

  // ============================================================
  // 🎲 GENERATE + LOAD CARD
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

  const loadNewCard = async (player) => {
    setLoading(true);
    try {
      const newCard = await generateCard();
      const newCards = [...player.timeline, newCard];
      setCards(newCards);
      cardsRef.current = newCards;
    } catch (err) {
      console.error("Failed to load card:", err);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 👆 DRAG — card stays with finger, others shift around it
  // ============================================================

  const handleDragStart = useCallback((e) => {
    if (revealedRef.current || !isMyTurnRef.current) return;
    e.preventDefault();

    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;
    const newIdx = cardsRef.current.findIndex(c => c.type === "new");
    originalIndexRef.current = newIdx;
    draggingRef.current = true;
    setDragging(true);
    setDragY(0);
    setInsertIndex(newIdx);
  }, []);

  const handleDragMove = useCallback((e) => {
    if (!draggingRef.current) return;
    e.preventDefault();

    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const delta = clientY - startYRef.current;

    // Update the visual position of the dragged card — pure 1:1
    setDragY(delta);

    // Calculate where the card WOULD be inserted (for other cards to move)
    const currentCards = cardsRef.current;
    const newIdx = currentCards.findIndex(c => c.type === "new");
    const cardEls = timelineRef.current?.querySelectorAll(".card");
    if (!cardEls || cardEls.length === 0) return;

    const cardH = cardEls[0].getBoundingClientRect().height + 16; // +gap
    const slotsMoved = Math.round(delta / cardH);
    const target = Math.max(0, Math.min(currentCards.length - 1, newIdx + slotsMoved));
    setInsertIndex(target);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);

    // Commit reorder
    const currentCards = cardsRef.current;
    const newIdx = currentCards.findIndex(c => c.type === "new");

    const cardEls = timelineRef.current?.querySelectorAll(".card");
    const cardH = cardEls && cardEls[0]
      ? cardEls[0].getBoundingClientRect().height + 16
      : 180;

    const delta = dragY; // won't be updated yet, use ref
    // Actually recalculate from the last known position
    const reordered = [...currentCards];
    const slotsMoved = Math.round(dragYRef.current / cardH);
    const target = Math.max(0, Math.min(reordered.length - 1, newIdx + slotsMoved));

    const [moved] = reordered.splice(newIdx, 1);
    reordered.splice(target, 0, moved);

    cardsRef.current = reordered;
    setCards(reordered);
    setDragY(0);
    setInsertIndex(null);
  }, []);

  // Keep a ref of dragY for use in handleDragEnd
  const dragYRef = useRef(0);
  useEffect(() => { dragYRef.current = dragY; }, [dragY]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleDragMove, { passive: false });
      window.addEventListener("touchmove", handleDragMove, { passive: false });
      window.addEventListener("mouseup", handleDragEnd);
      window.addEventListener("touchend", handleDragEnd);
    }
    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("touchmove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [dragging, handleDragMove, handleDragEnd]);

  // ============================================================
  // 🧠 REVEAL
  // ============================================================

  const handleReveal = () => {
    const currentCards = cardsRef.current;
    const newCardIndex = currentCards.findIndex(c => c.type === "new");
    if (newCardIndex === -1) return;

    const left = currentCards[newCardIndex - 1];
    const right = currentCards[newCardIndex + 1];
    const newCard = currentCards[newCardIndex];

    setRevealed(true);
    revealedRef.current = true;

    let correct = true;
    if (left && left.year > newCard.year) correct = false;
    if (right && right.year < newCard.year) correct = false;

    if (!correct) {
      setResult("wrong");
      setTimeout(() => setShowNextButton(true), 800);
      return;
    }

    setResult("correct");

    const updatedPlayers = [...players];
    updatedPlayers[currentPlayerIndex] = {
      ...currentPlayer,
      timeline: currentCards.map(c =>
        c.id === newCard.id ? { ...c, type: "fixed" } : c
      ),
      score: currentPlayer.score + 1
    };
    updatePlayers(updatedPlayers);

    if (updatedPlayers[currentPlayerIndex].score >= 10) {
      setWinner(updatedPlayers[currentPlayerIndex]);
      setScreen("winner");
      return;
    }

    setTimeout(() => setShowNextButton(true), 800);
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

  const newCardOriginalIndex = cards.findIndex(c => c.type === "new");

  return (
    <div className="container">
      <h2>{currentPlayer.name}'s Turn</h2>
      <h3>{isMyTurnRef.current ? "Your turn!" : `Waiting for ${currentPlayer.name}...`}</h3>

      {loading && <div className="loading-card">Loading song...</div>}

      {!loading && (
        <div className="timeline" ref={timelineRef}>
          {cards.map((card, index) => {
            const isNewCard = card.type === "new";
            const isDragged = isNewCard && dragging;

            // Shift other cards to make room while dragging
            let shiftY = 0;
            if (dragging && !isNewCard && insertIndex !== null) {
              const origIdx = newCardOriginalIndex;
              const cardH = timelineRef.current?.querySelector(".card")?.getBoundingClientRect().height + 16 || 196;
              if (insertIndex < origIdx && index >= insertIndex && index < origIdx) {
                shiftY = cardH; // shift down
              } else if (insertIndex > origIdx && index > origIdx && index <= insertIndex) {
                shiftY = -cardH; // shift up
              }
            }

            return (
              <div
                key={card.id}
                className={`card ${isNewCard && revealed ? "card-expanded" : ""}`}
                style={{
                  position: "relative",
                  zIndex: isDragged ? 1000 : 1,
                  transform: isDragged
                    ? `translateY(${dragY}px) scale(1.04)`
                    : `translateY(${shiftY}px) scale(1)`,
                  boxShadow: isDragged
                    ? "0 28px 70px rgba(29,185,84,0.55)"
                    : undefined,
                  transition: isDragged
                    ? "box-shadow 0.15s"
                    : "transform 0.18s ease, box-shadow 0.15s",
                  cursor: isNewCard && !revealed && isMyTurnRef.current
                    ? (dragging ? "grabbing" : "grab")
                    : "default",
                  touchAction: "none",
                  userSelect: "none",
                }}
                onMouseDown={isNewCard && !revealed && isMyTurnRef.current ? handleDragStart : undefined}
                onTouchStart={isNewCard && !revealed && isMyTurnRef.current ? handleDragStart : undefined}
              >
                {isNewCard ? (
                  <div
                    className={`card-inner
                      ${revealed ? "flipped" : ""}
                      ${result === "correct" ? "result-correct" : ""}
                      ${result === "wrong" ? "result-wrong" : ""}
                    `}
                  >
                    <div className="card-front new">
                      <div>{isMyTurnRef.current ? "Drag to place" : `${currentPlayer.name} is playing...`}</div>
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
              </div>
            );
          })}
        </div>
      )}

      <div className="action-container">
        {isMyTurnRef.current && !revealed && !loading && (
          <button onClick={handleReveal}>Reveal</button>
        )}
        {isMyTurnRef.current && showNextButton && (
          <button onClick={nextTurn}>Next Player</button>
        )}
      </div>
    </div>
  );
}

export default Game;