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

  // Coins — { [playerId]: { playerId, insertIndex } }
  const [coins, setCoins] = useState({});
  const [myCoinIndex, setMyCoinIndex] = useState(null); // where I placed my coin (null = no coin placed)
  const [showRecognition, setShowRecognition] = useState(false); // "I know this!" button after reveal

  // Timer
  const [timeLeft, setTimeLeft] = useState(null);
  const timerRef = useRef(null);

  // Spotify
  const { ready: spotifyReady, playing, togglePlay, stop } = useSpotifyPlayer(roomCode);

  // Drag
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [insertIndex, setInsertIndex] = useState(null);

  // Refs — always fresh values inside callbacks
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
  // 🎮 SOCKET — turn_changed
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

    return () => {
      socket.off("turn_changed");
      socket.off("coins_updated");
      socket.off("coins_updated_players");
    };
  }, []);

  // ============================================================
  // 🎲 GENERATE + LOAD CARD
  // ============================================================

  const generateCard = async () => {
    const playlist = playlistTracksRef.current;

    // Playlist mode — pick a random unused track
    if (playlist && playlist.length > 0) {
      const unused = playlist.filter(t => !usedUrisRef.current.has(t.uri));
      // If somehow all tracks used, reset and use full list
      const pool = unused.length > 0 ? unused : playlist;
      const track = pool[Math.floor(Math.random() * pool.length)];

      // Mark as used locally and tell server
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

    // Search mode — use genre/year filters
    const genres = selectedGenresRef.current;
    const min = minYearRef.current;
    const max = maxYearRef.current;
    const genre = genres.length > 0
      ? genres[Math.floor(Math.random() * genres.length)]
      : "";
    const res = await axios.get(
      `/api/track?genre=${genre}&minYear=${min}&maxYear=${max}`
    );

    // Mark as used to prevent repeats in search mode too
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

  const loadNewCard = async (player) => {
    setLoading(true);
    clearInterval(timerRef.current);
    setTimeLeft(null);
    try {
      const newCard = await generateCard();
      const newCards = [newCard, ...player.timeline];
      setCards(newCards);
      cardsRef.current = newCards;

      // Start countdown if timer enabled and it's my turn
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
  // 👆 DRAG — card stays exactly with finger
  // ============================================================

  const handleDragStart = useCallback((e) => {
    if (revealedRef.current || !isMyTurnRef.current) return;
    e.preventDefault();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;
    draggingRef.current = true;
    setDragging(true);
    setDragY(0);
    setInsertIndex(cardsRef.current.findIndex(c => c.type === "new"));
  }, []);

  const handleDragMove = useCallback((e) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const delta = clientY - startYRef.current;
    setDragY(delta);

    const currentCards = cardsRef.current;
    const newIdx = currentCards.findIndex(c => c.type === "new");
    const cardEls = timelineRef.current?.querySelectorAll(".card");
    if (!cardEls?.length) return;
    const cardH = cardEls[0].getBoundingClientRect().height + 16;
    const slotsMoved = Math.round(delta / cardH);
    const target = Math.max(0, Math.min(currentCards.length - 1, newIdx + slotsMoved));
    setInsertIndex(target);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);

    const currentCards = cardsRef.current;
    const newIdx = currentCards.findIndex(c => c.type === "new");
    const cardEls = timelineRef.current?.querySelectorAll(".card");
    const cardH = cardEls?.[0]?.getBoundingClientRect().height + 16 || 196;
    const slotsMoved = Math.round(dragYRef.current / cardH);
    const target = Math.max(0, Math.min(currentCards.length - 1, newIdx + slotsMoved));

    const reordered = [...currentCards];
    const [moved] = reordered.splice(newIdx, 1);
    reordered.splice(target, 0, moved);
    cardsRef.current = reordered;
    setCards(reordered);
    setDragY(0);
    setInsertIndex(null);
  }, []);

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

    // Show "I know this song!" button to spectators for 5 seconds
    if (!isMyTurn) {
      setShowRecognition(true);
      setTimeout(() => setShowRecognition(false), 5000);
    }
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
  // ➡️ NEXT TURN — resolves coins then advances
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

  // Next player in turn order — they get the "give coin" button
  const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
  const isNextPlayer = players[nextPlayerIndex]?.id === socket.id && !isMyTurn;

  // Count how many coins are on each slot
  const coinsBySlot = {};
  Object.values(coins).forEach(({ insertIndex: idx }) => {
    coinsBySlot[idx] = (coinsBySlot[idx] || 0) + 1;
  });

  return (
    <div className="container">
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

      {loading && <div className="loading-card">`${t?.loadingSong || "Loading song..."}`</div>}

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
              const cardH = cardEls?.[0]?.getBoundingClientRect().height + 16 || 196;
              if (insertIndex < origIdx && index >= insertIndex && index < origIdx) {
                shiftY = cardH;
              } else if (insertIndex > origIdx && index > origIdx && index <= insertIndex) {
                shiftY = -cardH;
              }
            }

            // Coins sitting on the slot BEFORE this card
            const coinsHere = coinsBySlot[index] || 0;
            const myMyCoinHere = myCoinIndex === index;

            return (
              <div key={card.id} style={{ width: "100%", maxWidth: 480 }}>
                {/* Coin slot ABOVE each card — only for spectators, before reveal */}
                {!isMyTurn && !revealed && (
                  <div className="coin-slot">
                    {/* Show other players' coins but not your own (your button IS the coin) */}
                    {coinsHere - (myMyCoinHere ? 1 : 0) > 0 && (
                      <div className="coins-on-slot">
                        {"🪙".repeat(Math.min(coinsHere - (myMyCoinHere ? 1 : 0), 5))}
                      </div>
                    )}
                    {myMyCoinHere ? (
                      <button className="coin-btn coin-placed" onClick={removeCoin} title="Pick up coin">
                        🪙
                      </button>
                    ) : !hasCoinPlaced && myCoins > 0 ? (
                      <button className="coin-btn coin-plus" onClick={() => placeCoin(index)} title="Place coin here">
                        +
                      </button>
                    ) : null}
                  </div>
                )}

                <div
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
                    : "transform 0.18s ease",
                  cursor: isNewCard && !revealed && isMyTurn
                    ? (dragging ? "grabbing" : "grab")
                    : "default",
                  touchAction: "none",
                  userSelect: "none",
                }}
                onMouseDown={isNewCard && !revealed && isMyTurn ? handleDragStart : undefined}
                onTouchStart={isNewCard && !revealed && isMyTurn ? handleDragStart : undefined}
              >
                {isNewCard ? (
                  <div
                    className={`card-inner
                      ${revealed ? "flipped" : ""}
                      ${result === "correct" ? "result-correct" : ""}
                      ${result === "wrong" ? "result-wrong" : ""}
                    `}
                  >
                    {/* FRONT */}
                    <div className="card-front new">
                      <button
                          className="play-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePlay(card.uri);
                          }}
                          onMouseDown={e => e.stopPropagation()}
                          onTouchStart={e => e.stopPropagation()}
                          disabled={!spotifyReady}
                          title={spotifyReady ? "Play / Pause" : "Connecting to Spotify..."}
                        >
                          {playing ? "⏸" : "▶"}
                        </button>
                      <div className="drag-hint">
                        {isMyTurn ? (t?.dragToPlace || "Drag to place") : (t?.isPlaying(currentPlayer.name) || `${currentPlayer.name} is playing...`)}
                      </div>
                    </div>

                    {/* BACK */}
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
          <button onClick={handleReveal}>{ t?.reveal || "Reveal" }</button>
        )}
        {isMyTurn && showNextButton && (
          <button onClick={nextTurn}>{ t?.nextPlayer || "Next Player" }</button>
        )}
        {isNextPlayer && !revealed && !loading && (
          <button className="give-coin-btn" onClick={giveCoin}>
            { t?.giveCoin(currentPlayer.name) || `🎤 Give coin to ${currentPlayer.name}` }
          </button>
        )}
        {!isMyTurn && showRecognition && (
          <button className="recognition-btn" onClick={claimRecognition}>
            { t?.iKnowThisSong || "🎵 I know this song! +1🪙" }
          </button>
        )}
      </div>
    </div>
  );
}

export default Game;