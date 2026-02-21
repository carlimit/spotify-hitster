import { useState } from "react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import PlaylistPicker from "./PlaylistPicker";

const currentYear = new Date().getFullYear();

function SinglePlayerSetup({ t,
  setScreen,
  genres, setGenres,
  minYear, setMinYear,
  maxYear, setMaxYear,
  playlist, setPlaylist,
  timerSeconds, setTimerSeconds,
  loginUrl, refreshLoginUrl,
  lang = "en"
}) {
  // sessionStorage clears when the tab is closed or reloaded
  // so the user always has to re-login on a fresh session
  const [loggedIn, setLoggedIn] = useState(!!sessionStorage.getItem("token"));

  const [musicMode, setMusicMode] = useState("random"); // "random" | "playlist"

  const toggleGenre = (g) => {
    setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };

  const handleLogin = () => {
    if (!loginUrl) return;
    const url = loginUrl;
    refreshLoginUrl?.();
    window.location.href = url;
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setLoggedIn(false);
  };

  return (
    <div className="container">
      <h1>{t?.soloTitle || "Solo Mode"}</h1>
      <p style={{ color: "#b3b3b3", textAlign: "center", marginBottom: 16 }}>
        {t?.soloDesc || "Place as many songs as you can correctly. See how long your streak goes!"}
      </p>

      {loggedIn ? (
        <div className="spotify-login-banner">
          <p>✅ {t?.spotifyConnected || "Spotify connected!"}</p>
          <button style={{ background: "#444", fontSize: 13 }} onClick={handleLogout}>
            {t?.logout || "Log out"}
          </button>
        </div>
      ) : (
        <div className="spotify-login-banner">
          <p>{t?.spotifyNeeded || "Login with Spotify to play music while you guess."}</p>
          <button
            style={{ background: "#1DB954" }}
            disabled={!loginUrl}
            onClick={handleLogin}
          >
            {loginUrl ? (t?.loginWithSpotify || "Login with Spotify") : "…"}
          </button>
        </div>
      )}

      {/* ── Mode Switch ── */}
      <div className="home-section">
        <div style={{
          display: "flex",
          background: "#1a1a1a",
          borderRadius: 12,
          padding: 3,
          gap: 3,
        }}>
          <button
            onClick={() => { setMusicMode("random"); setPlaylist(null); }}
            style={{
              flex: 1,
              padding: "10px 8px",
              fontSize: 14,
              fontWeight: musicMode === "random" ? 700 : 500,
              background: musicMode === "random" ? "#1DB954" : "transparent",
              color: musicMode === "random" ? "#fff" : "#888",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              boxShadow: "none",
              minWidth: "unset",
              margin: 0,
              transition: "all 0.2s ease",
            }}
          >
            🎲 {lang === "de" ? "Zufällig" : "Random"}
          </button>
          <button
            onClick={() => setMusicMode("playlist")}
            style={{
              flex: 1,
              padding: "10px 8px",
              fontSize: 14,
              fontWeight: musicMode === "playlist" ? 700 : 500,
              background: musicMode === "playlist" ? "#1DB954" : "transparent",
              color: musicMode === "playlist" ? "#fff" : "#888",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              boxShadow: "none",
              minWidth: "unset",
              margin: 0,
              transition: "all 0.2s ease",
            }}
          >
            🎵 Playlist
          </button>
        </div>
      </div>

      {/* ── Random mode: genres + year ── */}
      {musicMode === "random" && (
        <>
          <div className="home-section">
            <h2>{t?.genres || "Genres"}</h2>
            <div className="genre-buttons">
              {["pop", "rock", "hiphop", "edm", "jazz", "metal", "house"].map(g => (
                <button
                  key={g}
                  onClick={() => toggleGenre(g)}
                  style={{ background: genres.includes(g) ? "#1DB954" : "#444" }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="home-section">
            <h2>{t?.yearRange || "Year Range"}</h2>
            <Slider
              range
              min={1920}
              max={currentYear}
              value={[minYear, maxYear]}
              onChange={v => { setMinYear(v[0]); setMaxYear(v[1]); }}
            />
            <div style={{ marginTop: 10, fontWeight: "bold" }}>{minYear} – {maxYear}</div>
          </div>
        </>
      )}

      {/* ── Playlist mode ── */}
      {musicMode === "playlist" && (
        <div className="home-section">
          <PlaylistPicker
            t={t}
            lang={lang}
            playlist={playlist}
            setPlaylist={setPlaylist}
          />
        </div>
      )}

      <div className="home-section">
        <h2>{t?.timer || "Timer"}</h2>
        <div className="timer-options">
          {[0, 15, 30, 45, 60].map(s => (
            <button
              key={s}
              onClick={() => setTimerSeconds(s)}
              style={{ background: timerSeconds === s ? "#1DB954" : "#444" }}
            >
              {s === 0 ? (t?.timerOff || "Off") : `${s}s`}
            </button>
          ))}
        </div>
      </div>

      <button className="start-button" onClick={() => setScreen("singleplayer")}>
        {t?.startSolo || "Start Solo Game"}
      </button>

      <button style={{ background: "transparent", color: "#b3b3b3", marginTop: 12 }} onClick={() => setScreen("start")}>
        {t?.back || "← Back"}
      </button>
    </div>
  );
}

export default SinglePlayerSetup;