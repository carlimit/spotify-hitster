import { useState } from "react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import PlaylistPicker from "./PlaylistPicker";

function SinglePlayerSetup({ t,
  setScreen,
  genres, setGenres,
  minYear, setMinYear,
  maxYear, setMaxYear,
  playlist, setPlaylist,
  timerSeconds, setTimerSeconds,
  loginUrl, refreshLoginUrl
}) {
  // Check if already logged in — hides the login banner after OAuth redirect
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem("token"));

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
      <h1>{ t?.soloTitle || "Solo Mode" }</h1>
      <p style={{ color: "#b3b3b3", textAlign: "center", marginBottom: 16 }}>
        {t?.soloDesc || "Place as many songs as you can correctly. See how long your streak goes!"}
      </p>

      {/* Show "connected" state if already logged in, login prompt if not */}
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

      <div className="home-section">
        <h2>{ t?.genres || "Genres" }</h2>
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
        <h2>{ t?.orUsePlaylist || "Or use a Playlist" }</h2>
        <PlaylistPicker
          t={t}
          lang="en"
          playlist={playlist}
          setPlaylist={setPlaylist}
        />
      </div>

      <div className="home-section">
        <h2>{ t?.yearRange || "Year Range" }</h2>
        <Slider
          range
          min={1960}
          max={2024}
          value={[minYear, maxYear]}
          onChange={v => { setMinYear(v[0]); setMaxYear(v[1]); }}
        />
        <div style={{ marginTop: 10, fontWeight: "bold" }}>{minYear} – {maxYear}</div>
      </div>

      <div className="home-section">
        <h2>{ t?.timer || "Timer" }</h2>
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