import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import hitsterPlaylists from "../hitsterPlaylists.json";

// ─────────────────────────────────────────────────────────────
// PlaylistPicker — unified component for choosing a playlist
//
// Three modes via tabs:
//   🎯 Hitster Editions — preset playlists from hitsterPlaylists.json
//   🔍 Search Spotify  — search any playlist on Spotify
//   🔗 Paste Link      — manual URL input (existing behavior)
// ─────────────────────────────────────────────────────────────

function PlaylistPicker({ t, lang, playlist, setPlaylist, onLoad }) {
  const [tab, setTab] = useState("hitster"); // "hitster" | "search" | "link"
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hitsterSearch, setHitsterSearch] = useState("");
  const searchTimeoutRef = useRef(null);

  // ── Load a playlist by URL ──
  const loadPlaylist = useCallback(async (url) => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/playlist?url=${encodeURIComponent(url)}`);
      setPlaylist(res.data);
      if (onLoad) onLoad(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't load playlist.");
    } finally {
      setLoading(false);
    }
  }, [setPlaylist, onLoad]);

  // ── Spotify search with debounce ──
  const doSearch = useCallback(async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await axios.get(`/api/search-playlists?q=${encodeURIComponent(query)}`);
      setSearchResults(res.data.playlists || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchInput = (val) => {
    setSearch(val);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => doSearch(val), 400);
  };

  // ── Filter hitster presets ──
  const filteredHitster = hitsterSearch.trim()
    ? hitsterPlaylists.map(cat => ({
        ...cat,
        playlists: cat.playlists.filter(p =>
          p.name.toLowerCase().includes(hitsterSearch.toLowerCase())
        ),
      })).filter(cat => cat.playlists.length > 0)
    : hitsterPlaylists;

  // ── If playlist is already loaded, show it ──
  if (playlist) {
    return (
      <div className="playlist-info">
        <div className="playlist-name">🎵 {playlist.name}</div>
        <div className="playlist-count">{playlist.trackCount} tracks</div>
        <button
          onClick={() => { setPlaylist(null); setError(null); }}
          style={{ background: "#444", marginTop: 8 }}
        >
          {t?.remove || "Remove"}
        </button>
      </div>
    );
  }

  const tabStyle = (active) => ({
    flex: 1,
    padding: "10px 4px",
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    background: active ? "rgba(29, 185, 84, 0.15)" : "transparent",
    color: active ? "#1DB954" : "#888",
    border: "none",
    borderBottom: active ? "2px solid #1DB954" : "2px solid transparent",
    cursor: "pointer",
    borderRadius: "0",
    boxShadow: "none",
    minWidth: "unset",
    margin: 0,
    transition: "all 0.2s ease",
  });

  return (
    <div style={{ width: "100%", maxWidth: 480 }}>
      {/* Tab bar */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid #333",
        marginBottom: 12,
      }}>
        <button style={tabStyle(tab === "hitster")} onClick={() => setTab("hitster")}>
          🎯 {lang === "de" ? "Editionen" : "Editions"}
        </button>
        <button style={tabStyle(tab === "search")} onClick={() => setTab("search")}>
          🔍 Spotify
        </button>
        <button style={tabStyle(tab === "link")} onClick={() => setTab("link")}>
          🔗 Link
        </button>
      </div>

      {error && (
        <p style={{ color: "#ff5555", fontSize: 13, margin: "0 0 10px 0", background: "none", border: "none", padding: 0 }}>
          {error}
        </p>
      )}

      {loading && (
        <div style={{
          textAlign: "center",
          padding: "20px 0",
          color: "#888",
          fontSize: 14,
        }}>
          <div style={{ animation: "shimmer 1.4s ease-in-out infinite" }}>
            {lang === "de" ? "Playlist wird geladen..." : "Loading playlist..."}
          </div>
        </div>
      )}

      {/* ─── Hitster Editions Tab ─── */}
      {tab === "hitster" && !loading && (
        <div>
          <input
            type="text"
            placeholder={lang === "de" ? "Editionen durchsuchen..." : "Search editions..."}
            value={hitsterSearch}
            onChange={(e) => setHitsterSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: 14,
              borderRadius: 10,
              border: "1px solid #333",
              background: "#1a1a1a",
              color: "#fff",
              marginBottom: 12,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{
            maxHeight: 320,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            paddingRight: 4,
          }}>
            {filteredHitster.length === 0 && (
              <p style={{ color: "#666", textAlign: "center", fontSize: 14, background: "none", border: "none", padding: 0 }}>
                {lang === "de" ? "Keine Ergebnisse" : "No results"}
              </p>
            )}
            {filteredHitster.map((cat) => (
              <div key={cat.category}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  color: "#666",
                  marginBottom: 6,
                }}>
                  {cat.category}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {cat.playlists.map((p) => (
                    <button
                      key={p.url}
                      onClick={() => loadPlaylist(p.url)}
                      disabled={loading}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid #2a2a2a",
                        borderRadius: 10,
                        color: "#ddd",
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: "pointer",
                        textAlign: "left",
                        width: "100%",
                        minWidth: "unset",
                        boxShadow: "none",
                        margin: 0,
                        transition: "background 0.15s ease",
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = "rgba(29, 185, 84, 0.1)"}
                      onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                    >
                      <span style={{ fontSize: 18 }}>🎵</span>
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Spotify Search Tab ─── */}
      {tab === "search" && !loading && (
        <div>
          <input
            type="text"
            placeholder={lang === "de" ? "Playlist auf Spotify suchen..." : "Search playlists on Spotify..."}
            value={search}
            onChange={(e) => handleSearchInput(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: 14,
              borderRadius: 10,
              border: "1px solid #333",
              background: "#1a1a1a",
              color: "#fff",
              marginBottom: 12,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {searching && (
            <div style={{ textAlign: "center", color: "#888", fontSize: 13, padding: "8px 0" }}>
              {lang === "de" ? "Suche..." : "Searching..."}
            </div>
          )}
          <div style={{
            maxHeight: 320,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}>
            {!searching && searchResults.length === 0 && search.trim() && (
              <p style={{ color: "#666", textAlign: "center", fontSize: 14, background: "none", border: "none", padding: 0 }}>
                {lang === "de" ? "Keine Playlists gefunden" : "No playlists found"}
              </p>
            )}
            {searchResults.map((pl) => (
              <button
                key={pl.id}
                onClick={() => loadPlaylist(pl.url)}
                disabled={loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid #2a2a2a",
                  borderRadius: 10,
                  color: "#ddd",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  minWidth: "unset",
                  boxShadow: "none",
                  margin: 0,
                  transition: "background 0.15s ease",
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "rgba(29, 185, 84, 0.1)"}
                onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              >
                {pl.image ? (
                  <img
                    src={pl.image}
                    alt=""
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 6,
                      objectFit: "cover",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 6,
                    background: "#2a2a2a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    flexShrink: 0,
                  }}>🎵</div>
                )}
                <div style={{ overflow: "hidden", flex: 1 }}>
                  <div style={{
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>{pl.name}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {pl.owner} · {pl.tracks} tracks
                  </div>
                </div>
              </button>
            ))}
          </div>
          {!search.trim() && (
            <p style={{
              color: "#555",
              textAlign: "center",
              fontSize: 13,
              marginTop: 16,
              background: "none",
              border: "none",
              padding: 0,
            }}>
              {lang === "de"
                ? "Suche nach jeder Playlist auf Spotify"
                : "Search for any playlist on Spotify"}
            </p>
          )}
        </div>
      )}

      {/* ─── Paste Link Tab ─── */}
      {tab === "link" && !loading && (
        <div>
          <input
            type="text"
            placeholder={t?.pastePlaceholder || "Paste Spotify playlist link..."}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && loadPlaylist(linkUrl)}
            style={{
              width: "100%",
              padding: "10px 14px",
              fontSize: 14,
              borderRadius: 10,
              border: "1px solid #333",
              background: "#1a1a1a",
              color: "#fff",
              marginBottom: 10,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            onClick={() => loadPlaylist(linkUrl)}
            disabled={!linkUrl.trim()}
            style={{ background: "#444", width: "100%" }}
          >
            {t?.loadPlaylist || "Load Playlist"}
          </button>
        </div>
      )}
    </div>
  );
}

export default PlaylistPicker;