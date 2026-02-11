function Winner({ winner, setGamePhase }) {
  return (
    <div className="container">
      <h1>{winner?.name} Wins!</h1>

      <button onClick={() => setGamePhase("home")}>
        Back to Home
      </button>
    </div>
  );
}

export default Winner;
