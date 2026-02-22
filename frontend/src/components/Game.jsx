import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { socket } from "../socket";
import { useSpotifyPlayer } from "./useSpotifyPlayer";
import SpotifyAppPrompt from "./SpotifyAppPrompt";

function saveSession(data) {
  try { sessionStorage.setItem("hitster_session", JSON.stringify(data)); } catch {}
}
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem("hitster_session")); } catch { return null; }
}
function clearSession() {
  try { sessionStorage.removeItem("hitster_session"); } catch {}
}

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
  t,
  lang,
  isHost
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
  const [coinGiven, setCoinGiven] = useState(false);

  // Recognition (name the song for a coin)
  const [recognitionOpen, setRecognitionOpen] = useState(false);
  const [recognitionClaimed, setRecognitionClaimed] = useState(false);
  const [recognitionWinner, setRecognitionWinner] = useState(null);
  const recognitionTimerRef = useRef(null);

  // Timer
  const [timeLeft, setTimeLeft] = useState(null);
  const timerRef = useRef(null);

  const [overviewMode, setOverviewMode] = useState(false);
  const [remoteDragIndex, setRemoteDragIndex] = useState(null);

  const {
    ready: spotifyReady,
    playing,
    resetPlaying,
    togglePlay,
    stop,
    keepAlive,
    needsSpotifyApp,
    retryPlayback,
  } = useSpotifyPlayer(roomCode, isHost);

  // Drag
  const [dragging, setDragging] = useState(false);
  const [insertIndex, setInsertIndex] = useState(null);
  const [zoomed, setZoomed] = useState(false);
  const zoomRef = useRef(1);
  const zoomWrapperRef = useRef(null);
  const ZOOM_OUT = 0.55;

  // Refs
  const selectedGenresRef = useRef(selectedGenres);
  const minYearRef = useRef(minYear);
  const maxYearRef = useRef(maxYear);
  const playlistTracksRef = useRef(initialPlaylistTracks || null);
  const usedUrisRef = useRef(new Set());
  const cardsRef = useRef(cards);
  const isMyTurnRef = useRef(false);
  const revealedRef = useRef(false);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const timelineRef = useRef(null);
  const newCardRef = useRef(null);
  const dragCardRef = useRef(null);
  const insertIndexRef = useRef(null);
  const scrollIntervalRef = useRef(null);
  const dragActiveRef = useRef(false);
  const lastDragUpdateRef = useRef(0);
  const startScrollXRef = useRef(0);
  const startScrollYRef = useRef(0);

  const [horizontal, setHorizontal] = useState(
    window.innerWidth > window.innerHeight && window.innerWidth >= 768
  );

  useEffect(() => {
    const onResize = () =>
      setHorizontal(window.innerWidth > window.innerHeight && window.innerWidth >= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => { selectedGenresRef.current = selectedGenres; }, [selectedGenres]);
  useEffect(() => { minYearRef.current = minYear; }, [minYear]);
  useEffect(() => { maxYearRef.current = maxYear; }, [maxYear]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { revealedRef.current = revealed; }, [revealed]);

  const updatePlayers = (p) => { setLocalPlayers(p); setPlayers(p); };
  const currentPlayer = players[currentPlayerIndex];

  // ============================================================
  // ON MOUNT
  // ============================================================

  useEffect(() => {
    const session = loadSession();
    if (session && session.roomCode === roomCode) {
      setLocalPlayers(session.players || initialPlayers);
      setCurrentPlayerIndex(session.currentPlayerIndex || 0);
      usedUrisRef.current = new Set(session.usedUris || []);
      if (session.playlistTracks) playlistTracksRef.current = session.playlistTracks;
    } else {
      if (initialPlaylistTracks) playlistTracksRef.current = initialPlaylistTracks;
    }

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

  useEffect(() => {
    saveSession({
      roomCode,
      players,
      currentPlayerIndex,
      usedUris: Array.from(usedUrisRef.current),
      playlistTracks: playlistTracksRef.current,
    });
  }, [players, currentPlayerIndex]);

  // ============================================================
  // SOCKET LISTENERS
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
      setInsertIndex(null);
      setRemoteDragIndex(null);
      setCoins(newCoins || {});
      setMyCoinIndex(null);
      setCoinGiven(false);
      setOverviewMode(false);
      setRecognitionOpen(false);
      setRecognitionClaimed(false);
      setRecognitionWinner(null);
      clearTimeout(recognitionTimerRef.current);
      clearInterval(timerRef.current);
      setTimeLeft(null);

      // Stop music AND reset the playing indicator so the new player's
      // button starts as ▶ and not ⏸
      stop();
      resetPlaying();

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

    socket.on("card_revealed", ({ result: revealResult, cards: revealedCards }) => {
      setCards(revealedCards);
      cardsRef.current = revealedCards;
      setResult(revealResult);
      setRevealed(true);
      revealedRef.current = true;
      setRemoteDragIndex(null);
      // Wipe all coin UI the instant the card is revealed
      setMyCoinIndex(null);
      setCoins({});
      // Open recognition window for 30 s
      setRecognitionOpen(true);
      clearTimeout(recognitionTimerRef.current);
      recognitionTimerRef.current = setTimeout(() => setRecognitionOpen(false), 30000);
      setTimeout(() => {
        newCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }, 300);
    });

    socket.on("new_card_loaded", ({ cards: newCards }) => {
      if (!isMyTurnRef.current) {
        setCards(newCards);
        cardsRef.current = newCards;
        setRemoteDragIndex(null);
      }
    });

    socket.on("drag_move", ({ insertIndex: remoteIdx }) => {
      if (!isMyTurnRef.current) setRemoteDragIndex(remoteIdx);
    });

    socket.on("drag_end", ({ cards: finalCards }) => {
      if (!isMyTurnRef.current) {
        setRemoteDragIndex(null);
        if (finalCards) { setCards(finalCards); cardsRef.current = finalCards; }
      }
    });

    socket.on("coin_refunded", () => setMyCoinIndex(null));

    socket.on("recognition_claimed", ({ playerName }) => {
      setRecognitionWinner({ name: playerName });
      setRecognitionOpen(false);
      clearTimeout(recognitionTimerRef.current);
    });

    return () => {
      socket.off("turn_changed");
      socket.off("coins_updated");
      socket.off("coins_updated_players");
      socket.off("card_revealed");
      socket.off("new_card_loaded");
      socket.off("drag_move");
      socket.off("drag_end");
      socket.off("coin_refunded");
      socket.off("recognition_claimed");
    };
  }, []);

  // ============================================================
  // RECONNECTION
  // ============================================================

  useEffect(() => {
    const myPlayer = players.find(p => p.id === socket.id);
    const myName = myPlayer?.name;

    const handleReconnect = () => {
      if (!roomCode || !myName) return;
      socket.emit("rejoin_game", { code: roomCode, name: myName });
    };

    const handleRejoinSuccess = ({
      players: newPlayers, currentPlayerIndex: newIndex,
      selectedGenres: genres, minYear: min, maxYear: max,
      playlistTracks: pt, usedUris, coins: newCoins,
    }) => {
      if (genres?.length) selectedGenresRef.current = genres;
      if (min) minYearRef.current = Number(min);
      if (max) maxYearRef.current = Number(max);
      if (pt !== undefined) playlistTracksRef.current = pt;
      if (usedUris) usedUrisRef.current = new Set(usedUris);

      updatePlayers(newPlayers);
      setCurrentPlayerIndex(newIndex);
      setCoins(newCoins || {});

      const myTurn = newPlayers[newIndex]?.id === socket.id;
      isMyTurnRef.current = myTurn;
      setIsMyTurn(myTurn);

      if (myTurn && !cardsRef.current.find(c => c.type === "new")) {
        loadNewCard(newPlayers[newIndex]);
      } else if (!myTurn) {
        const c = newPlayers[newIndex]?.timeline || [];
        setCards(c); cardsRef.current = c;
      }
    };

    socket.on("connect", handleReconnect);
    socket.on("rejoin_success", handleRejoinSuccess);
    return () => {
      socket.off("connect", handleReconnect);
      socket.off("rejoin_success", handleRejoinSuccess);
    };
  }, [roomCode, players]);

  // ============================================================
  // GENERATE + LOAD CARD
  // ============================================================

  const generateCard = async () => {
    const playlist = playlistTracksRef.current;
    if (playlist && playlist.length > 0) {
      const unused = playlist.filter(t => !usedUrisRef.current.has(t.uri));
      const pool = unused.length > 0 ? unused : playlist;
      const track = pool[Math.floor(Math.random() * pool.length)];
      usedUrisRef.current.add(track.uri);
      socket.emit("mark_used", { code: roomCode, uri: track.uri });
      return { id: Date.now(), year: parseInt(track.year), name: track.name, artist: track.artist, uri: track.uri, cover: track.cover, type: "new" };
    }

    const genres = selectedGenresRef.current;
    const min = minYearRef.current;
    const max = maxYearRef.current;
    const genre = genres.length > 0 ? genres[Math.floor(Math.random() * genres.length)] : "";
    const res = await axios.get(
      `/api/track?genre=${genre}&minYear=${min}&maxYear=${max}&usedUris=${encodeURIComponent(JSON.stringify(Array.from(usedUrisRef.current)))}`
    );
    usedUrisRef.current.add(res.data.uri);
    socket.emit("mark_used", { code: roomCode, uri: res.data.uri });
    return { id: Date.now(), year: parseInt(res.data.year), name: res.data.name, artist: res.data.artist, uri: res.data.uri, cover: res.data.cover, type: "new" };
  };

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
      socket.emit("new_card_loaded", { code: roomCode, cards: newCards });
      setTimeout(() => newCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }), 120);
      keepAlive?.();

      if (timerSeconds > 0 && isMyTurnRef.current) {
        setTimeLeft(timerSeconds);
        timerRef.current = setInterval(() => {
          setTimeLeft(t => {
            if (t <= 1) { clearInterval(timerRef.current); if (!revealedRef.current) handleReveal(); return 0; }
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
  // DRAG
  // ============================================================

  const isHorizontal = () => window.innerWidth > window.innerHeight && window.innerWidth >= 768;

  const handleDragStart = (e) => {
    if (revealedRef.current || !isMyTurnRef.current) return;
    e.stopPropagation();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    startYRef.current = clientY; startXRef.current = clientX;
    draggingRef.current = false; dragActiveRef.current = true;
    const tl = timelineRef.current;
    startScrollXRef.current = tl ? tl.scrollLeft : 0;
    startScrollYRef.current = window.scrollY;
  };

  const handleDragMoveRef = useRef(null);
  const handleDragEndRef = useRef(null);

  handleDragMoveRef.current = (e) => {
    if (!dragActiveRef.current) return;
    const now = Date.now();
    if (now - lastDragUpdateRef.current < 16) return;
    lastDragUpdateRef.current = now;

    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const deltaY = clientY - startYRef.current;
    const deltaX = clientX - startXRef.current;
    const horiz = isHorizontal();

    if (!draggingRef.current) {
      const primary = horiz ? Math.abs(deltaX) : Math.abs(deltaY);
      const secondary = horiz ? Math.abs(deltaY) : Math.abs(deltaX);
      if (primary < 4) return;
      if (secondary > primary * 1.5) { dragActiveRef.current = false; return; }
      draggingRef.current = true;
      setDragging(true);
    }

    if (e.cancelable) e.preventDefault();

    if (dragCardRef.current) {
      const z = zoomRef.current;
      const tl = timelineRef.current;
      const scrollDeltaX = tl ? tl.scrollLeft - startScrollXRef.current : 0;
      const scrollDeltaY = window.scrollY - startScrollYRef.current;
      if (horiz) dragCardRef.current.style.transform = `translateX(${(deltaX + scrollDeltaX) / z}px)`;
      else dragCardRef.current.style.transform = `translateY(${(deltaY + scrollDeltaY) / z}px)`;
      dragCardRef.current.style.scale = "1.04";
      dragCardRef.current.style.boxShadow = "0 28px 70px rgba(29,185,84,0.55)";
      dragCardRef.current.style.zIndex = "1000";
    }

    const SCROLL_ZONE = 120;
    const MAX_SPEED = 22;
    cancelAnimationFrame(scrollIntervalRef.current);

    const timeline = timelineRef.current;
    if (timeline) {
      const tlRect = timeline.getBoundingClientRect();
      let direction = 0; let proximity = 0;
      if (horiz) {
        if (clientX < tlRect.left + SCROLL_ZONE) { direction = -1; proximity = 1 - ((clientX - tlRect.left) / SCROLL_ZONE); }
        else if (clientX > tlRect.right - SCROLL_ZONE) { direction = 1; proximity = 1 - ((tlRect.right - clientX) / SCROLL_ZONE); }
        if (direction !== 0) {
          const speed = Math.max(1, Math.pow(proximity, 2) * MAX_SPEED);
          const tick = () => { const tl2 = timelineRef.current; if (!tl2 || !draggingRef.current) return; tl2.scrollLeft += direction * speed; scrollIntervalRef.current = requestAnimationFrame(tick); };
          scrollIntervalRef.current = requestAnimationFrame(tick);
        }
      } else {
        if (clientY < SCROLL_ZONE && tlRect.top < 0) { direction = -1; proximity = 1 - (clientY / SCROLL_ZONE); }
        else if (clientY > window.innerHeight - SCROLL_ZONE && tlRect.bottom > window.innerHeight) { direction = 1; proximity = 1 - ((window.innerHeight - clientY) / SCROLL_ZONE); }
        if (direction !== 0) {
          const speed = Math.max(1, Math.pow(proximity, 2) * MAX_SPEED);
          const tick = () => { const tl2 = timelineRef.current; if (!tl2 || !draggingRef.current) return; const r = tl2.getBoundingClientRect(); if (direction === -1 && r.top >= 0) return; if (direction === 1 && r.bottom <= window.innerHeight) return; window.scrollBy(0, direction * speed); scrollIntervalRef.current = requestAnimationFrame(tick); };
          scrollIntervalRef.current = requestAnimationFrame(tick);
        }
      }
    }

    const currentCards = cardsRef.current;
    const newIdx = currentCards.findIndex(c => c.type === "new");
    if (!dragCardRef.current || !timelineRef.current) return;

    const draggedRect = dragCardRef.current.getBoundingClientRect();
    const allCardEls = timelineRef.current.querySelectorAll(".card");
    const fixedCardEl = Array.from(allCardEls).find((el, i) => currentCards[i]?.type !== "new");
    const fixedMidpoints = [];
    currentCards.forEach((c, i) => {
      if (c.type !== "new" && allCardEls[i]) {
        const r = allCardEls[i].getBoundingClientRect();
        fixedMidpoints.push({ mid: horiz ? r.left + r.width / 2 : r.top + r.height / 2, originalIndex: i });
      }
    });

    const draggedCenter = horiz ? draggedRect.left + draggedRect.width / 2 : draggedRect.top + draggedRect.height / 2;
    let fixedSlot = fixedMidpoints.length;
    for (let i = 0; i < fixedMidpoints.length; i++) { if (draggedCenter < fixedMidpoints[i].mid) { fixedSlot = i; break; } }
    let arraySlot = fixedSlot <= newIdx ? fixedSlot : fixedSlot + 1;
    arraySlot = Math.max(0, Math.min(currentCards.length, arraySlot));
    insertIndexRef.current = arraySlot;
    setInsertIndex(prev => prev === arraySlot ? prev : arraySlot);
    socket.emit("drag_move", { code: roomCode, insertIndex: arraySlot });
  };

  handleDragEndRef.current = () => {
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
    startYRef.current = 0; startXRef.current = 0;

    socket.emit("drag_end", { code: roomCode, cards: reordered });
    const finalNewIdx = reordered.findIndex(c => c.type === "new");
    socket.emit("card_moved", { code: roomCode, finalInsertIndex: finalNewIdx });
  };

  useEffect(() => {
    const onMove = (e) => handleDragMoveRef.current(e);
    const onEnd = () => handleDragEndRef.current();
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

  // ============================================================
  // REVEAL
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
    setCoins({}); // wipe coin UI immediately for active player too

    let correct = true;
    if (left && left.year > newCard.year) correct = false;
    if (right && right.year < newCard.year) correct = false;

    const revealResult = correct ? "correct" : "wrong";
    setResult(revealResult);

    socket.emit("reveal_card", { code: roomCode, result: revealResult, cards: currentCards });

    setTimeout(() => newCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }), 300);

    if (!correct) { setTimeout(() => setShowNextButton(true), 800); return; }

    const updatedTimeline = currentCards.map(c => c.id === newCard.id ? { ...c, type: "fixed" } : c);
    const updatedPlayers = [...players];
    updatedPlayers[currentPlayerIndex] = { ...currentPlayer, timeline: updatedTimeline, score: currentPlayer.score + 1 };
    updatePlayers(updatedPlayers);
    socket.emit("update_timeline", { code: roomCode, timeline: updatedTimeline, score: currentPlayer.score + 1 });

    if (updatedPlayers[currentPlayerIndex].score >= winGoal) {
      clearSession(); setWinner(updatedPlayers[currentPlayerIndex]); setScreen("winner"); return;
    }
    setTimeout(() => setShowNextButton(true), 800);
  };

  // ============================================================
  // COINS
  // ============================================================

  const giveCoin = () => { setCoinGiven(true); socket.emit("give_coin", { code: roomCode }); };
  const placeCoin = (idx) => { setMyCoinIndex(idx); socket.emit("place_coin", { code: roomCode, insertIndex: idx }); };
  const removeCoin = () => { setMyCoinIndex(null); socket.emit("remove_coin", { code: roomCode }); };

  // ============================================================
  // RECOGNITION
  // ============================================================

  const claimRecognition = () => {
    if (recognitionClaimed) return;
    setRecognitionClaimed(true);
    setRecognitionOpen(false);
    clearTimeout(recognitionTimerRef.current);
    socket.emit("claim_recognition", { code: roomCode });
  };

  // ============================================================
  // NEXT TURN
  // ============================================================

  const nextTurn = () => {
    const currentCards = cardsRef.current;
    const newCardIndex = currentCards.findIndex(c => c.type === "new");
    const newCard = newCardIndex !== -1 ? currentCards[newCardIndex] : null;
    socket.emit("resolve_coins", { code: roomCode, activeCorrect: result === "correct", activeInsertIndex: newCardIndex, newCard });
  };

  // ============================================================
  // COIN SLOT RENDERER
  // ============================================================

  const renderCoinSlot = (slotIndex, isAdjacentToNewCard) => {
    if (isMyTurn) return null;            // active player never sees slots
    if (revealed) return null;            // disappear the instant card is revealed
    if (remoteDragIndex !== null) return null; // hide while card is being dragged
    if (isAdjacentToNewCard) return null; // no betting where the card already sits

    const coinsHere = coinsBySlot[slotIndex] || 0;
    const myHere = myCoinIndex === slotIndex;
    const othersCount = coinsHere - (myHere ? 1 : 0);

    return (
      <div
        key={`coin-slot-${slotIndex}`}
        className="coin-slot-wrapper"
        style={{
          display: "flex",
          flexDirection: horizontal ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          width: horizontal ? 44 : "100%",
          minWidth: horizontal ? 44 : undefined,
          height: horizontal ? "100%" : 44,
          minHeight: horizontal ? undefined : 44,
          flexShrink: 0,
          gap: 4,
        }}
      >
        {othersCount > 0 && (
          <div style={{ fontSize: 16, lineHeight: 1 }}>{"🪙".repeat(Math.min(othersCount, 5))}</div>
        )}
        {myHere ? (
          <button className="coin-btn coin-placed" onClick={removeCoin} style={{ margin: 0 }}>🪙</button>
        ) : !hasCoinPlaced && myCoins > 0 ? (
          <button className="coin-btn coin-plus" onClick={() => placeCoin(slotIndex)} style={{ margin: 0 }}>+</button>
        ) : null}
      </div>
    );
  };

  // ============================================================
  // UI
  // ============================================================

  if (!currentPlayer) return <div className="container">Waiting for players...</div>;

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

  const activeDragIdx = isMyTurn ? (dragging ? insertIndex : null) : remoteDragIndex;
  const isDragActive = activeDragIdx !== null && !revealed;

  if (overviewMode) {
    const myTimeline = myPlayer?.timeline || [];
    return (
      <div className="container">
        <div style={{ width: "100%", maxWidth: 480, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>My Timeline</h2>
          <button onClick={() => setOverviewMode(false)} style={{ minWidth: "unset", padding: "8px 16px", fontSize: 14 }}>✕ Close</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%", maxWidth: 480, paddingBottom: 40 }}>
          {myTimeline.sort((a, b) => a.year - b.year).map(card => (
            <div key={card.id} style={{ background: "#2a2a2a", borderRadius: 12, padding: "12px 8px", textAlign: "center", border: "2px solid #333", fontSize: 22, fontWeight: 800, color: "#1DB954" }}>
              {card.year}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="game-header">
        <div>
          <button
            onClick={() => { if (window.confirm(lang === "de" ? "Spiel wirklich verlassen?" : "Leave the game?")) { clearSession(); stop(); setScreen("start"); } }}
            style={{ minWidth: "unset", padding: "6px 12px", fontSize: 13, background: "#333", boxShadow: "none", margin: "0 0 6px 0" }}
          >🏠</button>
          <h2 style={{ margin: 0 }}>{currentPlayer.name}'s Turn</h2>
          <h3>{isMyTurn ? t?.yourTurn || "Your turn!" : t?.waitingFor?.(currentPlayer.name) || `Waiting for ${currentPlayer.name}...`}</h3>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {!isMyTurn && <div className="coin-display">🪙 <span>{myCoins}</span></div>}
          <button onClick={() => setOverviewMode(true)} style={{ minWidth: "unset", padding: "6px 12px", fontSize: 12, background: "#333", boxShadow: "none", margin: 0 }}>
            📋 My Cards
          </button>
        </div>
      </div>

      {loading && <div className="loading-card">{t?.loadingSong || "Loading song..."}</div>}

      {/* SpotifyAppPrompt only shown to the active player */}
      {needsSpotifyApp && isMyTurn && <SpotifyAppPrompt onRetry={retryPlayback} lang={lang} />}

      {timeLeft !== null && isMyTurn && (
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
                zoomWrapperRef.current.style.width = next ? "180%" : "";
                zoomWrapperRef.current.style.minWidth = next ? "180%" : "";
                zoomWrapperRef.current.style.height = "";
              } else {
                const natural = timelineRef.current.scrollHeight;
                zoomWrapperRef.current.style.height = next ? `${natural * ZOOM_OUT}px` : "";
                zoomWrapperRef.current.style.width = "";
                zoomWrapperRef.current.style.minWidth = "";
              }
            }
          });
        }}
        title={zoomed ? "Zoom in" : "Zoom out"}
      >{zoomed ? "🔍" : "🔎"}</button>

      {!loading && (
        <div className="timeline-zoom-wrapper" ref={zoomWrapperRef}>
          <div
            className="timeline"
            ref={timelineRef}
            style={{
              paddingBottom: horizontal ? 0 : "100px",
              paddingRight: horizontal ? "100px" : 0,
              flexDirection: horizontal ? "row" : "column",
              alignItems: horizontal ? "center" : undefined,
              ...(zoomed ? { transform: `scale(${ZOOM_OUT})` } : {})
            }}
          >
            {/* Slot 0: before all cards. Adjacent to new card if new card is at index 0. */}
            {renderCoinSlot(0, newCardOriginalIndex === 0)}

            {cards.map((card, index) => {
              const isNewCard = card.type === "new";
              const isDragged = isNewCard && dragging && isMyTurn;

              let shiftX = 0; let shiftY = 0;
              if (isDragActive && newCardOriginalIndex >= 0) {
                const origIdx = newCardOriginalIndex;
                const allCardEls = timelineRef.current?.querySelectorAll(".card");
                const fixedCardEl = allCardEls ? Array.from(allCardEls).find((el, i) => cards[i]?.type !== "new") : null;
                const cardW = (fixedCardEl?.getBoundingClientRect().width || 200) + 12;
                const cardH = (fixedCardEl?.getBoundingClientRect().height || 180) + 16;

                if (isNewCard && !isMyTurn) {
                  const diff = activeDragIdx <= origIdx ? -(origIdx - activeDragIdx) : activeDragIdx - origIdx - 1;
                  if (horizontal) shiftX = diff * cardW; else shiftY = diff * cardH;
                } else if (!isNewCard) {
                  if (horizontal) {
                    if (activeDragIdx <= origIdx && index >= activeDragIdx && index < origIdx) shiftX = cardW;
                    else if (activeDragIdx > origIdx + 1 && index > origIdx && index < activeDragIdx) shiftX = -cardW;
                  } else {
                    if (activeDragIdx <= origIdx && index >= activeDragIdx && index < origIdx) shiftY = cardH;
                    else if (activeDragIdx > origIdx + 1 && index > origIdx && index < activeDragIdx) shiftY = -cardH;
                  }
                }
              }

              const isFirstCardBelowNew = !horizontal && revealed && index === newCardOriginalIndex + 1;
              const spectatorDragging = isNewCard && !isMyTurn && isDragActive;

              // Slot after this card is adjacent to the new card if:
              // - this IS the new card (slot immediately after it), OR
              // - the card right after this is the new card (slot immediately before it)
              const slotAfterIsAdjacent =
                isNewCard ||
                (newCardOriginalIndex >= 0 && index + 1 === newCardOriginalIndex);

              return (
                <div
                  key={card.id}
                  style={{
                    display: "flex",
                    flexDirection: horizontal ? "row" : "column",
                    alignItems: "center",
                    marginTop: isFirstCardBelowNew ? "220px" : undefined,
                    transition: "margin-top 0.3s ease",
                    flexShrink: 0,
                  }}
                >
                  {isNewCard && !revealed && isMyTurn ? (
                    /* ── Active player draggable card ── */
                    <div
                      className="drag-wrapper"
                      style={{ touchAction: "none", userSelect: "none" }}
                      onMouseDown={handleDragStart}
                      onTouchStart={(e) => { e.preventDefault(); handleDragStart(e); }}
                      onTouchMove={(e) => e.preventDefault()}
                    >
                      <div
                        ref={(el) => { dragCardRef.current = el; newCardRef.current = el; }}
                        className="card new-card-unrevealed"
                        style={{ position: "relative", zIndex: isDragged ? 1000 : 1, transition: "none", cursor: dragging ? "grabbing" : "grab", userSelect: "none", touchAction: "none" }}
                      >
                        <div className={`card-inner ${result === "correct" ? "result-correct" : ""} ${result === "wrong" ? "result-wrong" : ""}`}>
                          <div className="card-front new">
                            <button
                              className="play-button"
                              onClick={(e) => { e.stopPropagation(); togglePlay(card.uri); }}
                              onMouseDown={e => e.stopPropagation()}
                              onTouchStart={e => e.stopPropagation()}
                              disabled={!spotifyReady}
                            >{playing ? "⏸" : "▶"}</button>
                            <div className="drag-hint">{t?.dragToPlace || "Drag to place"}</div>
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
                    /* ── Spectator / fixed / revealed card ── */
                    <div
                      ref={isNewCard ? (el) => { newCardRef.current = el; } : null}
                      className={`card ${isNewCard ? "new-card-unrevealed" : "small-fixed"} ${isNewCard && revealed ? (horizontal ? "card-expanded-horizontal" : "card-expanded") : ""}`}
                      style={{
                        position: "relative",
                        zIndex: spectatorDragging ? 100 : (isNewCard && revealed ? 100 : 1),
                        transform: `translate(${shiftX}px, ${shiftY}px)`,
                        transition: "transform 0.15s ease, box-shadow 0.15s ease, scale 0.15s ease",
                        cursor: "default",
                        userSelect: "none",
                        ...(spectatorDragging ? { boxShadow: "0 20px 50px rgba(29,185,84,0.5)", scale: "1.03" } : {}),
                      }}
                    >
                      {isNewCard ? (
                        <div className={`card-inner ${revealed ? "flipped" : ""} ${result === "correct" ? "result-correct" : ""} ${result === "wrong" ? "result-wrong" : ""}`}>
                          {/* Spectator front: no play button, just player name */}
                          <div className="card-front new" style={{ gap: 10 }}>
                            <div style={{ fontSize: 32, opacity: 0.7 }}>🎵</div>
                            <div style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: "rgba(255,255,255,0.92)",
                              textAlign: "center",
                              padding: "0 14px",
                              lineHeight: 1.35,
                              textTransform: "none",
                              letterSpacing: 0,
                            }}>
                              {currentPlayer.name}'s Card
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
                        <div className="card-front fixed"><div>{card.year}</div></div>
                      )}
                    </div>
                  )}

                  {/* Coin slot after each card */}
                  {renderCoinSlot(index + 1, slotAfterIsAdjacent)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recognition banner (non-active players only, after reveal) ── */}
      {revealed && !isMyTurn && (
        <div style={{
          width: "100%", maxWidth: 480, margin: "12px auto 0",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16, padding: "14px 18px", textAlign: "center",
        }}>
          {recognitionWinner ? (
            <div style={{ fontSize: 14, color: "#1DB954", fontWeight: 700 }}>
              🎤 {recognitionWinner.name} {lang === "de" ? "kannte den Song!" : "knew the song!"} +1 🪙
            </div>
          ) : recognitionOpen && !recognitionClaimed ? (
            <>
              <div style={{ fontSize: 13, color: "#b3b3b3", marginBottom: 10 }}>
                {lang === "de"
                  ? "Hast du den Song erkannt, bevor er aufgedeckt wurde?"
                  : "Did you recognize the song before it was revealed?"}
              </div>
              <button
                onClick={claimRecognition}
                style={{
                  padding: "10px 24px", fontSize: 14, minWidth: "unset",
                  background: "linear-gradient(135deg, #f0c040, #e0a020)",
                  color: "#1a1a1a", fontWeight: 700,
                }}
              >
                🎤 {lang === "de" ? "Ich hab's gewusst! +1 🪙" : "I knew it! +1 🪙"}
              </button>
            </>
          ) : recognitionClaimed ? (
            <div style={{ fontSize: 14, color: "#f0c040", fontWeight: 700 }}>
              🎤 {lang === "de" ? "Anerkannt! Du bekommst eine Münze." : "Claimed! You get a coin."}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#555" }}>
              {lang === "de" ? "Erkennungs-Fenster abgelaufen" : "Recognition window closed"}
            </div>
          )}
        </div>
      )}

      <div className="action-container">
        {isMyTurn && !revealed && !loading && (
          <button onClick={handleReveal}>{t?.reveal || "Reveal"}</button>
        )}
        {isMyTurn && showNextButton && (
          <button onClick={nextTurn}>{t?.nextPlayer || "Next Player"}</button>
        )}
        {isNextPlayer && revealed && !coinGiven && (
          <button className="give-coin-btn" onClick={giveCoin}>
            {t?.giveCoin?.(currentPlayer.name) || `🎤 Give coin to ${currentPlayer.name}`}
          </button>
        )}
      </div>
    </div>
  );
}

export default Game;