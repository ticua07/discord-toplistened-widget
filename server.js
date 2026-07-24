import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

import {
  RANGE_MAP,
  saveTokens,
  getValidAccessToken,
  fetchTopAlbums,
  updateDiscordProfile,
} from "./core.js";

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  DISCORD_APP_ID,
  DISCORD_USER_ID,
  DISCORD_BOT_TOKEN,
  PORT = 8888,
  ALLOWED_ORIGINS = "",
} = process.env;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
  console.error(
    "Falta configurar SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REDIRECT_URI en el .env"
  );
  process.exit(1);
}

const app = express();

const allowedOrigins = ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : "*",
  })
);

// ---------- Paso 1: login ----------
// Te manda a la pantalla de autorización de Spotify.
app.get("/login", (req, res) => {
  const state = crypto.randomBytes(8).toString("hex");
  const scope = "user-top-read user-read-recently-played";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// ---------- Paso 2: callback ----------
// Spotify te redirige acá con un "code" que canjeamos por access_token + refresh_token.
app.get("/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).send(`Spotify devolvió un error: ${error}`);
  }

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64"),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
      }),
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error(data);
      return res.status(400).json(data);
    }

    saveTokens({
      refresh_token: data.refresh_token,
      access_token: data.access_token,
      expires_at: Date.now() + data.expires_in * 1000,
    });

    res.send(
      "Listo, quedó autorizado. Ya podés cerrar esta pestaña y usar /api/top-tracks."
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Error canjeando el code por tokens");
  }
});

// ---------- Endpoint que consume tu web ----------
// (getValidAccessToken, fetchTopAlbums, RANGE_MAP, etc. viven en core.js)
app.get("/api/top-tracks", async (req, res) => {
  const range = RANGE_MAP[req.query.range] || "short_term";
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  try {
    const accessToken = await getValidAccessToken();

    const spotifyRes = await fetch(
      `https://api.spotify.com/v1/me/top/tracks?time_range=${range}&limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data = await spotifyRes.json();

    if (!spotifyRes.ok) {
      return res.status(spotifyRes.status).json(data);
    }

    // Achicamos la respuesta a lo que probablemente necesitás en la web
    const tracks = data.items.map((track, index) => ({
      position: index + 1,
      id: track.id,
      name: track.name,
      artists: track.artists.map((a) => a.name).join(", "),
      album: track.album.name,
      albumImage: track.album.images?.[0]?.url || null,
      previewUrl: track.preview_url,
      spotifyUrl: track.external_urls.spotify,
      durationMs: track.duration_ms,
      popularity: track.popularity,
    }));

    res.json({
      range,
      count: tracks.length,
      updatedAt: new Date().toISOString(),
      tracks,
    });
  } catch (err) {
    if (err.message === "NO_AUTH") {
      return res.status(401).json({
        error: "Todavía no autorizaste la app. Abrí /login primero.",
      });
    }
    console.error(err);
    res.status(500).json({ error: "Error consultando Spotify", detail: err.message });
  }
});

app.get("/api/top-albums", async (req, res) => {
  const range = RANGE_MAP[req.query.range] || "short_term";
  const limit = Math.min(parseInt(req.query.limit) || 5, 5);

  try {
    const albums = await fetchTopAlbums(range, limit);

    res.json({
      range,
      count: albums.length,
      updatedAt: new Date().toISOString(),
      albums,
    });
  } catch (err) {
    if (err.message === "NO_AUTH") {
      return res.status(401).json({
        error: "Todavía no autorizaste la app. Abrí /login primero.",
      });
    }
    if (err.message === "SPOTIFY_ERROR") {
      return res.status(err.status).json(err.body);
    }
    console.error(err);
    res.status(500).json({ error: "Error consultando Spotify", detail: err.message });
  }
});

// ---------- Perfil de Discord con los top álbumes ----------
// Trae los top 4 álbumes reales y actualiza el perfil (lógica en core.js).
app.post("/api/discord/refresh-profile", async (req, res) => {
  const range = RANGE_MAP[req.query.range] || "short_term";

  try {
    const albums = await fetchTopAlbums(range, 4);
    const discordData = await updateDiscordProfile(albums);

    res.json({
      range,
      updatedAt: new Date().toISOString(),
      albums,
      discord: discordData,
    });
  } catch (err) {
    if (err.message === "NO_AUTH") {
      return res.status(401).json({
        error: "Todavía no autorizaste la app. Abrí /login primero.",
      });
    }
    if (err.message === "NO_DISCORD_CONFIG") {
      return res.status(500).json({
        error: "Falta configurar DISCORD_APP_ID / DISCORD_USER_ID / DISCORD_BOT_TOKEN en el .env",
      });
    }
    if (err.message === "SPOTIFY_ERROR") {
      return res.status(err.status).json(err.body);
    }
    if (err.message === "DISCORD_ERROR") {
      console.error(`Error de Discord ${err.status}:`, err.body);
      return res.status(err.status).json(err.body);
    }
    console.error(err);
    res.status(500).json({ error: "Error actualizando el perfil de Discord", detail: err.message });
  }
});

// Últimos temas escuchados (historial reciente, no "top" por ranking).
app.get("/api/recent-tracks", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 5, 5);

  try {
    const accessToken = await getValidAccessToken();

    const spotifyRes = await fetch(
      `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data = await spotifyRes.json();

    if (!spotifyRes.ok) {
      return res.status(spotifyRes.status).json(data);
    }

    const tracks = data.items.map((item, index) => ({
      position: index + 1,
      id: item.track.id,
      name: item.track.name,
      artists: item.track.artists.map((a) => a.name).join(", "),
      album: item.track.album.name,
      albumImage: item.track.album.images?.[0]?.url || null,
      spotifyUrl: item.track.external_urls.spotify,
      playedAt: item.played_at,
    }));

    res.json({
      count: tracks.length,
      updatedAt: new Date().toISOString(),
      tracks,
    });
  } catch (err) {
    if (err.message === "NO_AUTH") {
      return res.status(401).json({
        error: "Todavía no autorizaste la app. Abrí /login primero.",
      });
    }
    console.error(err);
    res.status(500).json({ error: "Error consultando Spotify", detail: err.message });
  }
});

app.get("/", (req, res) => {
  res.send(
    'API de top tracks de Spotify corriendo. Empezá en <a href="/login">/login</a>'
  );
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://127.0.0.1:${PORT}`);
  console.log(`Para autorizar: http://127.0.0.1:${PORT}/login`);
});
