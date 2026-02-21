import { useState } from "react";

const content = {
  en: {
    title: "How to Play",
    close: "Got it!",
    sections: [
      {
        heading: "🎮 Multiplayer",
        steps: [
          { icon: "🎵", text: "The host logs in with Spotify and sets up the game — pick genres, a year range, or load a Spotify playlist (including Hitster editions)." },
          { icon: "👥", text: "Other players join with the room code — no Spotify login needed for them." },
          { icon: "📅", text: "On your turn, a mystery song plays. Drag the card to where you think it fits chronologically on your timeline." },
          { icon: "🔍", text: "Press Reveal — the real year is shown to everyone." },
          { icon: "✅", text: "Correct placement? The card stays on your timeline and you score a point." },
          { icon: "❌", text: "Wrong placement? The card is discarded and your turn ends." },
          { icon: "🪙", text: "While waiting, spectators can place a coin to bet on where the card belongs. Right = coin back. Wrong = coin lost." },
          { icon: "🎤", text: "The next player in line can give a coin to the active player if they recognize the song before it's revealed." },
          { icon: "🏆", text: "First player to collect the target number of cards wins!" },
        ]
      },
      {
        heading: "🎯 Solo Mode",
        steps: [
          { icon: "🎵", text: "Play alone! Pick genres, a year range, or load a playlist. Login with Spotify to hear the songs." },
          { icon: "📅", text: "Drag each mystery song to the right spot on your growing timeline." },
          { icon: "✅", text: "Correct = card stays. Wrong = card is discarded." },
          { icon: "🔥", text: "Build the longest streak you can and track your accuracy!" },
        ]
      },
      {
        heading: "💡 Tips",
        steps: [
          { icon: "🔎", text: "Use the zoom button to shrink the timeline when it gets long." },
          { icon: "⏱", text: "The host can set a timer to add pressure — guess before time runs out!" },
          { icon: "📋", text: "Tap 'My Cards' during a game to see an overview of your timeline." },
          { icon: "📲", text: "Install the app to your home screen for the best experience!" },
        ]
      }
    ]
  },
  de: {
    title: "Spielanleitung",
    close: "Verstanden!",
    sections: [
      {
        heading: "🎮 Mehrspieler",
        steps: [
          { icon: "🎵", text: "Der Host loggt sich mit Spotify ein und richtet das Spiel ein — Genre, Jahreszeitraum oder eine Spotify-Playlist (inkl. Hitster-Editionen) wählen." },
          { icon: "👥", text: "Andere Spieler treten mit dem Raumcode bei — kein Spotify-Login nötig." },
          { icon: "📅", text: "Wenn du dran bist, spielt ein unbekanntes Lied. Ziehe die Karte an die Stelle, wo du das Jahr vermutest." },
          { icon: "🔍", text: "Drücke Aufdecken — das echte Jahr wird für alle sichtbar." },
          { icon: "✅", text: "Richtig? Die Karte bleibt auf deiner Zeitleiste und du bekommst einen Punkt." },
          { icon: "❌", text: "Falsch? Die Karte wird abgelegt und dein Zug endet." },
          { icon: "🪙", text: "Zuschauer können eine Münze auf eine Position setzen. Richtig = Münze zurück. Falsch = Münze verloren." },
          { icon: "🎤", text: "Der nächste Spieler kann dem aktiven Spieler eine Münze geben, wenn er das Lied vor dem Aufdecken erkennt." },
          { icon: "🏆", text: "Wer zuerst die Zielanzahl an Karten hat, gewinnt!" },
        ]
      },
      {
        heading: "🎯 Solo-Modus",
        steps: [
          { icon: "🎵", text: "Spiele alleine! Genre, Jahreszeitraum oder Playlist wählen. Mit Spotify einloggen, um Musik zu hören." },
          { icon: "📅", text: "Ziehe jeden Song an die richtige Stelle deiner wachsenden Zeitleiste." },
          { icon: "✅", text: "Richtig = Karte bleibt. Falsch = Karte wird abgelegt." },
          { icon: "🔥", text: "Baue die längste Serie und verfolge deine Genauigkeit!" },
        ]
      },
      {
        heading: "💡 Tipps",
        steps: [
          { icon: "🔎", text: "Nutze den Zoom-Button, wenn die Zeitleiste lang wird." },
          { icon: "⏱", text: "Der Host kann einen Timer setzen — rate, bevor die Zeit abläuft!" },
          { icon: "📋", text: "Tippe auf 'Meine Karten' für eine Übersicht deiner Zeitleiste." },
          { icon: "📲", text: "Installiere die App auf deinem Startbildschirm für das beste Erlebnis!" },
        ]
      }
    ]
  }
};

function HowToPlay({ lang, onClose }) {
  const [activeSection, setActiveSection] = useState(0);
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
        <h2 style={{ textAlign: "center", marginBottom: "16px", color: "#1DB954" }}>
          {c.title}
        </h2>

        {/* Section tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap", justifyContent: "center" }}>
          {c.sections.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveSection(i)}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: activeSection === i ? 700 : 500,
                background: activeSection === i ? "rgba(29,185,84,0.2)" : "rgba(255,255,255,0.06)",
                color: activeSection === i ? "#1DB954" : "#aaa",
                border: activeSection === i ? "1px solid #1DB954" : "1px solid #333",
                borderRadius: 20,
                cursor: "pointer",
                minWidth: "unset",
                margin: 0,
                boxShadow: "none",
              }}
            >
              {s.heading}
            </button>
          ))}
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {c.sections[activeSection].steps.map((step, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
              <span style={{ fontSize: "22px", lineHeight: 1.3, flexShrink: 0 }}>{step.icon}</span>
              <p style={{ margin: 0, color: "#e0e0e0", fontSize: "15px", lineHeight: "1.5", background: "none", border: "none", padding: 0 }}>
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