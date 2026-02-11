export default async function handler(req, res) {
  const { genre, minYear, maxYear } = req.query;

  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

  const authResponse = await fetch(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")
      },
      body: "grant_type=client_credentials"
    }
  );

  const authData = await authResponse.json();
  const accessToken = authData.access_token;

  const query = `genre:${genre} year:${minYear}-${maxYear}`;

const response = await fetch(
  `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=50`,
  {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  }
);


  const data = await response.json();

  if (!data.tracks || data.tracks.items.length === 0) {
    return res.status(404).json({ error: "No tracks found" });
  }

  const tracks = data.tracks.items.filter(t => t.popularity > 50);
  const list = tracks.length > 0 ? tracks : data.tracks.items;

  const randomTrack =
    list[Math.floor(Math.random() * list.length)];

  res.status(200).json({
    name: randomTrack.name,
    artist: randomTrack.artists[0].name,
    year: randomTrack.album.release_date.substring(0, 4),
    url: randomTrack.external_urls.spotify,
    cover: randomTrack.album.images[0].url,
    uri: randomTrack.uri
  });
}
