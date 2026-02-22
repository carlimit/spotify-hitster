import { useState, useEffect } from "react";
import { socket } from "../socket";

/**
 * RejoinScreen — shown when the app detects a saved session
 * but the socket has disconnected (page reload / accidental close).
 */
function RejoinScreen({ savedSession, onRejoin, onDiscard, lang }) {
  const [rejoining, setRejoining] = useState(false);
  const [error, setError] = useState(null);
  const [autoTried, setAutoTried] = useState(false);

  // Auto-attempt rejoin on mount
  useEffect(() => {
    if (!savedSession || autoTried) return;
    setAutoTried(true);
    attemptRejoin();
  }, []);

  const attemptRejoin = () => {
    setRejoining(true);
    setError(null);

    const { roomCode, players } = savedSession;
    // Identify myself by finding player whose name was stored
    const myName = sessionStorage.getItem("hitster_my_name") ||
      localStorage.getItem("hitster_my_name");

    if (!roomCode || !myName) {
      setError(lang === "de" ? "Kein Spielstand gefunden." : "No saved game found.");
      setRejoining(false);
      return;
    }

    const doEmit = () => {
      socket.emit("rejoin_game", { code: roomCode, name: myName });

      const timeout = setTimeout(() => {
        setError(lang === "de"
          ? "Raum nicht gefunden. Das Spiel ist möglicherweise beendet."
          : "Room not found. The game may have ended.");
        setRejoining(false);
      }, 5000);

      socket.once("rejoin_success", (data) => {
        clearTimeout(timeout);
        setRejoining(false);
        onRejoin(data, roomCode, myName);
      });

      socket.once("error", (err) => {
        clearTimeout(timeout);
        setError(err.message || (lang === "de" ? "Beitritt fehlgeschlagen." : "Failed to rejoin."));
        setRejoining(false);
      });
    };

    if (!socket.connected) {
      socket.connect();
      socket.once("connect", doEmit);
    } else {
      doEmit();
    }
  };

  const roomCode = savedSession?.roomCode;

  return (
    <div className="container" style={{ justifyContent: "center", gap: 16 }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>🔄</div>
      <h2 style={{ textAlign: "center" }}>
        {lang === "de" ? "Spiel beitreten?" : "Rejoin Game?"}
      </h2>

      {roomCode && (
        <div style={{
          background: "rgba(29,185,84,0.1)",
          border: "2px solid rgba(29,185,84,0.3)",
          borderRadius: 14,
          padding: "12px 24px",
          textAlign: "center",
          marginBottom: 8,
        }}>
          <div style={{ fontSize: 12, color: "#b3b3b3", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
            {lang === "de" ? "Raum" : "Room"}
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 6, color: "#1DB954" }}>
            {roomCode}
          </div>
        </div>
      )}

      <p style={{
        color: "#b3b3b3",
        textAlign: "center",
        fontSize: 14,
        background: "none",
        border: "none",
        padding: 0,
        maxWidth: 320,
      }}>
        {lang === "de"
          ? "Du hast ein laufendes Spiel gefunden. Möchtest du wieder beitreten?"
          : "We found an ongoing game. Would you like to rejoin?"}
      </p>

      {error && (
        <div style={{
          background: "rgba(255,68,68,0.15)",
          border: "2px solid rgba(255,68,68,0.4)",
          borderRadius: 12,
          padding: "10px 16px",
          color: "#ff8888",
          fontSize: 13,
          textAlign: "center",
          maxWidth: 360,
        }}>
          {error}
        </div>
      )}

      <button
        onClick={attemptRejoin}
        disabled={rejoining}
        style={{ minWidth: 220 }}
      >
        {rejoining
          ? (lang === "de" ? "Verbinde…" : "Connecting…")
          : (lang === "de" ? "🔄 Wieder beitreten" : "🔄 Rejoin Game")}
      </button>

      <button
        onClick={onDiscard}
        style={{ background: "transparent", color: "#b3b3b3", border: "1px solid #444", boxShadow: "none", minWidth: 220 }}
      >
        {lang === "de" ? "← Neues Spiel starten" : "← Start New Game"}
      </button>
    </div>
  );
}

export default RejoinScreen;