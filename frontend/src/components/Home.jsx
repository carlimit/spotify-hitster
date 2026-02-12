import { useState } from "react";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";

function Home({
  setGamePhase,
  players,
  setPlayers,
  selectedGenres,
  setSelectedGenres,
  minYear,
  setMinYear,
  maxYear,
  setMaxYear
}) {
  const [playerName, setPlayerName] = useState("");

  const addPlayer = () => {
    if (!playerName.trim()) return;

    // Random start year between minYear and maxYear
    const randomStartYear =
      Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;

    setPlayers([
      ...players,
      {
        name: playerName,
        score: 0,
        timeline: [
          {
            id: Date.now(),
            year: randomStartYear,
            type: "fixed"
          }
        ]
      }
    ]);

    setPlayerName("");
  };

  const toggleGenre = genre => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  return (
    <div className="container">
      <h1>Hitster Game</h1>

      <div className="home-section">
        <h2>Players</h2>
        <div className="player-list">
          {players.map((p, i) => (
            <p key={i}>{p.name}</p>
          ))}
        </div>

        <input
          type="text"
          placeholder="Player name"
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && addPlayer()}
        />
        <button onClick={addPlayer}>Add Player</button>
      </div>

      <div className="home-section">
        <h2>Genres</h2>
        <div className="genre-buttons">
          {["pop", "rock", "hiphop", "edm", "jazz", "metal", "house"].map(
            genre => (
              <button
                key={genre}
                onClick={() => toggleGenre(genre)}
                style={{
                  background: selectedGenres.includes(genre)
                    ? "#1DB954"
                    : "#444",
                  margin: "5px"
                }}
              >
                {genre}
              </button>
            )
          )}
        </div>
      </div>

      <div className="home-section">
        <h2>Year Range</h2>
        <Slider
          range
          min={1960}
          max={2024}
          value={[minYear, maxYear]}
          onChange={value => {
            setMinYear(value[0]);
            setMaxYear(value[1]);
          }}
        />

        <div style={{ marginTop: "10px", fontWeight: "bold" }}>
          {minYear} – {maxYear}
        </div>
      </div>

      <button
        className="start-button"
        onClick={() => {
          if (players.length && selectedGenres.length)
            setGamePhase("playing");
        }}
      >
        Start Game
      </button>
    </div>
  );
}

export default Home;