import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

const MEDALS = ["🥇", "🥈", "🥉"];
const PLACE_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];
const PLACE_LABELS = { en: ["1st Place", "2nd Place", "3rd Place"], de: ["1. Platz", "2. Platz", "3. Platz"] };

function Confetti() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: Math.random() * 10 + 6,
      h: Math.random() * 5 + 4,
      color: ["#1DB954", "#FFD700", "#ff4d6d", "#4fc3f7", "#f9a825", "#ce93d8"][Math.floor(Math.random() * 6)],
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.15,
      vx: (Math.random() - 0.5) * 2,
      vy: Math.random() * 3 + 1.5,
    }));

    let frame;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        if (p.y > canvas.height) { p.y = -20; p.x = Math.random() * canvas.width; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}
    />
  );
}

function Winner({ winner: players, onBack, t, lang }) {
  const [visible, setVisible] = useState(false);
  const myId = socket.id;

  // players is now a sorted array (host sends it via game_over)
  // Fall back gracefully if somehow still the old single-winner format
  const sortedPlayers = Array.isArray(players)
    ? players
    : players
    ? [players]
    : [];

  const myIndex = sortedPlayers.findIndex(p => p.id === myId);
  const myPlace = myIndex + 1; // 1-based

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  const placeLabel = (i) => {
    const labels = PLACE_LABELS[lang] || PLACE_LABELS.en;
    return labels[i] || `${i + 1}${lang === "de" ? "." : i === 3 ? "th" : i === 2 ? "rd" : "th"} ${lang === "de" ? "Platz" : "Place"}`;
  };

  const myPlaceBanner = () => {
    if (myIndex === -1) return null;
    if (myIndex === 0) return lang === "de" ? "Du hast gewonnen! 🎉" : "You won! 🎉";
    return lang === "de"
      ? `Du bist auf Platz ${myPlace}! ${MEDALS[myIndex] || "🎖"}`
      : `You finished ${myPlace === 2 ? "2nd" : myPlace === 3 ? "3rd" : `${myPlace}th`}! ${MEDALS[myIndex] || "🎖"}`;
  };

  const cardLabel = (score) => {
    const n = (score || 0) + 1; // +1 for starting card
    if (lang === "de") return `${n} Karte${n !== 1 ? "n" : ""}`;
    return `${n} card${n !== 1 ? "s" : ""}`;
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px 80px", position: "relative", overflow: "hidden" }}>
      <Confetti />

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>

        {/* Title */}
        <div style={{
          fontSize: "clamp(36px, 10vw, 56px)",
          fontWeight: 900,
          textAlign: "center",
          background: "linear-gradient(135deg, #FFD700, #ff9500)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          marginBottom: 6,
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.7)",
          transition: "opacity 0.5s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
          {t?.winner || "🎉 Game Over!"}
        </div>

        {/* My place banner */}
        {myPlaceBanner() && (
          <div style={{
            fontSize: "clamp(16px, 5vw, 22px)",
            fontWeight: 700,
            color: myIndex === 0 ? "#FFD700" : "#e0e0e0",
            marginBottom: 28,
            textAlign: "center",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(12px)",
            transition: "opacity 0.5s ease 0.15s, transform 0.5s ease 0.15s",
          }}>
            {myPlaceBanner()}
          </div>
        )}

        {/* Podium: top 3 */}
        {sortedPlayers.length > 1 && (
          <div style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 8,
            marginBottom: 28,
            width: "100%",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.6s ease 0.2s, transform 0.6s ease 0.2s",
          }}>
            {/* Reorder for podium: 2nd, 1st, 3rd */}
            {[1, 0, 2].map(i => {
              const p = sortedPlayers[i];
              if (!p) return <div key={i} style={{ flex: 1 }} />;
              const isMe = p.id === myId;
              const height = i === 0 ? 120 : i === 1 ? 90 : 70;
              const fontSize = i === 0 ? 40 : 32;
              return (
                <div key={p.id} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  {/* Medal + name */}
                  <div style={{ fontSize, lineHeight: 1 }}>{MEDALS[i] || "🎖"}</div>
                  <div style={{
                    fontSize: 13,
                    fontWeight: isMe ? 800 : 600,
                    color: isMe ? "#1DB954" : "#e0e0e0",
                    textAlign: "center",
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    padding: "0 4px",
                  }}>
                    {p.name}{isMe ? (lang === "de" ? " (Du)" : " (You)") : ""}
                  </div>
                  <div style={{ fontSize: 11, color: "#aaa" }}>{cardLabel(p.score)}</div>
                  {/* Podium block */}
                  <div style={{
                    width: "100%",
                    height,
                    background: `linear-gradient(180deg, ${PLACE_COLORS[i]}33, ${PLACE_COLORS[i]}11)`,
                    border: `2px solid ${PLACE_COLORS[i]}66`,
                    borderRadius: "10px 10px 0 0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    fontWeight: 900,
                    color: PLACE_COLORS[i],
                  }}>
                    {i + 1}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Full leaderboard */}
        <div style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(16px)",
          transition: "opacity 0.6s ease 0.35s, transform 0.6s ease 0.35s",
        }}>
          {sortedPlayers.map((p, i) => {
            const isMe = p.id === myId;
            const isWinner = i === 0;
            return (
              <div key={p.id} style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderRadius: 14,
                background: isMe
                  ? "rgba(29,185,84,0.12)"
                  : isWinner
                  ? "rgba(255,215,0,0.08)"
                  : "rgba(255,255,255,0.04)",
                border: isMe
                  ? "2px solid rgba(29,185,84,0.4)"
                  : isWinner
                  ? "2px solid rgba(255,215,0,0.3)"
                  : "2px solid rgba(255,255,255,0.08)",
                transform: visible ? `translateX(0)` : `translateX(-20px)`,
                transition: `opacity 0.4s ease ${0.4 + i * 0.08}s, transform 0.4s ease ${0.4 + i * 0.08}s`,
                opacity: visible ? 1 : 0,
              }}>
                {/* Medal / rank */}
                <div style={{ fontSize: 24, flexShrink: 0, minWidth: 32, textAlign: "center" }}>
                  {MEDALS[i] || <span style={{ fontSize: 16, color: "#666", fontWeight: 700 }}>{i + 1}</span>}
                </div>
                {/* Name */}
                <div style={{ flex: 1, fontWeight: isMe ? 800 : 600, fontSize: 16, color: isMe ? "#1DB954" : "#e0e0e0" }}>
                  {p.name}{isMe ? <span style={{ fontSize: 13, fontWeight: 500, color: "#888", marginLeft: 6 }}>{lang === "de" ? "(Du)" : "(You)"}</span> : ""}
                </div>
                {/* Score */}
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: isWinner ? "#FFD700" : isMe ? "#1DB954" : "#e0e0e0" }}>
                    {(p.score || 0) + 1}
                  </div>
                  <div style={{ fontSize: 11, color: "#666" }}>{lang === "de" ? "Karten" : "cards"}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Buttons */}
        <div style={{
          marginTop: 32,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          width: "100%",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.5s ease 0.7s",
        }}>
          <button onClick={onBack} style={{ width: "100%", padding: "18px", fontSize: 18, fontWeight: 700, borderRadius: 14, margin: 0 }}>
            {t?.backToStart || "← Back to Start"}
          </button>
        </div>

      </div>
    </div>
  );
}

export default Winner;