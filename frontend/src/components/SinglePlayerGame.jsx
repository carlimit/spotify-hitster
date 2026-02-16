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
  const [result, setResult] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalPlayed, setTotalPlayed] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const { ready: spotifyReady, playing, togglePlay, stop } = useSpotifyDirect();

  // Drag
  const [dragging, setDragging] = useState(false);
  const [insertIndex, setInsertIndex] = useState(null);
  const [zoomed, setZoomed] = useState(false);
  const zoomRef = useRef(1);          // 1 = normal, ZOOM_OUT = zoomed
  const zoomWrapperRef = useRef(null);
  const ZOOM_OUT = 0.55;

  const cardsRef = useRef(cards);
  const revealedRef = useRef(false);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const timelineRef = useRef(null);
  const timerRef = useRef(null);
  const usedUrisRef = useRef(new Set());
  const playlistRef = useRef(playlistTracks || null);
  const genresRef = useRef(selectedGenres);
  const minYearRef = useRef(minYear);
  const maxYearRef = useRef(maxYear);
  const dragCardRef = useRef(null);
  const insertIndexRef = useRef(null);
  const scrollIntervalRef = useRef(null);
  const dragActiveRef = useRef(false);
  const newCardRef = useRef(null);

  // Scroll position recorded at drag-start for drift-free card movement
  const startScrollXRef = useRef(0);
  const startScrollYRef = useRef(0);

  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { revealedRef.current = revealed; }, [revealed]);

  const isHorizontal = () =>
    window.innerWidth > window.innerHeight && window.innerWidth >= 768;

  const generateCard = async () => {
    const playlist = playlistRef.current;

    if (playlist && playlist.length > 0) {
      const unused = playlist.filter(t => !usedUrisRef.current.has(t.uri));
      const pool = unused.length > 0 ? unused : playlist;
      const track = pool[Math.floor(Math.random() * pool.length)];
      usedUrisRef.current.add(track.uri);
      return { id: Date.now(), year: parseInt(track.year), name: track.name, artist: track.artist, uri: track.uri, cover: track.cover, type: "new" };
    }

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
    const res = await axios.get(`/api/track?genre=${genre}&minYear=${minYearRef.current}&maxYear=${maxYearRef.current}`);
    return { id: Date.now(), year: parseInt(res.data.year), name: res.data.name, artist: res.data.artist, uri: res.data.uri, cover: res.data.cover, type: "new" };
  };

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
      const midIdx = Math.floor(existingTimeline.length / 2);
      const newCards = [
        ...existingTimeline.slice(0, midIdx),
        card,
        ...existingTimeline.slice(midIdx)
      ];
      setCards(newCards);
      cardsRef.current = newCards;

      setTimeout(() => {
        newCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }, 120);

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

    setTimeout(() => {
      newCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }, 300);
  };

  const handleReveal = () => doReveal(cardsRef.current);

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

  const handleDragStart = useCallback((e) => {
    if (revealedRef.current) return;
    e.stopPropagation();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    startYRef.current = clientY;
    startXRef.current = clientX;
    draggingRef.current = false;
    dragActiveRef.current = true;

    // Snapshot scroll position so we can compensate for auto-scroll drift
    const tl = timelineRef.current;
    startScrollXRef.current = tl ? tl.scrollLeft : 0;
    startScrollYRef.current = window.scrollY;
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragActiveRef.current) return;

      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const deltaY = clientY - startYRef.current;
      const deltaX = clientX - startXRef.current;
      const horizontal = isHorizontal();

      if (!draggingRef.current) {
        const primary = horizontal ? Math.abs(deltaX) : Math.abs(deltaY);
        const secondary = horizontal ? Math.abs(deltaY) : Math.abs(deltaX);
        if (primary < 3) return;
        if (secondary > primary * 1.5) {
          dragActiveRef.current = false;
          return;
        }
        draggingRef.current = true;
        setDragging(true);
      }

      if (e.cancelable) e.preventDefault();

      if (dragCardRef.current) {
        const z = zoomRef.current;
        const tl = timelineRef.current;
        const scrollDeltaX = tl ? tl.scrollLeft - startScrollXRef.current : 0;
        const scrollDeltaY = window.scrollY - startScrollYRef.current;

        if (horizontal) {
          dragCardRef.current.style.transform = `translateX(${(deltaX + scrollDeltaX) / z}px)`;
          dragCardRef.current.style.scale = "1.04";
        } else {
          dragCardRef.current.style.transform = `translateY(${(deltaY + scrollDeltaY) / z}px)`;
          dragCardRef.current.style.scale = "1.04";
        }
        dragCardRef.current.style.boxShadow = "0 28px 70px rgba(29,185,84,0.55)";
        dragCardRef.current.style.zIndex = "1000";
      }

      const SCROLL_ZONE = 120;
      const MAX_SPEED = 22;
      cancelAnimationFrame(scrollIntervalRef.current);

      const timeline = timelineRef.current;
      if (timeline) {
        const tlRect = timeline.getBoundingClientRect();
        let direction = 0;
        let proximity = 0;

        if (horizontal) {
          if (clientX < tlRect.left + SCROLL_ZONE) {
            direction = -1;
            proximity = 1 - ((clientX - tlRect.left) / SCROLL_ZONE);
          } else if (clientX > tlRect.right - SCROLL_ZONE) {
            direction = 1;
            proximity = 1 - ((tlRect.right - clientX) / SCROLL_ZONE);
          }
          if (direction !== 0) {
            const speed = Math.max(1, Math.pow(proximity, 2) * MAX_SPEED);
            const tick = () => {
              const tl = timelineRef.current;
              if (!tl || !draggingRef.current) return;
              tl.scrollLeft += direction * speed;
              scrollIntervalRef.current = requestAnimationFrame(tick);
            };
            scrollIntervalRef.current = requestAnimationFrame(tick);
          }
        } else {
          if (clientY < SCROLL_ZONE && tlRect.top < 0) {
            direction = -1;
            proximity = 1 - (clientY / SCROLL_ZONE);
          } else if (clientY > window.innerHeight - SCROLL_ZONE && tlRect.bottom > window.innerHeight) {
            direction = 1;
            proximity = 1 - ((window.innerHeight - clientY) / SCROLL_ZONE);
          }
          if (direction !== 0) {
            const speed = Math.max(1, Math.pow(proximity, 2) * MAX_SPEED);
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
      }

      const currentCards = cardsRef.current;
      const newIdx = currentCards.findIndex(c => c.type === "new");
      if (!dragCardRef.current || !timelineRef.current) return;

      const draggedRect = dragCardRef.current.getBoundingClientRect();
      const allCardEls = timelineRef.current.querySelectorAll(".card");
      const fixedMidpoints = [];

      currentCards.forEach((c, i) => {
        if (c.type !== "new" && allCardEls[i]) {
          const r = allCardEls[i].getBoundingClientRect();
          fixedMidpoints.push({
            mid: horizontal ? r.left + r.width / 2 : r.top + r.height / 2,
            originalIndex: i
          });
        }
      });

      const draggedCenter = horizontal
        ? draggedRect.left + draggedRect.width / 2
        : draggedRect.top + draggedRect.height / 2;

      let fixedSlot = fixedMidpoints.length;
      for (let i = 0; i < fixedMidpoints.length; i++) {
        if (draggedCenter < fixedMidpoints[i].mid) { fixedSlot = i; break; }
      }
      let arraySlot = fixedSlot <= newIdx ? fixedSlot : fixedSlot + 1;
      arraySlot = Math.max(0, Math.min(currentCards.length, arraySlot));
      insertIndexRef.current = arraySlot;
      setInsertIndex(prev => prev === arraySlot ? prev : arraySlot);
    };

    const onEnd = () => {
      if (!dragActiveRef.current) return;
      dragActiveRef.current = false;

      if (!draggingRef.current) return;
      draggingRef.current = false;

      cancelAnimationFrame(scrollIntervalRef.current);

      if (dragCardRef.current) {
        dragCardRef.current.style.transform = "";
        dragCardRef.current.style.scale = "";
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
      setInsertIndex(null);
      insertIndexRef.current = null;
      startYRef.current = 0;
      startXRef.current = 0;
    };

    window.addEventListener("mousemove", onMove, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

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

  if (gameOver) {
    return (
      <div className="container">
        <h1>{t?.gameOver || "Game Over!"}</h1>
        <div className="sp-stats">
          <div className="sp-stat"><div className="sp-stat-num">{score}</div><div className="sp-stat-label">{t?.correct || 'Correct'}</div></div>
          <div className="sp-stat"><div className="sp-stat-num">{bestStreak}</div><div className="sp-stat-label">{t?.bestStreak || 'Best Streak'}</div></div>
          <div className="sp-stat"><div className="sp-stat-num">{Math.round((score / Math.max(totalPlayed, 1)) * 100)}%</div><div className="sp-stat-label">{t?.accuracy || 'Accuracy'}</div></div>
        </div>
        <button onClick={shareScore} style={{ background: "#1DB954", marginBottom: 12 }}>{t?.shareScore || "📤 Share Score"}</button>
        <button onClick={() => setScreen("singleplayer-setup")} style={{ background: "#444" }}>{t?.playAgain || "Play Again"}</button>
        <button onClick={() => setScreen("start")} style={{ background: "transparent", color: "#b3b3b3", marginTop: 8 }}>{t?.back || "← Home"}</button>
      </div>
    );
  }

  const newCardOriginalIndex = cards.findIndex(c => c.type === "new");

  return (
    <div className="container">
      <div className="game-header">
        <div>
          <h2>{t?.soloMode_label || "Solo Mode"}</h2>
          <h3>{t?.score || "Score"}: {score}</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          {streak >= 2 && <div className="streak-badge">🔥 {streak}</div>}
          <button onClick={() => setGameOver(true)} style={{ background: "#444", fontSize: 13, padding: "6px 12px", minWidth: "auto" }}>{t?.end || "End"}</button>
        </div>
      </div>

      {loading && <div className="loading-card">{t?.loadingSong || "Loading song..."}</div>}

      {timeLeft !== null && (
        <div className={`timer-display ${timeLeft <= 5 ? "timer-urgent" : ""}`}>{timeLeft}s</div>
      )}

      <button
        className="zoom-btn"
        onClick={() => {
          const next = !zoomed;
          setZoomed(next);
          zoomRef.current = next ? ZOOM_OUT : 1;
          requestAnimationFrame(() => {
            if (zoomWrapperRef.current && timelineRef.current) {
              const isLandscape = window.innerWidth > window.innerHeight && window.innerWidth >= 768;
              if (isLandscape) {
  // Remove width constraints - let timeline be as wide as it needs
  zoomWrapperRef.current.style.width = "200%";
  zoomWrapperRef.current.style.minWidth = "200%";
  zoomWrapperRef.current.style.height = "";
} else {
                const natural = timelineRef.current.scrollHeight;
                zoomWrapperRef.current.style.height = next
                  ? `${natural * ZOOM_OUT}px`
                  : "";
                zoomWrapperRef.current.style.width = "";
                zoomWrapperRef.current.style.minWidth = "";
              }
            }
          });
        }}
        title={zoomed ? "Zoom in" : "Zoom out"}
      >
        {zoomed ? "🔍" : "🔎"}
      </button>

      {!loading && (
        <div
          className="timeline-zoom-wrapper"
          ref={zoomWrapperRef}
        >
        <div
          className="timeline"
          ref={timelineRef}
          style={zoomed ? { transform: `scale(${ZOOM_OUT})` } : {}}
        >
          {cards.map((card, index) => {
            const isNewCard = card.type === "new";
            const isDragged = isNewCard && dragging;
            const horizontal = isHorizontal();

            let shiftY = 0;
            let shiftX = 0;
            if (dragging && !isNewCard && insertIndex !== null) {
              const origIdx = newCardOriginalIndex;
              const cardEls = timelineRef.current?.querySelectorAll(".card");
              if (horizontal) {
                const cardW = (cardEls?.[0]?.getBoundingClientRect().width || 200) + 12;
                if (insertIndex <= origIdx && index >= insertIndex && index < origIdx) shiftX = cardW;
                else if (insertIndex > origIdx + 1 && index > origIdx && index < insertIndex) shiftX = -cardW;
              } else {
                const cardH = (cardEls?.[0]?.getBoundingClientRect().height || 180) + 16;
                if (insertIndex <= origIdx && index >= insertIndex && index < origIdx) shiftY = cardH;
                else if (insertIndex > origIdx + 1 && index > origIdx && index < insertIndex) shiftY = -cardH;
              }
            }

            return (
              <div key={card.id} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
                {isNewCard && !revealed ? (
                  <div
                    className="drag-wrapper"
                    style={{
                      touchAction: "none",
                      userSelect: "none",
                    }}
                    onMouseDown={handleDragStart}
                    onTouchStart={handleDragStart}
                  >
                    <div
                      ref={(el) => { dragCardRef.current = el; newCardRef.current = el; }}
                      className={`card new-card-unrevealed`}
                      style={{
                        position: "relative",
                        zIndex: isDragged ? 1000 : 1,
                        transition: isDragged ? "none" : "transform 0.18s ease",
                        cursor: dragging ? "grabbing" : "grab",
                        userSelect: "none",
                        touchAction: "none",
                      }}
                    >
                      <div className={`card-inner ${result === "correct" ? "result-correct" : ""} ${result === "wrong" ? "result-wrong" : ""}`}>
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
                    </div>
                  </div>
                ) : (
                  <div
                    ref={isNewCard ? (el) => { newCardRef.current = el; } : null}
                    className={`card ${isNewCard ? "new-card-unrevealed" : "small-fixed"} ${isNewCard && revealed ? (horizontal ? "card-expanded-horizontal" : "card-expanded") : ""}`}
                    style={{
                      position: "relative",
                      zIndex: isNewCard && revealed ? 100 : 1,
                      transform: `translate(${shiftX}px, ${shiftY}px) scale(1)`,
                      transition: "transform 0.18s ease",
                      cursor: "default",
                      userSelect: "none",
                    }}
                  >
                    {isNewCard ? (
                      <div className={`card-inner flipped ${result === "correct" ? "result-correct" : ""} ${result === "wrong" ? "result-wrong" : ""}`}>
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
                )}
              </div>
            );
          })}
        </div>
        </div>
      )}

      <div className="action-container">
        {!revealed && !loading && (
          <button onClick={handleReveal}>{t?.reveal || "Reveal"}</button>
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