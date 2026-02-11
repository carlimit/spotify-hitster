const CLIENT_ID = "c6cc6b6bb4a5414781ab9d9f3baf416e";
const REDIRECT_URI = "https://spotify-hitster.vercel.app/";
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";
const RESPONSE_TYPE = "token";

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private"
];

export const loginUrl = `${AUTH_ENDPOINT}?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPES.join(
  "%20"
)}&response_type=${RESPONSE_TYPE}&show_dialog=true`;
