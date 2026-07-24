// Como updateRefresh.js, pero en vez de tus top 4 álbumes, sube tus top 4
// CANCIONES sin repetir artista: si tenés 3 canciones de Pink Floyd en el
// top, se toma solo la más alta (la #1) y se sigue bajando en el ranking
// hasta completar 4 canciones de 4 artistas distintos.
// No toca core.js/server.js/updateRefresh.js: reusa lo que ya exportan, pero
// arma los campos de Discord acá mismo para poder truncarlos a 20 caracteres.
//   bun updateRefreshTopTracksDiverse.js            -> range "month"
//   bun updateRefreshTopTracksDiverse.js 6months    -> range "6months"
//   bun updateRefreshTopTracksDiverse.js alltime    -> range "alltime"
import dotenv from "dotenv";
dotenv.config();

const { RANGE_MAP, getValidAccessToken } = await import("./core.js");

const { DISCORD_APP_ID, DISCORD_USER_ID, DISCORD_BOT_TOKEN } = process.env;

const MAX_NAME_LEN = 20;
const MAX_DESC_LEN = 35;

function truncate(str, maxLen) {
  if (!str) return str;
  return str.length > maxLen ? str.slice(0, maxLen - 3) + "..." : str;
}

// Recorre el top de tracks (ya viene ordenado por ranking) y se queda con la
// primera canción de cada artista, hasta juntar `limit` artistas distintos.
function pickTopTrackPerArtist(tracks, limit) {
  const seenArtists = new Set();
  const picked = [];

  for (const track of tracks) {
    const artistKey = track.artists?.[0]?.id || track.artists?.[0]?.name;
    if (seenArtists.has(artistKey)) continue;

    seenArtists.add(artistKey);
    picked.push(track);

    if (picked.length === limit) break;
  }

  return picked;
}

async function fetchTopTracksByArtist(range, limit) {
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

  const tracks = pickTopTrackPerArtist(data.items, limit).map((track, index) => ({
    position: index + 1,
    id: track.id,
    songName: track.name,
    desc: `${track.album.name} · ${track.artists.map((a) => a.name).join(", ")}`,
    albumName: track.album.name,
    artistName: track.artists.map((a) => a.name).join(", "),
    image: track.album.images?.[0]?.url || null,
    spotifyUrl: track.external_urls.spotify,
  }));

  return { tracks, allItems: data.items };
}

// Toma release_date de cada canción del top (formato puede venir como "1994",
// "1994-05" o "1994-05-10") y devuelve el promedio como Date.
function averageReleaseDate(items) {
  const timestamps = items
    .map((track) => track.album?.release_date)
    .filter(Boolean)
    .map((releaseDate) => {
      const [year, month = "01", day = "01"] = releaseDate.split("-");
      return new Date(`${year}-${month}-${day}`).getTime();
    })
    .filter((ts) => !Number.isNaN(ts));

  if (timestamps.length === 0) return null;

  const avgTs = timestamps.reduce((sum, ts) => sum + ts, 0) / timestamps.length;
  return new Date(avgTs);
}

function calculateMusicalAge(items) {
  const avgDate = averageReleaseDate(items);
  if (!avgDate) return null;

  const ageMs = Date.now() - avgDate.getTime();
  const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);

  return { ageYears, avgDate };
}

function buildDiscordDynamicFields(tracks) {
  const dynamic = [];

  const topSong = tracks[0];
  if (topSong) {
    dynamic.push(
      { name: "topSongName", type: 1, value: truncate(topSong.songName, MAX_NAME_LEN) },
      { name: "topSongAlbumName", type: 1, value: topSong.albumName },
      { name: "topSongAuthor", type: 1, value: topSong.artistName }
    );
    if (topSong.image) {
      dynamic.push({ name: "topSongAlbum", type: 3, value: { url: topSong.image } });
    }
  }

  tracks.slice(1, 5).forEach((track, index) => {
    const n = index + 1;
    dynamic.push(
      { name: `song${n}name`, type: 1, value: truncate(track.songName, MAX_NAME_LEN) },
      { name: `song${n}desc`, type: 1, value: truncate(track.desc, MAX_DESC_LEN) },
      { name: `song${n}album`, type: 3, value: { url: track.image } }
    );
  });

  return dynamic;
}

async function updateDiscordProfile(tracks) {
  if (!DISCORD_APP_ID || !DISCORD_USER_ID || !DISCORD_BOT_TOKEN) {
    throw new Error("NO_DISCORD_CONFIG");
  }

  const body = { data: { dynamic: buildDiscordDynamicFields(tracks) } };

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

const range = process.argv[2] || "month"; // month | 6months | alltime

try {
  const rangeParam = RANGE_MAP[range] || "short_term";
  const { tracks, allItems } = await fetchTopTracksByArtist(rangeParam, 5);
  const discord = await updateDiscordProfile(tracks);

  console.log("OK: Discord profile updated with (no artist repeat, name <=20, desc <=35):");
  tracks.forEach((t) =>
    console.log(
      `  ${t.position}. ${truncate(t.songName, MAX_NAME_LEN)}  ·  ${truncate(t.desc, MAX_DESC_LEN)}`
    )
  );
  console.log("Discord said:", discord ?? "204 (all ok)");

  const musicalAge = calculateMusicalAge(allItems);
  if (musicalAge) {
    const { ageYears, avgDate } = musicalAge;
    const avgDateStr = avgDate.toISOString().slice(0, 10);
    console.log(`Your average musical age is ${ageYears.toFixed(1)} (${avgDateStr})`);
  }
} catch (err) {
  if (err.message === "NO_AUTH") {
    console.error("SPOTIFY IS NOT AUTHORIZED");
  } else if (err.message === "NO_DISCORD_CONFIG") {
    console.error("Missing DISCORD_APP_ID / DISCORD_USER_ID / DISCORD_BOT_TOKEN");
  } else if (err.message === "SPOTIFY_ERROR") {
    console.error(`Spotify error ${err.status}:`, err.body);
  } else if (err.message === "DISCORD_ERROR") {
    console.error(`Discord error ${err.status}:`, err.body);
  } else {
    console.error("Error:", err.message);
  }
  process.exit(1);
}
