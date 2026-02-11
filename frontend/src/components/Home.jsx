import { useState } from "react";

function Home({ setGamePhase, players, setPlayers, selectedGenres, setSelectedGenres }) {
  const [playerName, setPlayerName] = useState("");
  const [minYear, setMinYear] = useState(1990);
  const [maxYear, setMaxYear] = useState(2024);


  const addPlayer = () => {
    if (playerName.trim() === "") return;

    setPlayers([
  ...players,
  {
    name: playerName,
    score: 0,
    timeline: [
      {
        id: Date.now(),
        year: 2005,
        type: "fixed"
      }
    ]
  }
]);

    setPlayerName("");
  };

  const toggleGenre = (genre) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

<div className="year-filter">
  <h3>Year Range</h3>

  <div className="slider-container">
    <input
      type="range"
      min="1960"
      max="2024"
      value={minYear}
      onChange={(e) => setMinYear(parseInt(e.target.value))}
    />

    <input
      type="range"
      min="1960"
      max="2024"
      value={maxYear}
      onChange={(e) => setMaxYear(parseInt(e.target.value))}
    />
  </div>

  <div className="year-label">
    {minYear} - {maxYear}
  </div>
</div>


  return (
    <div className="container">
      <h1>Hitster Game</h1>

      <h2>Players</h2>
      <div>
        {players.map((p, index) => (
          <p key={index}>{p.name}</p>
        ))}
      </div>

      <input
        type="text"
        placeholder="Player name"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
      />
      <button onClick={addPlayer}>Add Player</button>

      <h2>Genres</h2>
      <div>
        {["pop", "rock", "hiphop", "edm"].map((genre) => (
          <button
            key={genre}
            onClick={() => toggleGenre(genre)}
            style={{
              background: selectedGenres.includes(genre) ? "#1DB954" : "#444",
              color: "white",
              margin: "5px",
              padding: "8px"
            }}
          >
            {genre}
          </button>
        ))}
      </div>

      <button
        onClick={() => {
          if (players.length > 0 && selectedGenres.length > 0) {
            setGamePhase("playing");
          }
        }}
      >
        Start Game
      </button>
    </div>
  );
}

export default Home;
