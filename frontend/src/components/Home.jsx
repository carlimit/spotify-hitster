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

  // Zufälliges Startjahr zwischen minYear und maxYear
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

      <h2>Players</h2>
      {players.map((p, i) => (
        <p key={i}>{p.name}</p>
      ))}

      <input
        type="text"
        placeholder="Player name"
        value={playerName}
        onChange={e => setPlayerName(e.target.value)}
      />
      <button onClick={addPlayer}>Add Player</button>

      <h2>Genres</h2>
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

      <button
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
