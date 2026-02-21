const axios = require("axios");

async function getSpotifyToken() {
  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "client_credentials" }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.SPOTIFY_CLIENT_ID + ":" + process.env.SPOTIFY_CLIENT_SECRET
          ).toString("base64"),
      },
    }
  );
  return response.data.access_token;
}

module.exports = async function handler(req, res) {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "No query provided", playlists: [] });

  try {
    const token = await getSpotifyToken();
    const response = await axios.get("https://api.spotify.com/v1/search", {
      headers: { Authorization: `Bearer ${token}` },
      params: { q, type: "playlist", limit: 20 },
    });

    const items = response.data.playlists?.items || [];
    const playlists = items
      .filter((p) => p && p.id && p.tracks?.total > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        owner: p.owner?.display_name || "Unknown",
        tracks: p.tracks?.total || 0,
        image: p.images?.[0]?.url || null,
        url: `https://open.spotify.com/playlist/${p.id}`,
      }));

    res.json({ playlists });
  } catch (err) {
    console.error("Search error:", err.response?.data || err.message);
    res.status(500).json({ error: "Search failed", playlists: [] });
  }
};