import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { socket } from "../socket";
import { useSpotifyPlayer } from "./useSpotifyPlayer";

function Game({
  players: initialPlayers,
  setPlayers,
  selectedGenres,
  minYear,
  maxYear,
  roomCode,
  setScreen,
  setWinner,
  playlistTracks: initialPlaylistTracks,
  winGoal = 10,
  timerSeconds = 0,
  t
}) {
  const [players, setLocalPlayers] = useState(initialPlayers);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [cards, setCards] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [isMyTurn, setIsMyTurn] = useState(false);

  // Coins
  const [coins, setCoins] = useState({});
  const [myCoinIndex, setMyCoinIndex] = useState(null);
  const [showRecognition, setShowRecognition] = useState(false);

  // Timer
  const [timeLeft, setTimeLeft] = useState(null);
  const timerRef = useRef(null);

  // Spotify
  const { ready: spotifyReady, playing, togglePlay, stop } = useSpotifyPlayer(roomCode);

  // Drag
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [insertIndex, setInsertIndex] = useState(null);

  // Refs
  const selectedGenresRef = useRef(selectedGenres);
  const minYearRef = useRef(minYear);
  const maxYearRef = useRef(maxYear);
  const playlistTracksRef = useRef(initialPlaylistTracks || null);
  const usedUrisRef = useRef(new Set());
  const cardsRef = useRef(cards);
  const isMyTurnRef = useRef(false);
  const revealedRef = useRef(false);
  const dragYRef = useRef(0);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const timelineRef = useRef(null);

  useEffect(() => { selectedGenresRef.current = selectedGenres; }, [selectedGenres]);
  useEffect(() => { minYearRef.current = minYear; }, [minYear]);
  useEffect(() => { maxYearRef.current = maxYear; }, [maxYear]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { revealedRef.current = revealed; }, [revealed]);
  useEffect(() => { dragYRef.current = dragY; }, [dragY]);

  const updatePlayers = (p) => { setLocalPlayers(p); setPlayers(p); };
  const currentPlayer = players[currentPlayerIndex];

  // ============================================================
  // 🚀 ON MOUNT
  // ============================================================

  useEffect(() => {
    const myTurn = players[0]?.id === socket.id;
    isMyTurnRef.current = myTurn;
    setIsMyTurn(myTurn);

    if (myTurn) {
      loadNewCard(players[0]);
    } else {
      const c = players[0]?.timeline || [];
      setCards(c);
      cardsRef.current = c;
    }
  }, []);

  // ============================================================
  // 🎮 SOCKET — turn_changed + card_revealed
  // ============================================================

  useEffect(() => {
    socket.on("turn_changed", ({
      players: newPlayers,
      currentPlayerIndex: newIndex,
      selectedGenres: genres,
      minYear: min,
      maxYear: max,
      playlistTracks: pt,
      usedUris,
      coins: newCoins
    }) => {
      if (!newPlayers || newIndex === undefined) return;

      if (genres?.length) selectedGenresRef.current = genres;
      if (min) minYearRef.current = Number(min);
      if (max) maxYearRef.current = Number(max);
      if (pt !== undefined) playlistTracksRef.current = pt;
      if (usedUris) usedUrisRef.current = new Set(usedUris);

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
      setCoins(newCoins || {});
      setMyCoinIndex(null);
      setShowRecognition(false);
      stop();
      clearInterval(timerRef.current);
      setTimeLeft(null);

      const myTurn = newPlayers[newIndex]?.id === socket.id;
      isMyTurnRef.current = myTurn;
      setIsMyTurn(myTurn);

      if (myTurn) {
        loadNewCard(newPlayers[newIndex]);
      } else {
        const c = newPlayers[newIndex]?.timeline || [];
        setCards(c);
        cardsRef.current = c;
      }
    });

    socket.on("coins_updated", ({ coins: newCoins }) => {
      setCoins(newCoins || {});
    });

    socket.on("coins_updated_players", ({ players: newPlayers }) => {
      updatePlayers(newPlayers);
    });

    // ✅ NEW: Spectators receive the revealed card state from the active player
    socket.on("card_revealed", ({ result: revealResult, cards: revealedCards }) => {
      setCards(revealedCards);
      cardsRef.current = revealedCards;
      setResult(revealResult);
      setRevealed(true);
      revealedRef.current = true;

      // Show recognition button to spectators for 5 seconds after reveal
      setShowRecognition(true);
      setTimeout(() => setShowRecognition(false), 5000);
    });

    return () => {
      socket.off("turn_changed");
      socket.off("coins_updated");
      socket.off("coins_updated_players");
      socket.off("card_revealed"); // ✅ clean up
    };
  }, []);

  // ============================================================
  // 🎲 GENERATE + LOAD CARD
  // ============================================================

  const generateCard = async () => {
    const playlist = playlistTracksRef.current;

    if (playlist && playlist.length > 0) {
      const unused = playlist.filter(t => !usedUrisRef.current.has(t.uri));
      const pool = unused.length > 0 ? unused : playlist;
      const track = pool[Math.floor(Math.random() * pool.length)];
      usedUrisRef.current.add(track.uri);
      socket.emit("mark_used", { code: roomCode, uri: track.uri });
      return {
        id: Date.now(),
        year: parseInt(track.year),
        name: track.name,
        artist: track.artist,
        uri: track.uri,
        cover: track.cover,
        type: "new"
      };
    }

    const genres = selectedGenresRef.current;
    const min = minYearRef.current;
    const max = maxYearRef.current;
    const genre = genres.length > 0
      ? genres[Math.floor(Math.random() * genres.length)]
      : "";
    const res = await axios.get(
      `/api/track?genre=${genre}&minYear=${min}&maxYear=${max}`
    );
    usedUrisRef.current.add(res.data.uri);
    socket.emit("mark_used", { code: roomCode, uri: res.data.uri });
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

  const scrollIntervalRef = useRef(null);

  const loadNewCard = async (player) => {
    setLoading(true);
    clearInterval(timerRef.current);
    setTimeLeft(null);
    try {
      const newCard = await generateCard();
      const timeline = player.timeline;
      const midIdx = Math.floor(timeline.length / 2);
      const newCards = [
        ...timeline.slice(0, midIdx),
        newCard,
        ...timeline.slice(midIdx)
      ];
      setCards(newCards);
      cardsRef.current = newCards;

      if (timerSeconds > 0 && isMyTurnRef.current) {
        setTimeLeft(timerSeconds);
        timerRef.current = setInterval(() => {
          setTimeLeft(t => {
            if (t <= 1) {
              clearInterval(timerRef.current);
              if (!revealedRef.current) handleReveal();
              return 0;
            }
            return t - 1;
          });
        }, 1000);
      }
    } catch (err) {
      console.error("Failed to load card:", err);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 👆 DRAG
  // ============================================================

  const dragCardRef = useRef(null);
  const startXRef = useRef(0);

  const handleDragStart = useCallback((e) => {
    if (revealedRef.current || !isMyTurnRef.current) return;
    e.stopPropagation();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    startYRef.current = clientY;
    startXRef.current = clientX;
    draggingRef.current = false;
  }, []);

  const handleDragMove = useCallback((e) => {
    if (startYRef.current === 0) return;

    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const deltaY = clientY - startYRef.current;
    const deltaX = clientX - startXRef.current;

    if (!draggingRef.current) {
      if (Math.abs(deltaY) < 3) return;
      if (Math.abs(deltaX) > Math.abs(deltaY)) { startYRef.current = 0; return; }
      draggingRef.current = true;
      setDragging(true);
    }

    if (e.cancelable) e.preventDefault();

    dragYRef.current = deltaY;

    if (dragCardRef.current) {
      dragCardRef.current.style.transform = `translateY(${deltaY}px) scale(1.04)`;
      dragCardRef.current.style.boxShadow = "0 28px 70px rgba(29,185,84,0.55)";
      dragCardRef.current.style.zIndex = "1000";
    }

    // Smooth variable-speed rAF auto-scroll
    const SCROLL_ZONE = 120;
    const MAX_SPEED = 22;
    cancelAnimationFrame(scrollIntervalRef.current);

    const timeline = timelineRef.current;
    if (timeline) {
      const tlRect = timeline.getBoundingClientRect();
      const timelineOverflowsTop = tlRect.top < 0;
      const timelineOverflowsBottom = tlRect.bottom > window.innerHeight;

      let direction = 0;
      let proximity = 0;

      if (clientY < SCROLL_ZONE && timelineOverflowsTop) {
        direction = -1;
        proximity = 1 - (clientY / SCROLL_ZONE);
      } else if (clientY > window.innerHeight - SCROLL_ZONE && timelineOverflowsBottom) {
        direction = 1;
        proximity = 1 - ((window.innerHeight - clientY) / SCROLL_ZONE);
      }

      if (direction !== 0) {
        const eased = Math.pow(proximity, 2);
        const speed = Math.max(1, eased * MAX_SPEED);

        const tick = () => {
          const tl = timelineRef.current;
          if (!tl || !draggingRef.current) return;
          const r = tl.getBoundingClientRect();
          if (direction === -1 && r.top >= 0) return;
          if (direction === 1 && r.bottom <= window.innerHeight) return;
          window.scrollBy(0, direction * speed);
          scrollIntervalRef.current = requestAnimationFrame(tick);
        };
        scrollIntervalRef.current = requestAnimationFrame(tick);
      }
    }

    const currentCards = cardsRef.current;
    const newIdx = currentCards.findIndex(c => c.type === "new");
    if (!dragCardRef.current || !timelineRef.current) return;

    const draggedRect = dragCardRef.current.getBoundingClientRect();
    const draggedCenterY = draggedRect.top + draggedRect.height / 2;

    const allCardEls = timelineRef.current.querySelectorAll(".card");
    const fixedMidpoints = [];
    currentCards.forEach((c, i) => {
      if (c.type !== "new" && allCardEls[i]) {
        const r = allCardEls[i].getBoundingClientRect();
        fixedMidpoints.push({ midY: r.top + r.height / 2, originalIndex: i });
      }
    });

    let fixedSlot = fixedMidpoints.length;
    for (let i = 0; i < fixedMidpoints.length; i++) {
      if (draggedCenterY < fixedMidpoints[i].midY) {
        fixedSlot = i;
        break;
      }
    }

    let arraySlot;
    if (fixedSlot <= newIdx) {
      arraySlot = fixedSlot;
    } else {
      arraySlot = fixedSlot + 1;
    }
    arraySlot = Math.max(0, Math.min(currentCards.length, arraySlot));

    insertIndexRef.current = arraySlot;
    setInsertIndex(prev => prev === arraySlot ? prev : arraySlot);
  }, []);

  const insertIndexRef = useRef(null);

  const handleDragEnd = useCallback(() => {
    if (startYRef.current === 0) return;
    startYRef.current = 0;
    startXRef.current = 0;

    if (!draggingRef.current) return;
    draggingRef.current = false;
    cancelAnimationFrame(scrollIntervalRef.current);

    if (dragCardRef.current) {
      dragCardRef.current.style.transform = "";
      dragCardRef.current.style.boxShadow = "";
      dragCardRef.current.style.zIndex = "";
    }

    const currentCards = cardsRef.current;
    const newIdx = currentCards.findIndex(c => c.type === "new");
    const arraySlot = insertIndexRef.current !== null ? insertIndexRef.current : newIdx;

    const reordered = [...currentCards];
    const [moved] = reordered.splice(newIdx, 1);
    const insertAt = arraySlot > newIdx ? arraySlot - 1 : arraySlot;
    reordered.splice(Math.max(0, Math.min(reordered.length, insertAt)), 0, moved);
    cardsRef.current = reordered;
    setCards(reordered);
    setDragging(false);
    setDragY(0);
    setInsertIndex(null);
    insertIndexRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleDragMove, { passive: false });
    window.addEventListener("touchmove", handleDragMove, { passive: false });
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchend", handleDragEnd);
    window.addEventListener("touchcancel", handleDragEnd);
    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("touchmove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchend", handleDragEnd);
      window.removeEventListener("touchcancel", handleDragEnd);
    };
  }, [handleDragMove, handleDragEnd]);

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

    const revealResult = correct ? "correct" : "wrong";
    setResult(revealResult);

    // ✅ NEW: Broadcast the reveal to all spectators so they see the card too
    socket.emit("reveal_card", {
      code: roomCode,
      result: revealResult,
      cards: currentCards
    });

    if (!correct) {
      setTimeout(() => setShowNextButton(true), 800);
      return;
    }

    const updatedTimeline = currentCards.map(c =>
      c.id === newCard.id ? { ...c, type: "fixed" } : c
    );
    const updatedPlayers = [...players];
    updatedPlayers[currentPlayerIndex] = {
      ...currentPlayer,
      timeline: updatedTimeline,
      score: currentPlayer.score + 1
    };
    updatePlayers(updatedPlayers);

    socket.emit("update_timeline", {
      code: roomCode,
      timeline: updatedTimeline,
      score: currentPlayer.score + 1
    });

    if (updatedPlayers[currentPlayerIndex].score >= winGoal) {
      setWinner(updatedPlayers[currentPlayerIndex]);
      setScreen("winner");
      return;
    }

    setTimeout(() => setShowNextButton(true), 800);
  };

  const giveCoin = () => {
    socket.emit("give_coin", { code: roomCode });
  };

  // ============================================================
  // 🪙 COINS
  // ============================================================

  const placeCoin = (idx) => {
    setMyCoinIndex(idx);
    socket.emit("place_coin", { code: roomCode, insertIndex: idx });
  };

  const removeCoin = () => {
    setMyCoinIndex(null);
    socket.emit("remove_coin", { code: roomCode });
  };

  const claimRecognition = () => {
    setShowRecognition(false);
    socket.emit("claim_recognition", { code: roomCode });
  };

  // ============================================================
  // ➡️ NEXT TURN
  // ============================================================

  const nextTurn = () => {
    const currentCards = cardsRef.current;
    const newCardIndex = currentCards.findIndex(c => c.type === "new");
    const newCard = newCardIndex !== -1 ? currentCards[newCardIndex] : null;

    socket.emit("resolve_coins", {
      code: roomCode,
      activeCorrect: result === "correct",
      activeInsertIndex: newCardIndex,
      newCard
    });
  };

  // ============================================================
  // UI
  // ============================================================

  if (!currentPlayer) {
    return <div className="container">Waiting for players...</div>;
  }

  const newCardOriginalIndex = cards.findIndex(c => c.type === "new");
  const myPlayer = players.find(p => p.id === socket.id);
  const myCoins = myPlayer?.coins ?? 0;
  const hasCoinPlaced = myCoinIndex !== null;

  const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
  const isNextPlayer = players[nextPlayerIndex]?.id === socket.id && !isMyTurn;

  const coinsBySlot = {};
  Object.values(coins).forEach(({ insertIndex: idx }) => {
    coinsBySlot[idx] = (coinsBySlot[idx] || 0) + 1;
  });

  return (
    <div className="container">
      <div style={{
  background: "#333", color: "#fff", fontSize: 11,
  padding: "6px 10px", marginBottom: 8, wordBreak: "break-all"
}}>
  isHost: {String(!!localStorage.getItem("token"))} |
  sdkReady: {String(spotifyReady)} |
  myId: {socket.id?.slice(0,6)}
</div>
      <div className="game-header">
        <div>
          <h2>{currentPlayer.name}'s Turn</h2>
          <h3>{isMyTurn ? t?.yourTurn || "Your turn!" : t?.waitingFor(currentPlayer.name) || `Waiting for ${currentPlayer.name}...`}</h3>
        </div>
        {!isMyTurn && (
          <div className="coin-display">
            🪙 <span>{myCoins}</span>
          </div>
        )}
      </div>

      {loading && <div className="loading-card">{t?.loadingSong || "Loading song..."}</div>}

      {timeLeft !== null && isMyTurn && (
        <div className={`timer-display ${timeLeft <= 5 ? "timer-urgent" : ""}`}>
          {timeLeft}s
        </div>
      )}

      {!loading && (
        <div className="timeline" ref={timelineRef}>
          {cards.map((card, index) => {
            const isNewCard = card.type === "new";
            const isDragged = isNewCard && dragging;

            let shiftY = 0;
            if (dragging && !isNewCard && insertIndex !== null) {
              const origIdx = newCardOriginalIndex;
              const cardEls = timelineRef.current?.querySelectorAll(".card");
              const cardH = (cardEls?.[0]?.getBoundingClientRect().height || 180) + 16;
              if (insertIndex <= origIdx && index >= insertIndex && index < origIdx) {
                shiftY = cardH;
              } else if (insertIndex > origIdx + 1 && index > origIdx && index < insertIndex) {
                shiftY = -cardH;
              }
            }

            const coinsHere = coinsBySlot[index] || 0;
            const myMyCoinHere = myCoinIndex === index;

            return (
              <div key={card.id} style={{ width: "100%", maxWidth: 480 }}>
                {/* Coin slot ABOVE each card */}
                {!isMyTurn && !revealed && (
                  <div className="coin-slot">
                    {coinsHere - (myMyCoinHere ? 1 : 0) > 0 && (
                      <div className="coins-on-slot">
                        {"🪙".repeat(Math.min(coinsHere - (myMyCoinHere ? 1 : 0), 5))}
                      </div>
                    )}
                    {myMyCoinHere ? (
                      <button className="coin-btn coin-placed" onClick={removeCoin} title="Pick up coin">🪙</button>
                    ) : !hasCoinPlaced && myCoins > 0 ? (
                      <button className="coin-btn coin-plus" onClick={() => placeCoin(index)} title="Place coin here">+</button>
                    ) : null}
                  </div>
                )}

                {/* Touch wrapper for draggable new card */}
                {isNewCard && !revealed && isMyTurn ? (
                  <div
                    style={{
                      padding: "20px",
                      margin: "-20px",
                      touchAction: "none",
                      userSelect: "none",
                    }}
                    onMouseDown={handleDragStart}
                    onTouchStart={handleDragStart}
                  >
                    <div
                      ref={dragCardRef}
                      className="card"
                      style={{
                        position: "relative",
                        zIndex: isDragged ? 1000 : 1,
                        transform: isDragged ? undefined : `translateY(${shiftY}px) scale(1)`,
                        transition: isDragged ? "none" : "transform 0.18s ease",
                        cursor: dragging ? "grabbing" : "grab",
                        userSelect: "none",
                        touchAction: "none",
                      }}
                    >
                      <div
                        className={`card-inner
                          ${result === "correct" ? "result-correct" : ""}
                          ${result === "wrong" ? "result-wrong" : ""}
                        `}
                      >
                        <div className="card-front new">
                          <button
                            className="play-button"
                            onClick={(e) => { e.stopPropagation(); togglePlay(card.uri); }}
                            onMouseDown={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                            disabled={!spotifyReady}
                            title={spotifyReady ? "Play / Pause" : "Connecting to Spotify..."}
                          >
                            {playing ? "⏸" : "▶"}
                          </button>
                          <div className="drag-hint">
                            {t?.dragToPlace || "Drag to place"}
                          </div>
                        </div>
                        <div className="card-back">
                          <img src={card.cover} className="cover-large" alt="" />
                          <div className="revealed-year">{card.year}</div>
                          <strong>{card.artist}</strong>
                          <div className="song-title">{card.name}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    ref={isNewCard ? dragCardRef : null}
                    className={`card ${isNewCard && revealed ? "card-expanded" : ""}`}
                    style={{
                      position: "relative",
                      zIndex: 1,
                      transform: `translateY(${shiftY}px) scale(1)`,
                      transition: "transform 0.18s ease",
                      cursor: "default",
                      userSelect: "none",
                    }}
                  >
                    {isNewCard ? (
                      <div
                        className={`card-inner flipped
                          ${result === "correct" ? "result-correct" : ""}
                          ${result === "wrong" ? "result-wrong" : ""}
                        `}
                      >
                        <div className="card-front new">
                          <button
                            className="play-button"
                            onClick={(e) => { e.stopPropagation(); togglePlay(card.uri); }}
                            onMouseDown={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                            disabled={!spotifyReady}
                            title={spotifyReady ? "Play / Pause" : "Connecting to Spotify..."}
                          >
                            {playing ? "⏸" : "▶"}
                          </button>
                          <div className="drag-hint">
                            {t?.isPlaying(currentPlayer.name) || `${currentPlayer.name} is playing...`}
                          </div>
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
                )}

                {/* Coin slot AFTER last card */}
                {index === cards.length - 1 && !isMyTurn && !revealed && (
                  <div className="coin-slot">
                    {(() => {
                      const bottomSlot = cards.length;
                      const bottomCoins = coinsBySlot[bottomSlot] || 0;
                      const myBottomCoin = myCoinIndex === bottomSlot;
                      const othersCoins = bottomCoins - (myBottomCoin ? 1 : 0);
                      return <>
                        {othersCoins > 0 && (
                          <div className="coins-on-slot">{"🪙".repeat(Math.min(othersCoins, 5))}</div>
                        )}
                        {myBottomCoin ? (
                          <button className="coin-btn coin-placed" onClick={removeCoin}>🪙</button>
                        ) : !hasCoinPlaced && myCoins > 0 ? (
                          <button className="coin-btn coin-plus" onClick={() => placeCoin(bottomSlot)}>+</button>
                        ) : null}
                      </>;
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="action-container">
        {isMyTurn && !revealed && !loading && (
          <button onClick={handleReveal}>{t?.reveal || "Reveal"}</button>
        )}
        {isMyTurn && showNextButton && (
          <button onClick={nextTurn}>{t?.nextPlayer || "Next Player"}</button>
        )}
        {isNextPlayer && !revealed && !loading && (
          <button className="give-coin-btn" onClick={giveCoin}>
            {t?.giveCoin(currentPlayer.name) || `🎤 Give coin to ${currentPlayer.name}`}
          </button>
        )}
        {!isMyTurn && showRecognition && (
          <button className="recognition-btn" onClick={claimRecognition}>
            {t?.iKnowThisSong || "🎵 I know this song! +1🪙"}
          </button>
        )}
      </div>
    </div>
  );
}

export default Game;