// Lógica compartida entre el server HTTP (server.js) y el script standalone
// (updateRefresh.js). Acá vive todo lo que habla con Spotify y con Discord.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_FILE = path.join(__dirname, "tokens.json");

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  DISCORD_APP_ID,
  DISCORD_USER_ID,
  DISCORD_BOT_TOKEN,
} = process.env;

// Spotify no calcula por mes calendario; short_term son ~4 semanas.
export const RANGE_MAP = {
  month: "short_term", // ~4 semanas
  "6months": "medium_term", // ~6 meses
  alltime: "long_term", // varios años
};

// ---------- Persistencia simple de tokens en disco ----------
function loadTokens() {
  if (!fs.existsSync(TOKENS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function saveTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

// ---------- Manejo de access_token ----------
// Refresca el access_token usando el refresh_token guardado, si ya venció.
export async function getValidAccessToken() {
  const tokens = loadTokens();

  if (!tokens.refresh_token) {
    throw new Error("NO_AUTH"); // todavía no se hizo login nunca
  }

  const stillValid =
    tokens.access_token && tokens.expires_at && Date.now() < tokens.expires_at - 30_000;
  if (stillValid) return tokens.access_token;

  const refreshRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });

  const data = await refreshRes.json();

  if (!refreshRes.ok) {
    throw new Error("REFRESH_FAILED: " + JSON.stringify(data));
  }

  const updated = {
    refresh_token: data.refresh_token || tokens.refresh_token, // a veces Spotify no manda uno nuevo
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  saveTokens(updated);

  return updated.access_token;
}

// Spotify no expone "top albums", así que lo armamos agregando los álbumes
// que aparecen en tus top tracks, ordenados por cantidad de tracks presentes
// (y desempatando por popularidad promedio).
export async function fetchTopAlbums(range, limit) {
  const accessToken = await getValidAccessToken();

  const spotifyRes = await fetch(
    `https://api.spotify.com/v1/me/top/tracks?time_range=${range}&limit=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const data = await spotifyRes.json();

  if (!spotifyRes.ok) {
    const err = new Error("SPOTIFY_ERROR");
    err.status = spotifyRes.status;
    err.body = data;
    throw err;
  }

  const albumsById = new Map();

  for (const track of data.items) {
    const album = track.album;
    const existing = albumsById.get(album.id);

    if (existing) {
      existing.trackCount += 1;
      existing.popularitySum += track.popularity;
    } else {
      // data.items viene ordenado por ranking, así que el primer track que
      // vemos de cada álbum es el más escuchado de ese álbum.
      albumsById.set(album.id, {
        id: album.id,
        name: album.name,
        artists: album.artists.map((a) => a.name).join(", "),
        topTrack: track.name,
        image: album.images?.[0]?.url || null,
        spotifyUrl: album.external_urls.spotify,
        releaseDate: album.release_date,
        trackCount: 1,
        popularitySum: track.popularity,
      });
    }
  }

  return Array.from(albumsById.values())
    .sort((a, b) => {
      if (b.trackCount !== a.trackCount) return b.trackCount - a.trackCount;
      return b.popularitySum / b.trackCount - a.popularitySum / a.trackCount;
    })
    .slice(0, limit)
    .map((album, index) => ({
      position: index + 1,
      id: album.id,
      name: album.name,
      artists: album.artists,
      topTrack: album.topTrack,
      image: album.image,
      spotifyUrl: album.spotifyUrl,
      releaseDate: album.releaseDate,
      trackCount: album.trackCount,
      avgPopularity: Math.round(album.popularitySum / album.trackCount),
    }));
}

// ---------- Perfil de Discord con los top álbumes ----------
export function buildDiscordDynamicFields(albums) {
  const dynamic = [];

  albums.slice(0, 4).forEach((album, index) => {
    const n = index + 1;
    dynamic.push(
      // Título: la canción más escuchada de ese álbum.
      { name: `song${n}name`, type: 1, value: album.topTrack || album.name },
      // Descripción: "Álbum · Artista".
      { name: `song${n}desc`, type: 1, value: `${album.name} · ${album.artists}` },
      { name: `song${n}album`, type: 3, value: { url: album.image } }
    );
  });

  if (albums[0]?.image) {
    dynamic.push({ name: "heroMiniProfile", type: 3, value: { url: albums[0].image } });
  }

  return dynamic;
}

// Manda el PATCH al perfil de identidad de Discord. Devuelve el body parseado
// (Discord suele responder 204 sin body, así que puede ser null).
export async function updateDiscordProfile(albums) {
  if (!DISCORD_APP_ID || !DISCORD_USER_ID || !DISCORD_BOT_TOKEN) {
    throw new Error("NO_DISCORD_CONFIG");
  }

  const body = { data: { dynamic: buildDiscordDynamicFields(albums) } };

  const discordRes = await fetch(
    `https://discord.com/api/v9/applications/${DISCORD_APP_ID}/users/${DISCORD_USER_ID}/identities/0/profile`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        "User-Agent": "DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const discordData = await discordRes.json().catch(() => null);

  if (!discordRes.ok) {
    const err = new Error("DISCORD_ERROR");
    err.status = discordRes.status;
    err.body = discordData;
    throw err;
  }

  return discordData;
}

// Todo el flujo de una: trae top álbumes reales y actualiza el perfil.
export async function refreshDiscordProfile(rangeKey = "month") {
  const range = RANGE_MAP[rangeKey] || "short_term";
  const albums = await fetchTopAlbums(range, 4);
  const discord = await updateDiscordProfile(albums);
  return { range, albums, discord };
}
