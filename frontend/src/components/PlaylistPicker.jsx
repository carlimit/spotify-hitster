import { useState, useRef } from "react";
import axios from "axios";
import hitsterPlaylists from "../hitsterPlaylists.json";

function PlaylistPicker({ t, lang, playlist, setPlaylist }) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingUrl, setLoadingUrl] = useState(null);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState(null);
  const debounceRef = useRef(null);

  const isUrl = (str) =>
    str.includes("spotify.com/playlist") || str.includes("spotify:playlist:");

  const loadPlaylistFromUrl = async (url) => {
    setLoading(true);
    setLoadingUrl(url);
    setError("");
    try {
      const res = await axios.get(`/api/playlist?url=${encodeURIComponent(url)}`);
      setPlaylist(res.data);
      setSearchResults([]);
      setQuery("");
      setActiveCategory(null);
    } catch {
      setError(t?.playlistError || "Couldn't load playlist. Make sure it's a public Spotify playlist URL.");
    } finally {
      setLoading(false);
      setLoadingUrl(null);
    }
  };

  const handleInput = (value) => {
    setQuery(value);
    setError("");
    clearTimeout(debounceRef.current);
    if (!value.trim()) { setSearchResults([]); return; }
    if (isUrl(value)) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get(`/api/search-playlists?q=${encodeURIComponent(value)}`);
        setSearchResults(res.data.playlists || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && isUrl(query)) loadPlaylistFromUrl(query);
  };

  // ── If a playlist is loaded, show a compact summary ──────────
  if (playlist) {
    return (
      <div style={{
        background: "rgba(29,185,84,0.08)",
        border: "2px solid rgba(29,185,84,0.3)",
        borderRadius: 14,
        padding: "14px 16px",
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: 15, color: "#1DB954",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            ✅ {playlist.name}
          </div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
            {playlist.trackCount} {lang === "de" ? "Songs" : "tracks"}
          </div>
        </div>
        <button
          onClick={() => setPlaylist(null)}
          style={{ minWidth: "unset", padding: "6px 12px", fontSize: 13, background: "#333", boxShadow: "none", margin: 0, flexShrink: 0 }}
        >
          {t?.remove || "Remove"}
        </button>
      </div>
    );
  }

  const inputIsUrl = isUrl(query);

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Search / URL input ──────────────────────────────────── */}
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              type="text"
              value={query}
              onChange={e => handleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={lang === "de"
                ? "Playlist suchen oder Link einfügen…"
                : "Search playlists or paste a link…"}
              style={{ width: "100%", margin: 0, borderColor: inputIsUrl ? "rgba(29,185,84,0.5)" : undefined }}
            />
            {!inputIsUrl && searching && (
              <div style={{
                position: "absolute", right: 12, top: "50%",
                transform: "translateY(-50%)", fontSize: 12,
                color: "#888", pointerEvents: "none",
              }}>
                {lang === "de" ? "Suche…" : "Searching…"}
              </div>
            )}
          </div>
          {inputIsUrl && (
            <button
              onClick={() => loadPlaylistFromUrl(query)}
              disabled={loading}
              style={{ minWidth: "unset", padding: "0 16px", margin: 0, boxShadow: "none", flexShrink: 0 }}
            >
              {loading ? (lang === "de" ? "Lädt…" : "Loading…") : (lang === "de" ? "Laden" : "Load")}
            </button>
          )}
        </div>

        {/* Search results dropdown */}
        {searchResults.length > 0 && !inputIsUrl && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
            background: "#1e1e1e", border: "1px solid #333", borderRadius: 12,
            overflow: "hidden", zIndex: 200,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            maxHeight: 260, overflowY: "auto",
          }}>
            {searchResults.map((p, i) => {
              const isThisLoading = loadingUrl === p.url;
              return (
                <button
                  key={p.id}
                  onClick={() => loadPlaylistFromUrl(p.url)}
                  disabled={loading}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px",
                    background: isThisLoading ? "rgba(29,185,84,0.1)" : i % 2 === 0 ? "#1e1e1e" : "#222",
                    border: "none", borderRadius: 0, textAlign: "left",
                    cursor: loading ? "wait" : "pointer",
                    minWidth: "unset", margin: 0, boxShadow: "none",
                    opacity: loading && !isThisLoading ? 0.5 : 1,
                  }}
                >
                  {p.image && (
                    <img src={p.image} alt="" style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
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

      {/* ── Hitster section ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
        <span style={{ fontSize: 12, color: "#666", flexShrink: 0, fontWeight: 600, letterSpacing: 0.4 }}>
          HITSTER
        </span>
        <div style={{ flex: 1, height: 1, background: "#2a2a2a" }} />
      </div>

      {/* Category tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {hitsterPlaylists.map(cat => {
          const isActive = activeCategory === cat.category;
          return (
            <button
              key={cat.category}
              onClick={() => setActiveCategory(isActive ? null : cat.category)}
              style={{
                padding: "6px 14px", fontSize: 13, minWidth: "unset", margin: 0,
                boxShadow: "none", borderRadius: 20,
                background: isActive ? "#1DB954" : "#232323",
                color: isActive ? "#fff" : "#aaa",
                border: `1px solid ${isActive ? "#1DB954" : "#383838"}`,
                transition: "all 0.15s ease",
              }}
            >
              {cat.category}
            </button>
          );
        })}
      </div>

      {/* Playlist list for active category */}
      {activeCategory && (() => {
        const cat = hitsterPlaylists.find(c => c.category === activeCategory);
        if (!cat) return null;
        return (
          <div style={{
            display: "flex", flexDirection: "column", gap: 0,
            border: "1px solid #2a2a2a", borderRadius: 12,
            overflow: "hidden", background: "#181818",
            maxHeight: 280, overflowY: "auto",
          }}>
            {cat.playlists.map((p, i) => {
              const isThisLoading = loadingUrl === p.url;
              // Strip "Hitster – " prefix — category is already shown
              const displayName = p.name.replace(/^Hitster\s*[–\-]\s*/i, "");
              return (
                <button
                  key={p.url}
                  onClick={() => loadPlaylistFromUrl(p.url)}
                  disabled={loading}
                  style={{
                    width: "100%", display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 8,
                    padding: "11px 14px",
                    background: isThisLoading
                      ? "rgba(29,185,84,0.1)"
                      : i % 2 === 0 ? "#181818" : "#1e1e1e",
                    borderBottom: i < cat.playlists.length - 1 ? "1px solid #222" : "none",
                    border: "none", borderRadius: 0, textAlign: "left",
                    cursor: loading ? "wait" : "pointer",
                    minWidth: "unset", margin: 0, boxShadow: "none",
                    opacity: loading && !isThisLoading ? 0.45 : 1,
                    transition: "background 0.1s ease",
                  }}
                >
                  <span style={{
                    fontSize: 14, fontWeight: 500,
                    color: isThisLoading ? "#1DB954" : "#d0d0d0",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {displayName}
                  </span>
                  {isThisLoading && (
                    <span style={{ fontSize: 12, color: "#1DB954", flexShrink: 0 }}>
                      {lang === "de" ? "Lädt…" : "Loading…"}
                    </span>
                  )}
                  {!isThisLoading && (
                    <span style={{ fontSize: 16, color: "#444", flexShrink: 0 }}>›</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* Error */}
      {error && (
        <div style={{
          color: "#ff6b6b", fontSize: 13, padding: "8px 12px",
          background: "rgba(255,107,107,0.1)",
          border: "1px solid rgba(255,107,107,0.3)", borderRadius: 8,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default PlaylistPicker;