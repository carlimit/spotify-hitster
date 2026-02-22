import { useState } from "react";

const content = {
  en: {
    title: "How to Play",
    close: "Got it!",
    sections: [
      {
        heading: "🎮 Multiplayer",
        steps: [
          { icon: "1️⃣", text: "The host logs in with Spotify and creates a game. Choose genres and a year range, or load a specific Spotify playlist (including official Hitster editions)." },
          { icon: "2️⃣", text: "Share the room code. Other players open the app, tap 'Join Game', and enter the code. They don't need a Spotify account." },
          { icon: "3️⃣", text: "Each player starts with one card already on their timeline showing its year — this is your anchor point." },
          { icon: "4️⃣", text: "On your turn: a mystery song plays. Drag the green card left or right to where you think it fits on your timeline, then tap Reveal." },
          { icon: "5️⃣", text: "Correct placement → the card stays on your timeline and you score a point. Wrong → the card is discarded and your turn ends." },
          { icon: "6️⃣", text: "First player to collect the target number of cards wins!" },
        ]
      },
      {
        heading: "🪙 Coins & Extras",
        steps: [
          { icon: "🪙", text: "While waiting, tap the + between two cards to bet a coin there. If the active player places their card at that exact spot correctly — you get your coin back. If they're wrong and you were right — you steal the card! Wrong prediction = lose a coin." },
          { icon: "🎤", text: "Recognise the song before it's revealed? Tap '🎤 I know this song!' to claim a bonus coin. First person to buzz in wins it — but only if the card actually gets revealed." },
          { icon: "📋", text: "Tap 'My Cards' at any time to see all the songs on your timeline sorted by year." },
          { icon: "🔎", text: "As your timeline grows, use the zoom button (bottom right) to shrink it so all cards are visible at once." },
        ]
      },
      {
        heading: "🎯 Solo Mode",
        steps: [
          { icon: "🎵", text: "Play alone! Pick genres, a year range, or load a playlist. Log in with Spotify to hear the songs while you play." },
          { icon: "📅", text: "Drag each mystery song to where you think it fits on your growing timeline, then tap Reveal." },
          { icon: "✅", text: "Correct → card stays. Wrong → discarded. Build the longest correct streak you can!" },
          { icon: "⏱", text: "Enable a timer for extra pressure — place the card before time runs out, or it counts as wrong." },
        ]
      },
      {
        heading: "💡 Tips",
        steps: [
          { icon: "📲", text: "Install the app to your home screen (tap Share → 'Add to Home Screen') for the best fullscreen experience." },
          { icon: "🎲", text: "No genres selected = all genres. Narrow it down for themed rounds!" },
          { icon: "🔊", text: "On mobile, music plays through the Spotify app. Make sure Spotify is open and active before tapping play." },
          { icon: "🌍", text: "Use an official Hitster playlist to play alongside the physical card game." },
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
          { icon: "1️⃣", text: "Der Host meldet sich mit Spotify an und erstellt ein Spiel. Genre und Jahreszeitraum wählen oder eine Spotify-Playlist laden (inkl. offizieller Hitster-Editionen)." },
          { icon: "2️⃣", text: "Den Raumcode teilen. Andere Spieler öffnen die App, tippen auf 'Spiel beitreten' und geben den Code ein — kein Spotify-Konto nötig." },
          { icon: "3️⃣", text: "Jeder Spieler startet mit einer bereits platzierten Karte auf seiner Zeitleiste, die das Jahr zeigt — das ist dein Ankerpunkt." },
          { icon: "4️⃣", text: "In deinem Zug: Ein unbekannter Song spielt. Ziehe die grüne Karte nach links oder rechts an die Stelle, wo du das Jahr vermutest, dann tippe auf Aufdecken." },
          { icon: "5️⃣", text: "Richtig platziert → die Karte bleibt auf deiner Zeitleiste und du bekommst einen Punkt. Falsch → die Karte wird abgelegt und dein Zug endet." },
          { icon: "6️⃣", text: "Wer zuerst die Zielanzahl an Karten hat, gewinnt!" },
        ]
      },
      {
        heading: "🪙 Münzen & Extras",
        steps: [
          { icon: "🪙", text: "Während du wartest, tippe auf das + zwischen zwei Karten, um dort eine Münze zu setzen. Legt der aktive Spieler seine Karte genau dorthin richtig — bekommst du die Münze zurück. Lag er falsch und du richtig — bekommst du die Karte! Falsch getippt = Münze verloren." },
          { icon: "🎤", text: "Du erkennst den Song bevor er aufgedeckt wird? Tippe auf '🎤 Ich kenn den Song!' für eine Bonusmünze. Nur die erste Person gewinnt sie — aber nur wenn der Song danach aufgedeckt wird." },
          { icon: "📋", text: "Tippe jederzeit auf 'Meine Karten' für eine Übersicht aller Songs auf deiner Zeitleiste, sortiert nach Jahr." },
          { icon: "🔎", text: "Wenn die Zeitleiste lang wird, nutze den Zoom-Button (rechts unten), um alle Karten gleichzeitig zu sehen." },
        ]
      },
      {
        heading: "🎯 Solo-Modus",
        steps: [
          { icon: "🎵", text: "Alleine spielen! Genre, Jahreszeitraum oder Playlist wählen. Mit Spotify anmelden, um die Songs direkt zu hören." },
          { icon: "📅", text: "Jeden unbekannten Song an die richtige Stelle der wachsenden Zeitleiste ziehen, dann auf Aufdecken tippen." },
          { icon: "✅", text: "Richtig → Karte bleibt. Falsch → wird abgelegt. Versuche die längste Serie zu erreichen!" },
          { icon: "⏱", text: "Timer aktivieren für mehr Druck — die Karte muss vor Ablauf der Zeit platziert werden, sonst zählt es als falsch." },
        ]
      },
      {
        heading: "💡 Tipps",
        steps: [
          { icon: "📲", text: "Die App auf dem Startbildschirm installieren (Teilen → 'Zum Startbildschirm hinzufügen') für das beste Vollbild-Erlebnis." },
          { icon: "🎲", text: "Kein Genre gewählt = alle Genres. Einschränken für thematische Runden!" },
          { icon: "🔊", text: "Auf dem Handy läuft die Musik über die Spotify-App. Sicherstellen, dass Spotify geöffnet und aktiv ist, bevor man auf Play tippt." },
          { icon: "🌍", text: "Eine offizielle Hitster-Playlist nutzen, um parallel zum physischen Kartenspiel zu spielen." },
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