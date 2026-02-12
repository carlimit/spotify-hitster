export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  // Extract playlist ID from any Spotify URL format
  const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
  if (!match) return res.status(400).json({ error: "Invalid playlist URL" });

  const playlistId = match[1];

  // Get client credentials token
  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

  const authResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")
    },
    body: "grant_type=client_credentials"
  });

  const authData = await authResponse.json();
  const accessToken = authData.access_token;

  if (!accessToken) {
    return res.status(500).json({ error: "Could not get Spotify token", detail: authData });
  }

  try {
    // Fetch playlist info
    const infoResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,images`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!infoResponse.ok) {
      const err = await infoResponse.json();
      return res.status(500).json({ error: "Could not load playlist", detail: err?.error?.message });
    }

    const info = await infoResponse.json();

    // Fetch tracks — paginate up to 500
    let tracks = [];
    let offset = 0;
    let total = Infinity;

    while (tracks.length < total && tracks.length < 500) {
      const tracksResponse = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&offset=${offset}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const data = await tracksResponse.json();
      if (!data.items) break;

      total = data.total;

      const valid = data.items
        .map(i => i.track)
        .filter(t => t && t.uri && t.uri.startsWith("spotify:track:") && t.album?.release_date);

      tracks.push(...valid);
      offset += 100;
      if (data.items.length < 100) break;
    }

    if (!tracks.length) {
      return res.status(404).json({ error: "No playable tracks in playlist" });
    }

    res.status(200).json({
      name: info.name,
      image: info.images?.[0]?.url,
      trackCount: tracks.length,
      tracks: tracks.map(t => ({
        name: t.name,
        artist: t.artists[0].name,
        year: t.album.release_date.substring(0, 4),
        uri: t.uri,
        cover: t.album.images?.[0]?.url
      }))
    });

  } catch (err) {
    console.error("Playlist error:", err);
    res.status(500).json({ error: "Could not load playlist", detail: err.message });
  }
}