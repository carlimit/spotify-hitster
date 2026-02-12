import { useState } from "react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
import axios from "axios";

function SinglePlayerSetup({
  setScreen,
  genres, setGenres,
  minYear, setMinYear,
  maxYear, setMaxYear,
  playlist, setPlaylist,
  timerSeconds, setTimerSeconds
}) {
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState(null);

  const toggleGenre = (g) => {
    setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };

  const loadPlaylist = async () => {
    if (!playlistUrl.trim()) return;
    setPlaylistLoading(true);
    setPlaylistError(null);
    setPlaylist(null);
    try {
      const res = await axios.get(`/api/playlist?url=${encodeURIComponent(playlistUrl)}`);
      setPlaylist(res.data);
    } catch (err) {
      setPlaylistError(err.response?.data?.detail || "Couldn't load playlist. Make sure it's a public Spotify URL.");
    } finally {
      setPlaylistLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>Solo Mode</h1>
      <p style={{ color: "#b3b3b3", textAlign: "center", marginBottom: 16 }}>
        Place as many songs as you can correctly. See how long your streak goes!
      </p>

      <div className="home-section">
        <h2>Genres</h2>
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
        <h2>Or use a Playlist</h2>
        {!playlist ? (
          <>
            <input
              type="text"
              placeholder="Paste Spotify playlist link..."
              value={playlistUrl}
              onChange={e => setPlaylistUrl(e.target.value)}
              onKeyPress={e => e.key === "Enter" && loadPlaylist()}
            />
            <button onClick={loadPlaylist} disabled={playlistLoading || !playlistUrl.trim()} style={{ background: "#444" }}>
              {playlistLoading ? "Loading..." : "Load Playlist"}
            </button>
            {playlistError && <p style={{ color: "#ff5555", fontSize: "13px", marginTop: 8 }}>{playlistError}</p>}
          </>
        ) : (
          <div className="playlist-info">
            <div className="playlist-name">🎵 {playlist.name}</div>
            <div className="playlist-count">{playlist.trackCount} tracks</div>
            <button onClick={() => setPlaylist(null)} style={{ background: "#444", marginTop: 8 }}>Remove</button>
          </div>
        )}
      </div>

      <div className="home-section">
        <h2>Year Range</h2>
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
        <h2>Timer</h2>
        <div className="timer-options">
          {[0, 15, 30, 45, 60].map(s => (
            <button
              key={s}
              onClick={() => setTimerSeconds(s)}
              style={{ background: timerSeconds === s ? "#1DB954" : "#444" }}
            >
              {s === 0 ? "Off" : `${s}s`}
            </button>
          ))}
        </div>
      </div>

      <button className="start-button" onClick={() => setScreen("singleplayer")}>
        Start Solo Game
      </button>

      <button style={{ background: "transparent", color: "#b3b3b3", marginTop: 12 }} onClick={() => setScreen("start")}>
        ← Back
      </button>
    </div>
  );
}

export default SinglePlayerSetup;