// Reusable banner shown on mobile when Spotify app needs to be opened.
// Shows a deep link to open Spotify + a retry button for when they come back.

function SpotifyAppPrompt({ onRetry, lang }) {
  return (
    <div style={{
      width: "100%",
      maxWidth: 480,
      background: "rgba(29, 185, 84, 0.12)",
      border: "2px solid rgba(29, 185, 84, 0.4)",
      borderRadius: 16,
      padding: "16px 20px",
      textAlign: "center",
      margin: "12px auto",
      animation: "fadeIn 0.3s ease",
    }}>
      <p style={{
        color: "#fff",
        fontSize: 15,
        fontWeight: 600,
        margin: "0 0 8px 0",
        background: "none",
        border: "none",
        padding: 0,
      }}>
        {lang === "de"
          ? "🎵 Öffne Spotify auf deinem Handy"
          : "🎵 Open Spotify on your phone"}
      </p>
      <p style={{
        color: "#b3b3b3",
        fontSize: 13,
        margin: "0 0 12px 0",
        background: "none",
        border: "none",
        padding: 0,
      }}>
        {lang === "de"
          ? "Die Musik wird über deine Spotify-App abgespielt. Öffne die App kurz, dann komm zurück."
          : "Music plays through your Spotify app. Open it briefly, then come back here."}
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <a
          href="spotify://"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            background: "#1DB954",
            color: "white",
            borderRadius: 30,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          {lang === "de" ? "Spotify öffnen" : "Open Spotify"}
        </a>
        <button
          onClick={onRetry}
          style={{
            padding: "10px 20px",
            background: "#333",
            color: "white",
            borderRadius: 30,
            fontWeight: 600,
            fontSize: 14,
            border: "none",
            cursor: "pointer",
            minWidth: "unset",
            boxShadow: "none",
            margin: 0,
          }}
        >
          {lang === "de" ? "↻ Nochmal versuchen" : "↻ Retry"}
        </button>
      </div>
    </div>
  );
}

export default SpotifyAppPrompt;