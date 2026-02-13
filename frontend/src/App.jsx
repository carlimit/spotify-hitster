import { useState, useEffect } from "react";
import Home from "./components/Home";
import Game from "./components/Game";
import Winner from "./components/Winner";
import SinglePlayerSetup from "./components/SinglePlayerSetup";
import SinglePlayerGame from "./components/SinglePlayerGame";
import "./App.css";
import { getLoginUrl } from "./spotify";
import { socket } from "./socket";
import translations from "./translations";
import HowToPlay from "./components/HowToPlay";

function App() {

  const [lang, setLang] = useState(() => localStorage.getItem("lang") || "en");
  const t = translations[lang];

  const switchLang = (l) => {
    setLang(l);
    localStorage.setItem("lang", l);
  };
  const [token, setToken] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [screen, setScreen] = useState("start");
  const [loginUrl, setLoginUrl] = useState(null);
  const [singleLoginUrl, setSingleLoginUrl] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // Pre-compute login URL immediately so button tap is instant (no async gap)
  useEffect(() => {
    getLoginUrl("lobby").then(url => setLoginUrl(url));
    getLoginUrl("singleplayer-setup").then(url => setSingleLoginUrl(url));
  }, []);
  const [players, setPlayers] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [winner, setWinner] = useState(null);
  const [minYear, setMinYear] = useState(1990);
  const [maxYear, setMaxYear] = useState(2024);
  const [roomCode, setRoomCode] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState(null);
  const [winGoal, setWinGoal] = useState(10);
  const [timerSeconds, setTimerSeconds] = useState(0); // 0 = no timer
  // Singleplayer settings (reuse genre/year/playlist)
  const [singlePlayerGenres, setSinglePlayerGenres] = useState([]);
  const [singlePlayerMinYear, setSinglePlayerMinYear] = useState(1990);
  const [singlePlayerMaxYear, setSinglePlayerMaxYear] = useState(2024);
  const [singlePlayerPlaylist, setSinglePlayerPlaylist] = useState(null);

  // ============================================================
  // 🔐 Spotify Redirect — runs on load, handles OAuth callback
  // ============================================================

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    if (storedToken) setToken(storedToken);

    const params = new URLSearchParams(window.location.search);
    const spotifyCode = params.get("code");

    if (spotifyCode) {
      // Read verifier + origin from state param — avoids Brave wiping localStorage/sessionStorage
      let codeVerifier = null;
      let loginOrigin = "lobby";
      const stateParam = params.get("state");
      if (stateParam) {
        try {
          const decoded = JSON.parse(atob(stateParam));
          codeVerifier = decoded.codeVerifier;
          loginOrigin = decoded.loginOrigin || "lobby";
        } catch {
          // Fallback to storage if state isn't our encoded format
          codeVerifier = sessionStorage.getItem("code_verifier") || localStorage.getItem("code_verifier");
          loginOrigin = localStorage.getItem("login_origin") || "lobby";
        }
      } else {
        codeVerifier = sessionStorage.getItem("code_verifier") || localStorage.getItem("code_verifier");
        loginOrigin = localStorage.getItem("login_origin") || "lobby";
      }

      fetch(`/api/token?code=${spotifyCode}`, {
        headers: { "x-code-verifier": codeVerifier }
      })
        .then(res => res.json())
        .then(data => {
          if (!data.access_token) {
            const msg = data.error_description || data.error || JSON.stringify(data);
            setLoginError(msg);
            window.history.replaceState({}, document.title, "/");
            return;
          }
          localStorage.setItem("token", data.access_token);
          setToken(data.access_token);
          setIsHost(loginOrigin !== "singleplayer-setup");
          window.history.replaceState({}, document.title, "/");
          setScreen(loginOrigin);
        })
        .catch(err => { setLoginError(err.message); window.history.replaceState({}, document.title, "/"); });
    }
  }, []);

  // ============================================================
  // 🟢 START SCREEN
  // ============================================================

  if (screen === "start") {
    return (
      <div className="container">
        {loginError && (
          <div style={{background:"#ff4444",color:"#fff",padding:"12px",borderRadius:"8px",marginBottom:"16px",fontSize:"13px",wordBreak:"break-all"}}>
            ⚠️ Login failed: {loginError}
          </div>
        )}
        <div className="lang-toggle">
          <button onClick={() => switchLang("en")} className={lang === "en" ? "lang-active" : ""}>🇬🇧 EN</button>
          <button onClick={() => switchLang("de")} className={lang === "de" ? "lang-active" : ""}>🇩🇪 DE</button>
        </div>
        <h1>{t.appName}</h1>
        <button onClick={() => { setIsHost(true); setScreen("host-login"); }}>
          {t.hostGame}
        </button>
        <button style={{ marginTop: "15px", background: "#444" }} onClick={() => { setIsHost(false); setScreen("lobby"); }}>
          {t.joinGame}
        </button>
        <button style={{ marginTop: "15px", background: "#1a472a" }} onClick={() => setScreen("singleplayer-setup")}>
          {t.soloMode}
        </button>
        <button
  style={{ marginTop: "15px", background: "transparent", border: "1px solid #555", color: "#aaa" }}
  onClick={() => setShowHowToPlay(true)}
>
  {lang === "de" ? "📖 Spielanleitung" : "📖 How to Play"}
</button>

{showHowToPlay && <HowToPlay lang={lang} onClose={() => setShowHowToPlay(false)} />}
      </div>
    );
  }

  // ============================================================
  // 🟢 HOST LOGIN SCREEN
  // ============================================================

  if (screen === "host-login") {
    return (
      <div className="container">
        <h1>{t.appName}</h1>
        <h2>{t.loginToHost}</h2>
        <button
          disabled={!loginUrl}
          onClick={() => {
            if (!loginUrl) return;
            const url = loginUrl;
            setLoginUrl(null); // clear so it regenerates
            getLoginUrl("lobby").then(u => setLoginUrl(u)); // pre-compute next one
            window.location.href = url; // synchronous — mobile won't block it
          }}
        >
          {loginUrl ? t.loginWithSpotify : "…"}
        </button>
      </div>
    );
  }

  // ============================================================
  // 🟢 LOBBY
  // ============================================================

  if (screen === "lobby") {
    return (
      <Home t={t} lang={lang}
        setScreen={setScreen} setPlayers={setPlayers}
        selectedGenres={selectedGenres} setSelectedGenres={setSelectedGenres}
        minYear={minYear} setMinYear={setMinYear}
        maxYear={maxYear} setMaxYear={setMaxYear}
        isHost={isHost} setRoomCode={setRoomCode}
        setPlaylistTracks={setPlaylistTracks}
        winGoal={winGoal} setWinGoal={setWinGoal}
        timerSeconds={timerSeconds} setTimerSeconds={setTimerSeconds}
      />
    );
  }

  if (screen === "playing") {
    return (
      <Game t={t}
        players={players} setPlayers={setPlayers}
        selectedGenres={selectedGenres}
        minYear={minYear} maxYear={maxYear}
        roomCode={roomCode} setScreen={setScreen} setWinner={setWinner}
        playlistTracks={playlistTracks}
        winGoal={winGoal} timerSeconds={timerSeconds}
        isHost={isHost}
        lang={lang}
      />
    );
  }

  if (screen === "singleplayer-setup") {
    return (
      <SinglePlayerSetup t={t}
        setScreen={setScreen}
        genres={singlePlayerGenres} setGenres={setSinglePlayerGenres}
        minYear={singlePlayerMinYear} setMinYear={setSinglePlayerMinYear}
        maxYear={singlePlayerMaxYear} setMaxYear={setSinglePlayerMaxYear}
        playlist={singlePlayerPlaylist} setPlaylist={setSinglePlayerPlaylist}
        timerSeconds={timerSeconds} setTimerSeconds={setTimerSeconds}
        loginUrl={singleLoginUrl} refreshLoginUrl={() => getLoginUrl("singleplayer-setup").then(u => setSingleLoginUrl(u))}
      />
    );
  }

  if (screen === "singleplayer") {
    return (
      <SinglePlayerGame t={t}
        setScreen={setScreen}
        selectedGenres={singlePlayerGenres}
        minYear={singlePlayerMinYear} maxYear={singlePlayerMaxYear}
        playlistTracks={singlePlayerPlaylist}
        timerSeconds={timerSeconds}
      />
    );
  }

  if (screen === "winner") {
    return (
      <Winner t={t} winner={winner} onBack={() => setScreen("start")} />
    );
  }

  return null;
}

export default App;