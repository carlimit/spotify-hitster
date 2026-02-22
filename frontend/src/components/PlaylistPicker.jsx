import { useState, useRef } from "react";
import axios from "axios";

// Official Hitster playlist IDs — load directly without a cover preview step
const HITSTER_PLAYLISTS = [
  { name: "Hitster — Original", id: "6xhADfJKJMoJI5tFBwmqZB" },
  { name: "Hitster — 90s", id: "2qOzOiU4KNqt0FyrGbUHkN" },
  { name: "Hitster — 80s", id: "3JQJM3bAHEFYBTWpvFNbQE" },
  { name: "Hitster — 2000s", id: "4vAyjKXVKnFdFKGYkGF1xm" },
  { name: "Hitster — 70s", id: "1e8B62XLDHqjcWIGAnHJbK" },
];

function PlaylistPicker({ t, lang, playlist, setPlaylist }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState("");
  const debounceRef = useRef(null);

  const isUrl = (str) => str.includes("spotify.com/playlist") || str.includes("spotify:playlist:");

  const loadPlaylistFromUrl = async (url, label) => {
    setLoading(true);
    setLoadingId(label || url);
    setError("");
    try {
      const res = await axios.get(`/api/playlist?url=${encodeURIComponent(url)}`);
      setPlaylist(res.data);
      setResults([]);
      setQuery("");
    } catch {
      setError(t?.playlistError || "Couldn't load playlist. Make sure it's a public Spotify playlist URL.");
    } finally {
      setLoading(false);
      setLoadingId(null);
    }
  };

  const handleInput = (value) => {
    setQuery(value);
    setError("");
    clearTimeout(debounceRef.current);

    if (!value.trim()) { setResults([]); return; }

    if (isUrl(value)) {
      // URL mode — no search, just show a load button (handled via Enter / button)
      setResults([]);
      return;
    }

    // Search mode — debounce 400ms
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(`/api/search-playlists?q=${encodeURIComponent(value)}`);
        setResults(res.data.playlists || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && isUrl(query)) {
      loadPlaylistFromUrl(query);
    }
  };

  const inputIsUrl = isUrl(query);

  if (playlist) {
    return (
      <div style={{
        background: "rgba(29,185,84,0.08)",
        border: "2px solid rgba(29,185,84,0.3)",
        borderRadius: 14,
        padding: "14px 16px",
        width: "100%",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1DB954", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              ✅ {playlist.name}
            </div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
              {playlist.trackCount} {lang === "de" ? "Songs" : "tracks"}
            </div>
          </div>
          <button
            onClick={() => { setPlaylist(null); setQuery(""); setResults([]); }}
            style={{ minWidth: "unset", padding: "6px 12px", fontSize: 13, background: "#333", boxShadow: "none", margin: 0, flexShrink: 0 }}
          >
            {t?.remove || "Remove"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Hitster preset buttons ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Hitster
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {HITSTER_PLAYLISTS.map(p => {
            const isThisLoading = loadingId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => loadPlaylistFromUrl(`https://open.spotify.com/playlist/${p.id}`, p.id)}
                disabled={loading}
                style={{
                  padding: "7px 12px",
                  fontSize: 13,
                  minWidth: "unset",
                  margin: 0,
                  background: isThisLoading ? "#1DB954" : "#2a2a2a",
                  border: "1px solid #444",
                  color: isThisLoading ? "#fff" : "#ccc",
                  borderRadius: 20,
                  boxShadow: "none",
                  opacity: loading && !isThisLoading ? 0.5 : 1,
                  transition: "all 0.15s ease",
                }}
              >
                {isThisLoading
                  ? (lang === "de" ? "Lädt…" : "Loading…")
                  : p.name.replace("Hitster — ", "")}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: "#333" }} />
        <span style={{ fontSize: 12, color: "#555" }}>{lang === "de" ? "oder" : "or"}</span>
        <div style={{ flex: 1, height: 1, background: "#333" }} />
      </div>

      {/* ── Combined search / URL input ── */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "relative", display: "flex", gap: 8 }}>
          <input
            type="text"
            value={query}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={lang === "de"
              ? "Playlist suchen oder Link einfügen…"
              : "Search playlists or paste a link…"}
            style={{
              flex: 1,
              margin: 0,
              borderColor: inputIsUrl ? "rgba(29,185,84,0.5)" : undefined,
            }}
          />
          {inputIsUrl && (
            <button
              onClick={() => loadPlaylistFromUrl(query)}
              disabled={loading}
              style={{ minWidth: "unset", padding: "0 16px", margin: 0, boxShadow: "none", flexShrink: 0 }}
            >
              {loading ? (lang === "de" ? "Lädt…" : "Loading…") : (lang === "de" ? "Laden" : "Load")}
            </button>
          )}
          {!inputIsUrl && searching && (
            <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#888" }}>
              {lang === "de" ? "Suche…" : "Searching…"}
            </div>
          )}
        </div>

        {/* ── Search results dropdown ── */}
        {results.length > 0 && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0, right: 0,
            background: "#1e1e1e",
            border: "1px solid #333",
            borderRadius: 12,
            overflow: "hidden",
            zIndex: 100,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            maxHeight: 260,
            overflowY: "auto",
          }}>
            {results.map((p, i) => {
              const isThisLoading = loadingId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => loadPlaylistFromUrl(p.url, p.id)}
                  disabled={loading}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    background: isThisLoading ? "rgba(29,185,84,0.1)" : i % 2 === 0 ? "#1e1e1e" : "#222",
                    border: "none",
                    borderRadius: 0,
                    textAlign: "left",
                    cursor: loading ? "wait" : "pointer",
                    minWidth: "unset",
                    margin: 0,
                    boxShadow: "none",
                    transition: "background 0.1s ease",
                  }}
                >
                  {p.image && (
                    <img
                      src={p.image}
                      alt=""
                      style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#e0e0e0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isThisLoading ? (lang === "de" ? "Lädt…" : "Loading…") : p.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#888" }}>
                      {p.owner} · {p.tracks} {lang === "de" ? "Songs" : "tracks"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div style={{ color: "#ff6b6b", fontSize: 13, padding: "8px 12px", background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default PlaylistPicker;