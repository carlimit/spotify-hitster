function Winner({ winner, onBack }) {
  return (
    <div className="container">
      <h1>🎉 {winner?.name} Wins!</h1>
      <button onClick={onBack}>
        Back to Home
      </button>
    </div>
  );
}

export default Winner;