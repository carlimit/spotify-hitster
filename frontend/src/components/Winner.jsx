function Winner({ winner, onBack, t }) {
  return (
    <div className="container">
      <h1>{t?.winner || "🎉 Winner!"}</h1>
      <h2>{t?.wins(winner?.name) || `${winner?.name} wins!`}</h2>
      <button onClick={onBack}>
        {t?.backToStart || "← Back to Start"}
      </button>
    </div>
  );
}

export default Winner;