const translations = {
  en: {
    // Start
    appName: "Spotify Hitster",
    hostGame: "Host Game",
    joinGame: "Join Game",
    soloMode: "🎮 Solo Mode",

    // Host login
    loginToHost: "Login to host",
    loginWithSpotify: "Login with Spotify",

    // Lobby
    lobby: "Lobby",
    gameCode: "Game Code",
    players: "Players",
    genres: "Genres",
    orUsePlaylist: "Or use a Playlist",
    pastePlaceholder: "Paste Spotify playlist link...",
    loadPlaylist: "Load Playlist",
    loading: "Loading...",
    remove: "Remove",
    yearRange: "Year Range",
    cardsToWin: "Cards to Win",
    timer: "Timer",
    timerOff: "Off",
    startGame: "Start Game",
    waitingForHost: "Waiting for host to start the game...",
    playlistError: "Couldn't load playlist. Make sure it's a public Spotify playlist URL.",

    // Game
    yourTurn: "Your turn!",
    waitingFor: (name) => `Waiting for ${name}...`,
    loadingSong: "Loading song...",
    dragToPlace: "Drag to place",
    isPlaying: (name) => `${name} is playing...`,
    reveal: "Reveal",
    nextPlayer: "Next Player",
    giveCoin: (name) => `🎤 Give coin to ${name}`,
    iKnowThisSong: "🎵 I know this song! +1🪙",

    // Winner
    winner: "🎉 Winner!",
    wins: (name) => `${name} wins!`,
    playAgain: "Play Again",
    backToStart: "← Back to Start",

    // Solo setup
    soloTitle: "Solo Mode",
    soloDesc: "Place as many songs as you can correctly. See how long your streak goes!",
    startSoloGame: "Start Solo Game",
    back: "← Back",

    // Solo game
    soloMode_label: "Solo Mode",
    score: "Score",
    end: "End",
    nextSong: (correct) => correct ? "✅ Next Song" : "❌ Next Song",
    gameOver: "Game Over!",
    correct: "Correct",
    bestStreak: "Best Streak",
    accuracy: "Accuracy",
    shareScore: "📤 Share Score",
    shareText: (score, streak, acc) => `🎵 Spotify Hitster Solo\n✅ ${score} correct\n🔥 Best streak: ${streak}\n🎯 ${acc}% accuracy`,
    scoreCopied: "Score copied to clipboard!",
  },

  de: {
    // Start
    appName: "Spotify Hitster",
    hostGame: "Spiel hosten",
    joinGame: "Spiel beitreten",
    soloMode: "🎮 Einzelspieler",

    // Host login
    loginToHost: "Als Host anmelden",
    loginWithSpotify: "Mit Spotify anmelden",

    // Lobby
    lobby: "Lobby",
    gameCode: "Spielcode",
    players: "Spieler",
    genres: "Genres",
    orUsePlaylist: "Oder eine Playlist nutzen",
    pastePlaceholder: "Spotify-Playlist-Link einfügen...",
    loadPlaylist: "Playlist laden",
    loading: "Lädt...",
    remove: "Entfernen",
    yearRange: "Jahreszeitraum",
    cardsToWin: "Karten zum Gewinnen",
    timer: "Timer",
    timerOff: "Aus",
    startGame: "Spiel starten",
    waitingForHost: "Warten auf den Host...",
    playlistError: "Playlist konnte nicht geladen werden. Stelle sicher, dass es eine öffentliche Spotify-Playlist ist.",

    // Game
    yourTurn: "Du bist dran!",
    waitingFor: (name) => `Warten auf ${name}...`,
    loadingSong: "Song wird geladen...",
    dragToPlace: "Ziehen zum Platzieren",
    isPlaying: (name) => `${name} spielt gerade...`,
    reveal: "Aufdecken",
    nextPlayer: "Nächster Spieler",
    giveCoin: (name) => `🎤 Münze geben an ${name}`,
    iKnowThisSong: "🎵 Ich kenne diesen Song! +1🪙",

    // Winner
    winner: "🎉 Gewinner!",
    wins: (name) => `${name} gewinnt!`,
    playAgain: "Nochmal spielen",
    backToStart: "← Zurück zum Start",

    // Solo setup
    soloTitle: "Einzelspieler",
    soloDesc: "Platziere so viele Songs wie möglich richtig. Wie lange hält deine Serie?",
    startSoloGame: "Einzelspiel starten",
    back: "← Zurück",

    // Solo game
    soloMode_label: "Einzelspieler",
    score: "Punkte",
    end: "Beenden",
    nextSong: (correct) => correct ? "✅ Nächster Song" : "❌ Nächster Song",
    gameOver: "Spiel vorbei!",
    correct: "Richtig",
    bestStreak: "Beste Serie",
    accuracy: "Genauigkeit",
    shareScore: "📤 Ergebnis teilen",
    shareText: (score, streak, acc) => `🎵 Spotify Hitster Solo\n✅ ${score} richtig\n🔥 Beste Serie: ${streak}\n🎯 ${acc}% Genauigkeit`,
    scoreCopied: "Ergebnis in Zwischenablage kopiert!",
  }
};

export default translations;