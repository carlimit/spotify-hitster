import { useState } from "react";

const content = {
  en: {
    title: "How to Play",
    close: "Got it!",
    steps: [
      { icon: "🎵", text: "Each turn, a mystery song plays — you don't know the year yet." },
      { icon: "📅", text: "Drag the card to where you think it fits on your timeline." },
      { icon: "🔍", text: "The active player presses Reveal — the year is shown to everyone." },
      { icon: "✅", text: "Correct placement? The card is added to your timeline and you score a point." },
      { icon: "❌", text: "Wrong placement? The card is discarded and your turn ends." },
      { icon: "🪙", text: "Spectators can place a coin to bet on where the card belongs — win it back (or lose it) based on whether they're right." },
      { icon: "🎤", text: "The next player can give a coin to the active player if they recognize the song before it's revealed." },
      { icon: "🏆", text: "First player to collect the target number of cards on their timeline wins!" },
    ]
  },
  de: {
    title: "Spielanleitung",
    close: "Verstanden!",
    steps: [
      { icon: "🎵", text: "Jede Runde spielt ein unbekanntes Lied — das Jahr ist noch verborgen." },
      { icon: "📅", text: "Ziehe die Karte dorthin, wo du das Jahr auf deiner Zeitleiste vermutest." },
      { icon: "🔍", text: "Der aktive Spieler drückt Aufdecken — das Jahr wird für alle sichtbar." },
      { icon: "✅", text: "Richtig platziert? Die Karte bleibt auf deiner Zeitleiste und du bekommst einen Punkt." },
      { icon: "❌", text: "Falsch platziert? Die Karte wird abgelegt und dein Zug endet." },
      { icon: "🪙", text: "Zuschauer können eine Münze setzen, um auf die richtige Position zu tippen — bei Erfolg zurück, bei Fehler verloren." },
      { icon: "🎤", text: "Der nächste Spieler kann dem aktiven Spieler eine Münze geben, wenn er das Lied vor dem Aufdecken erkennt." },
      { icon: "🏆", text: "Wer zuerst die Zielanzahl an Karten auf seiner Zeitleiste hat, gewinnt!" },
    ]
  }
};

function HowToPlay({ lang, onClose }) {
  const c = content[lang] || content.en;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#1a1a1a",
          borderRadius: "16px",
          padding: "24px 20px",
          maxWidth: "460px",
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
        }}
      >
        <h2 style={{ textAlign: "center", marginBottom: "20px", color: "#1DB954" }}>
          {c.title}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {c.steps.map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
              <span style={{ fontSize: "24px", lineHeight: 1, flexShrink: 0 }}>{step.icon}</span>
              <p style={{ margin: 0, color: "#e0e0e0", fontSize: "15px", lineHeight: "1.5" }}>
                {step.text}
              </p>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: "24px",
            width: "100%",
            background: "#1DB954",
            color: "#000",
            fontWeight: "bold",
            fontSize: "16px",
            padding: "12px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
          }}
        >
          {c.close}
        </button>
      </div>
    </div>
  );
}

export default HowToPlay;