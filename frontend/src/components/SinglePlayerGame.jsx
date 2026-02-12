import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { useSpotifyDirect } from "./useSpotifyPlayer";

function SinglePlayerGame({ t,
  setScreen,
  selectedGenres,
  minYear,
  maxYear,
  playlistTracks,
  timerSeconds = 0
}) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // "correct" | "wrong"
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalPlayed, setTotalPlayed] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const { ready: spotifyReady, playing, togglePlay, stop } = useSpotifyDirect();

  // Drag
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [insertIndex, setInsertIndex] = useState(null);

  const cardsRef = useRef(cards);
  const revealedRef = useRef(false);
  const dragYRef = useRef(0);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const timelineRef = useRef(null);
  const timerRef = useRef(null);
  const usedUrisRef = useRef(new Set());
  const playlistRef = useRef(playlistTracks || null);
  const genresRef = useRef(selectedGenres);
  const minYearRef = useRef(minYear);
  const maxYearRef = useRef(maxYear);

  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { revealedRef.current = revealed; }, [revealed]);
  useEffect(() => { dragYRef.current = dragY; }, [dragY]);

  // ── Generate a card ──
  const generateCard = async () => {
    const playlist = playlistRef.current;

    if (playlist && playlist.length > 0) {
      const unused = playlist.filter(t => !usedUrisRef.current.has(t.uri));
      const pool = unused.length > 0 ? unused : playlist;
      const track = pool[Math.floor(Math.random() * pool.length)];
      usedUrisRef.current.add(track.uri);
      return { id: Date.now(), year: parseInt(track.year), name: track.name, artist: track.artist, uri: track.uri, cover: track.cover, type: "new" };
    }

    // Genre mode — keep trying until we get an unused URI (max 5 attempts)
    const genres = genresRef.current;
    const genre = genres.length > 0 ? genres[Math.floor(Math.random() * genres.length)] : "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await axios.get(`/api/track?genre=${genre}&minYear=${minYearRef.current}&maxYear=${maxYearRef.current}`);
      const uri = res.data.uri;
      if (!usedUrisRef.current.has(uri)) {
        usedUrisRef.current.add(uri);
        return {
          id: Date.now(),
          year: parseInt(res.data.year),
          name: res.data.name,
          artist: res.data.artist,
          uri,
          cover: res.data.cover,
          type: "new"
        };
      }
    }
    // Fallback: just return whatever we got last even if duplicate
    const res = await axios.get(`/api/track?genre=${genre}&minYear=${minYearRef.current}&maxYear=${maxYearRef.current}`);
    return { id: Date.now(), year: parseInt(res.data.year), name: res.data.name, artist: res.data.artist, uri: res.data.uri, cover: res.data.cover, type: "new" };
  };

  // ── Load first card on mount ──
  useEffect(() => {
    loadCard([]);
    return () => clearInterval(timerRef.current);
  }, []);

  const loadCard = async (existingTimeline) => {
    setLoading(true);
    clearInterval(timerRef.current);
    setTimeLeft(null);
    setResult(null);
    setRevealed(false);
    revealedRef.current = false;
    setDragging(false);
    draggingRef.current = false;
    setInsertIndex(null);
    stop();

    try {
      const card = await generateCard();
      const newCards = [card, ...existingTimeline];
      setCards(newCards);
      cardsRef.current = newCards;

      if (timerSeconds > 0) {
        setTimeLeft(timerSeconds);
        timerRef.current = setInterval(() => {
          setTimeLeft(t => {
            if (t <= 1) {
              clearInterval(timerRef.current);
              if (!revealedRef.current) doReveal(cardsRef.current);
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

  // ── Reveal ──
  const doReveal = (currentCards) => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    setRevealed(true);
    clearInterval(timerRef.current);
    setTimeLeft(null);

    const newCard = currentCards.find(c => c.type === "new");
    if (!newCard) return;

    const fixedCards = currentCards.filter(c => c.type === "fixed").sort((a, b) => a.year - b.year);
    const newIdx = currentCards.indexOf(newCard);
    const fixedIdx = currentCards.filter((c, i) => c.type === "fixed" && i < newIdx).length;

    const leftYear = fixedIdx > 0 ? fixedCards[fixedIdx - 1].year : -Infinity;
    const rightYear = fixedIdx < fixedCards.length ? fixedCards[fixedIdx].year : Infinity;
    const correct = newCard.year >= leftYear && newCard.year <= rightYear;

    setTotalPlayed(p => p + 1);

    if (correct) {
      setResult("correct");
      setScore(s => s + 1);
      setStreak(s => {
        const next = s + 1;
        setBestStreak(b => Math.max(b, next));
        return next;
      });
    } else {
      setResult("wrong");
      setStreak(0);
    }
  };

  const handleReveal = () => doReveal(cardsRef.current);

  // ── Next card ──
  const nextCard = () => {
    const currentCards = cardsRef.current;
    const newCard = currentCards.find(c => c.type === "new");
    const isCorrect = result === "correct";

    let newTimeline;
    if (isCorrect && newCard) {
      newTimeline = currentCards.map(c => c.id === newCard.id ? { ...c, type: "fixed" } : c);
    } else {
      newTimeline = currentCards.filter(c => c.type === "fixed");
    }

    loadCard(newTimeline);
  };

  const dragCardRef = useRef(null);
  const insertIndexRef = useRef(null);

  // ── Drag ──
  const handleDragStart = useCallback((e) => {
    if (revealedRef.current) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;
    draggingRef.current = false;
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const delta = clientY - startYRef.current;

      if (!draggingRef.current) {
        if (Math.abs(delta) < 8 || startYRef.current === 0) return;
        draggingRef.current = true;
        setDragging(true);
      }

      e.preventDefault();
      dragYRef.current = delta;

      if (dragCardRef.current) {
        dragCardRef.current.style.transform = `translateY(${delta}px) scale(1.04)`;
        dragCardRef.current.style.boxShadow = "0 28px 70px rgba(29,185,84,0.55)";
        dragCardRef.current.style.zIndex = "1000";
      }

      // Use actual screen position of dragged card center
      const cards = cardsRef.current;
      const newIdx = cards.findIndex(c => c.type === "new");
      const container = timelineRef.current;
      if (!container || !dragCardRef.current) return;
      const cardEls = container.querySelectorAll(".card");

      const draggedRect = dragCardRef.current.getBoundingClientRect();
      const draggedCenterY = draggedRect.top + draggedRect.height / 2;

      let target = cards.length - 1;
      for (let i = 0; i < cardEls.length; i++) {
        if (i === newIdx) continue;
        const rect = cardEls[i].getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (draggedCenterY < midY) {
          target = i < newIdx ? i : i - 1;
          break;
        }
        target = i < newIdx ? i + 1 : i;
      }
      target = Math.max(0, Math.min(cards.length - 1, target));
      insertIndexRef.current = target;
      setInsertIndex(prev => prev === target ? prev : target);
    };

    const onEnd = () => {
      if (!draggingRef.current) { startYRef.current = 0; return; }
      draggingRef.current = false;

      if (dragCardRef.current) {
        dragCardRef.current.style.transform = "";
        dragCardRef.current.style.boxShadow = "";
        dragCardRef.current.style.zIndex = "";
      }

      setDragging(false);
      setDragY(0);
      startYRef.current = 0;

      const currentCards = cardsRef.current;
      const origIdx = currentCards.findIndex(c => c.type === "new");
      const target = insertIndexRef.current;
      insertIndexRef.current = null;

      if (target !== null && target !== origIdx) {
        const newCards = [...currentCards];
        const [card] = newCards.splice(origIdx, 1);
        const finalTarget = Math.max(0, Math.min(newCards.length, target > origIdx ? target - 1 : target));
        newCards.splice(finalTarget, 0, card);
        setCards(newCards);
        cardsRef.current = newCards;
      }
      setInsertIndex(null);
    };

    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  // ── Share score ──
  const shareScore = () => {
    const acc = Math.round((score / Math.max(totalPlayed, 1)) * 100);
    const text = t?.shareText(score, bestStreak, acc) ||
      `🎵 Spotify Hitster Solo\n✅ ${score} correct\n🔥 Best streak: ${bestStreak}\n🎯 ${acc}% accuracy`;
    if (navigator.share) {
      navigator.share({ title: "Hitster Score", text });
    } else {
      navigator.clipboard.writeText(text);
      alert(t?.scoreCopied || "Score copied to clipboard!");
    }
  };

  // ── Game Over screen ──
  if (gameOver) {
    return (
      <div className="container">
        <h1>{ t?.gameOver || "Game Over!" }</h1>
        <div className="sp-stats">
          <div className="sp-stat"><div className="sp-stat-num">{score}</div><div className="sp-stat-label">{t?.correct || 'Correct'}</div></div>
          <div className="sp-stat"><div className="sp-stat-num">{bestStreak}</div><div className="sp-stat-label">{t?.bestStreak || 'Best Streak'}</div></div>
          <div className="sp-stat"><div className="sp-stat-num">{Math.round((score / Math.max(totalPlayed, 1)) * 100)}%</div><div className="sp-stat-label">{t?.accuracy || 'Accuracy'}</div></div>
        </div>
        <button onClick={shareScore} style={{ background: "#1DB954", marginBottom: 12 }}>{ t?.shareScore || "📤 Share Score" }</button>
        <button onClick={() => setScreen("singleplayer-setup")} style={{ background: "#444" }}>{ t?.playAgain || "Play Again" }</button>
        <button onClick={() => setScreen("start")} style={{ background: "transparent", color: "#b3b3b3", marginTop: 8 }}>{ t?.back || "← Home" }</button>
      </div>
    );
  }

  const newCardOriginalIndex = cards.findIndex(c => c.type === "new");

  return (
    <div className="container">
      <div className="game-header">
        <div>
          <h2>{ t?.soloMode_label || "Solo Mode" }</h2>
          <h3>{ t?.score || "Score" }: {score}</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          {streak >= 2 && <div className="streak-badge">🔥 {streak}</div>}
          <button onClick={() => setGameOver(true)} style={{ background: "#444", fontSize: 13, padding: "6px 12px", minWidth: "auto" }}>{ t?.end || "End" }</button>
        </div>
      </div>

      {loading && <div className="loading-card">{t?.loadingSong || "Loading song..."}</div>}

      {timeLeft !== null && (
        <div className={`timer-display ${timeLeft <= 5 ? "timer-urgent" : ""}`}>{timeLeft}s</div>
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
              if (insertIndex < origIdx && index >= insertIndex && index < origIdx) shiftY = cardH;
              else if (insertIndex > origIdx && index > origIdx && index <= insertIndex) shiftY = -cardH;
            }

            return (
              <div key={card.id} style={{ width: "100%", maxWidth: 480 }}>
                <div
                  ref={isNewCard ? dragCardRef : null}
                  className={`card ${isNewCard && revealed ? "card-expanded" : ""}`}
                  style={{
                    position: "relative",
                    zIndex: isDragged ? 1000 : 1,
                    transform: isDragged ? undefined : `translateY(${shiftY}px) scale(1)`,
                    transition: isDragged ? "none" : "transform 0.18s ease",
                    cursor: isNewCard && !revealed ? (dragging ? "grabbing" : "grab") : "default",
                    touchAction: isNewCard && !revealed ? "none" : "auto",
                    userSelect: "none"
                  }}
                  onMouseDown={isNewCard && !revealed ? handleDragStart : undefined}
                  onTouchStart={isNewCard && !revealed ? handleDragStart : undefined}
                >
                  {isNewCard ? (
                    <div className={`card-inner ${revealed ? "flipped" : ""} ${result === "correct" ? "result-correct" : ""} ${result === "wrong" ? "result-wrong" : ""}`}>
                      <div className="card-front new">
                        {localStorage.getItem("token") && (
                          <button
                            className="play-button"
                            onClick={e => { e.stopPropagation(); togglePlay(card.uri); }}
                            onMouseDown={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                            disabled={!spotifyReady}
                            title={spotifyReady ? "Play / Pause" : "Connecting to Spotify..."}
                          >
                            {playing ? "⏸" : "▶"}
                          </button>
                        )}
                        <div className="drag-hint">Drag to place</div>
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
              </div>
            );
          })}
        </div>
      )}

      <div className="action-container">
        {!revealed && !loading && (
          <button onClick={handleReveal}>{ t?.reveal || "Reveal" }</button>
        )}
        {revealed && (
          <button onClick={nextCard}>
            {t?.nextSong(result === 'correct') || (result === 'correct' ? '✅ Next Song' : '❌ Next Song')}
          </button>
        )}
      </div>
    </div>
  );
}

export default SinglePlayerGame;