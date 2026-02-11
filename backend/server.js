import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());

let accessToken = "";

async function getToken() {
  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({
      grant_type: "client_credentials"
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.SPOTIFY_CLIENT_ID +
              ":" +
              process.env.SPOTIFY_CLIENT_SECRET
          ).toString("base64")
      }
    }
  );

  accessToken = response.data.access_token;
}

app.get("/track", async (req, res) => {
  const genre = req.query.genre;

  try {
    const randomOffset = Math.floor(Math.random() * 500);

    const response = await axios.get(
      "https://api.spotify.com/v1/search",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        params: {
          q: `genre:${genre}`,
          type: "track",
          limit: 50,
          offset: randomOffset
        }
      }
    );

    let tracks = response.data.tracks.items.filter(
  t => t.popularity > 50
);

// Fallback falls zu streng gefiltert wurde
if (tracks.length === 0) {
  tracks = response.data.tracks.items;
}

if (tracks.length === 0) {
  return res.status(404).json({ error: "No tracks found" });
}

const randomTrack =
  tracks[Math.floor(Math.random() * tracks.length)];


    res.json({
      name: randomTrack.name,
      artist: randomTrack.artists[0].name,
      year: randomTrack.album.release_date.substring(0, 4),
      url: randomTrack.external_urls.spotify,
      cover: randomTrack.album.images[0].url
    });

  } catch (err) {
    res.status(500).json({ error: "Spotify error" });
  }
});

app.listen(3001, async () => {
  await getToken();
  console.log("Spotify backend running on port 3001");
});
