/**
 * Spark Lyric Video Generator Server
 * Unified Service:
 *  - JioSaavn Song Search & Meta
 *  - Audio Decryption (DES-EDE3-ECB) & Range Stream Proxy
 *  - JioSaavn + LRCLIB Synced Lyrics
 *  - Background Management (assets/background)
 *  - ASS Subtitle Generator with pop animation styles
 *  - FFmpeg Video Renderer (16:9 1080p, blur, darkness overlay, animated lyrics)
 */

import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import CryptoJS from "crypto-js";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import https from "node:https";
import http from "node:http";
import dns from "node:dns";
import "dotenv/config";

dns.setDefaultResultOrder("ipv4first");
import { ObjectId } from "mongodb";
import {
  getDb,
  withMongo,
  AUTOMATION_FONTS,
  AUTOMATION_ANIMATIONS,
  getRandomElement,
  getRandomBackground,
  generateThumbnail,
  formatYouTubeDescription,
  detectScript,
  resolveFontForText,
} from "./automation.js";
import {
  getYouTubeAuthUrl,
  handleYouTubeCallback,
  isYouTubeAuthenticated,
  uploadVideoToYouTube,
} from "./youtube.js";
import {
  hasNonLatinScript,
  transliterateLyricsToRomanized,
  transliterateTextToRomanized,
  findLyricsWithGroq,
  isGroqConfigured,
  DEFAULT_GROQ_MODEL,
} from "./groq.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

// Directories
const DIRS = {
  assets: path.join(__dirname, "assets"),
  backgrounds: path.join(__dirname, "assets", "background"),
  output: path.join(__dirname, "output"),
  temp: path.join(__dirname, "temp"),
  public: path.join(__dirname, "public"),
  bin: path.join(__dirname, "bin"),
};

for (const p of Object.values(DIRS)) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

/* ------------------------------------------------------------------ */
/*  Cross-Platform FFmpeg Detection & Hardware Acceleration Probing  */
/* ------------------------------------------------------------------ */
function getFFmpegPath() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  const isWin = process.platform === "win32";
  const binaryNames = isWin ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg", "ffmpeg.exe"];

  for (const name of binaryNames) {
    // 1. Check ./ffmpeg/bin/
    const gpuBin = path.join(__dirname, "ffmpeg", "bin", name);
    if (fs.existsSync(gpuBin)) return gpuBin;

    // 2. Check ./bin/
    const localBin = path.join(DIRS.bin, name);
    if (fs.existsSync(localBin)) return localBin;
  }

  // 3. Common Linux system paths (Ubuntu 24.04 / Debian)
  if (!isWin) {
    const linuxPaths = ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/snap/bin/ffmpeg"];
    for (const lp of linuxPaths) {
      if (fs.existsSync(lp)) return lp;
    }
  }

  // 4. Default to system PATH
  return "ffmpeg";
}

const ENCODER_INFO = {
  tested: false,
  hasNvenc: false,
  activeMode: "cpu", // "nvenc" or "cpu"
  preferredEncoder: "libx264",
  ffmpegPath: getFFmpegPath(),
  isFreeTierCpu: os.cpus().length <= 2,
  cpuPreset: "veryfast",
  cpuCrf: "23",
  cpuThreads: "0",
  cpuCores: os.cpus().length,
  cpuModel: os.cpus()[0]?.model || "Unknown CPU",
  osInfo: `${os.type()} ${os.release()} (${os.arch()})`,
};

function ensureLinuxFontRegistration() {
  if (process.platform === "win32") return;
  try {
    const homeDir = os.homedir();
    const linuxFontDir = path.join(homeDir, ".local", "share", "fonts");
    const fontSrc = path.join(DIRS.assets, "fonts", "edosz.ttf");
    const target = path.join(linuxFontDir, "edosz.ttf");
    if (fs.existsSync(fontSrc) && !fs.existsSync(target)) {
      fs.mkdirSync(linuxFontDir, { recursive: true });
      fs.copyFileSync(fontSrc, target);
      spawnSync("fc-cache", ["-f"], { stdio: "ignore" });
      console.log("[fonts] Automatically registered Edo font with fontconfig on Linux");
    }
  } catch (err) {
    console.warn("[fonts] Linux font auto-registration notice:", err.message);
  }
}
ensureLinuxFontRegistration();

function detectHardwareAcceleration() {
  const ffmpegExe = getFFmpegPath();
  ENCODER_INFO.ffmpegPath = ffmpegExe;
  ENCODER_INFO.isFreeTierCpu = os.cpus().length <= 2;
  ENCODER_INFO.cpuPreset = process.env.CPU_PRESET || (ENCODER_INFO.isFreeTierCpu ? "veryfast" : "faster");
  ENCODER_INFO.cpuCrf = process.env.CPU_CRF || "23";
  ENCODER_INFO.cpuThreads = process.env.CPU_THREADS || (ENCODER_INFO.isFreeTierCpu ? String(os.cpus().length) : "0");

  const envOverride = (process.env.VIDEO_ENCODER || "").toLowerCase();
  if (envOverride === "cpu" || envOverride === "libx264") {
    ENCODER_INFO.tested = true;
    ENCODER_INFO.hasNvenc = false;
    ENCODER_INFO.activeMode = "cpu";
    ENCODER_INFO.preferredEncoder = "libx264";
    console.log(`[encoder] VIDEO_ENCODER=cpu override active. Using libx264 (${ENCODER_INFO.cpuPreset} preset, ${ENCODER_INFO.cpuThreads} threads).`);
    return;
  }

  console.log(`[encoder] Probing hardware acceleration on ${os.platform()} (${ENCODER_INFO.cpuCores} vCPUs)...`);

  try {
    const probe = spawnSync(
      ffmpegExe,
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=256x256:d=0.1",
        "-c:v",
        "h264_nvenc",
        "-f",
        "null",
        "-",
      ],
      { timeout: 8000 }
    );

    if (probe.status === 0) {
      ENCODER_INFO.hasNvenc = true;
      ENCODER_INFO.activeMode = "nvenc";
      ENCODER_INFO.preferredEncoder = "h264_nvenc";
      console.log(`[encoder] ✔ NVIDIA NVENC hardware acceleration verified & ready! (RTX GPU detected)`);
    } else {
      ENCODER_INFO.hasNvenc = false;
      ENCODER_INFO.activeMode = "cpu";
      ENCODER_INFO.preferredEncoder = "libx264";
      console.log(`[encoder] ℹ No NVENC hardware detected or probe failed. Configured for CPU operation (libx264 ${ENCODER_INFO.cpuPreset} preset, ${ENCODER_INFO.cpuThreads} threads).`);
    }
  } catch (err) {
    ENCODER_INFO.hasNvenc = false;
    ENCODER_INFO.activeMode = "cpu";
    ENCODER_INFO.preferredEncoder = "libx264";
    console.log(`[encoder] ℹ Encoder probe error (${err.message}). Defaulting to CPU libx264.`);
  }

  ENCODER_INFO.tested = true;
}

detectHardwareAcceleration();

/* ------------------------------------------------------------------ */
/*  Config & Headers                                                   */
/* ------------------------------------------------------------------ */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";

const SAAVN_HEADERS = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.jiosaavn.com/",
  Origin: "https://www.jiosaavn.com",
  "Accept-Language": "en-US,en;q=0.9,hi;q=0.8",
  "sec-ch-ua":
    '"Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
};

const SAAVN_SEARCH =
  "https://www.jiosaavn.com/api.php?p=%page&q=%q" +
  "&_format=json&_marker=0&api_version=4&ctx=web6dot0" +
  "&n=%n&__call=%call";

const SAAVN_SONG_DETAILS =
  "https://www.jiosaavn.com/api.php?__call=song.getDetails" +
  "&pids=%s&_format=json&_marker=0&api_version=4&ctx=web6dot0";

const SAAVN_WEBAPI =
  "https://www.jiosaavn.com/api.php?__call=webapi.get&token=%s" +
  "&type=%t&includeMetaTags=0&ctx=web6dot0&api_version=4&_format=json&_marker=0";

const SAAVN_LYRICS =
  "https://www.jiosaavn.com/api.php?__call=lyrics.getLyrics" +
  "&ctx=web6dot0&api_version=4&_format=json&lyrics_id=%s";

const ALLOWED_HOSTS = [
  /(^|\.)saavncdn\.com$/i,
  /(^|\.)jiosaavn\.com$/i,
  /(^|\.)saavn\.dev$/i,
];

const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "cache-control",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
async function rawGet(url, headers = SAAVN_HEADERS) {
  try {
    const r = await fetch(url, { headers });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch { }
    return { status: r.status, url, text, json };
  } catch (e) {
    return { status: 0, url, text: String(e), json: null };
  }
}

function decodeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<br\s*\/?>/gi, "\n");
}

function normaliseLyrics(raw) {
  if (!raw) return "";
  return decodeHtml(String(raw))
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseLrc(lrc) {
  if (!lrc) return [];
  const lines = lrc.split(/\r?\n/);
  const out = [];
  const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  for (const line of lines) {
    const stamps = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const frac = m[3] ? parseInt(m[3].padEnd(3, "0").slice(0, 3), 10) : 0;
      stamps.push(min * 60000 + sec * 1000 + frac);
    }
    const text = line.replace(re, "").trim();
    if (!stamps.length) continue;
    for (const t of stamps) {
      out.push({ timeMs: t, text });
    }
  }
  return out.sort((a, b) => a.timeMs - b.timeMs);
}

/* ------------------------------------------------------------------ */
/*  Crypto helpers — DES-ECB, key "38346591", PKCS7                    */
/* ------------------------------------------------------------------ */
function decryptMediaUrlFull(encryptedB64) {
  if (!encryptedB64 || typeof encryptedB64 !== "string") {
    return { url: null, via: null, error: "empty input" };
  }
  const b64 = encryptedB64.trim();

  let nativeErr = null;
  try {
    const k = Buffer.from("38346591", "utf8");
    const key = Buffer.concat([k, k, k]);
    const d = crypto.createDecipheriv("des-ede3", key, null);
    d.setAutoPadding(true);
    const out = Buffer.concat([
      d.update(Buffer.from(b64, "base64")),
      d.final(),
    ]).toString("utf8");
    if (/^https?:\/\//i.test(out)) {
      return { url: out.replace(/^http:/, "https:"), via: "native-des-ecb" };
    }
    return {
      url: null,
      via: "native-des-ecb",
      error: "output not a URL: " + out.slice(0, 60),
    };
  } catch (e1) {
    nativeErr = e1.message;
  }

  try {
    const key = CryptoJS.enc.Utf8.parse("38346591");
    const cp = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(b64),
    });
    const decrypted = CryptoJS.TripleDES.decrypt(cp, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    const text = decrypted.toString(CryptoJS.enc.Utf8);
    if (/^https?:\/\//i.test(text)) {
      return { url: text.replace(/^http:/, "https:"), via: "crypto-js-ecb" };
    }
    return {
      url: null,
      via: "crypto-js-ecb",
      error: "output not a URL: " + (text ? text.slice(0, 60) : "(empty)"),
    };
  } catch (e2) {
    return {
      url: null,
      via: null,
      error: `native: ${nativeErr || "?"} | crypto-js: ${e2.message}`,
    };
  }
}

function buildQualityUrls(url96) {
  const base = url96.replace(/_(96|160|320|48)\.mp4.*$/, "");
  return [
    { quality: "320kbps", url: `${base}_320.mp4` },
    { quality: "160kbps", url: `${base}_160.mp4` },
    { quality: "96kbps", url: `${base}_96.mp4` },
    { quality: "48kbps", url: `${base}_48.mp4` },
  ];
}

function formatDurationSec(sec) {
  const s = Math.round(Number(sec) || 0);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

function shapeSong(s) {
  const mi = s.more_info || {};
  return {
    id: s.id,
    title: decodeHtml(s.title),
    subtitle: decodeHtml(s.subtitle),
    type: s.type,
    permaUrl: s.perma_url,
    image: (s.image || "").replace("150x150", "500x500"),
    language: s.language,
    year: s.year,
    playCount: Number(s.play_count || 0),
    explicit: s.explicit_content === "1",
    duration: Number(mi.duration || 0),
    album: decodeHtml(mi.album || ""),
    albumId: mi.album_id,
    label: mi.label,
    has320: mi["320kbps"] === "true",
    artists: {
      primary: (mi.artistMap?.primary_artists || []).map((a) => ({
        id: a.id,
        name: decodeHtml(a.name),
        role: a.role,
      })),
      featured: (mi.artistMap?.featured_artists || []).map((a) => ({
        id: a.id,
        name: decodeHtml(a.name),
      })),
      all: (mi.artistMap?.artists || []).map((a) => ({
        id: a.id,
        name: decodeHtml(a.name),
        role: a.role,
      })),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Saavn Details Resolvers                                            */
/* ------------------------------------------------------------------ */
function extractEncrypted(song) {
  const mi = song?.more_info || {};
  return (
    mi.encrypted_media_url ||
    mi.encrypted_media_path ||
    song?.encrypted_media_url ||
    song?.encrypted_media_path ||
    null
  );
}

function extractPlainUrl(song) {
  const mi = song?.more_info || {};
  const candidates = [
    mi.media_url,
    mi.media_preview_url,
    song?.media_url,
    song?.media_preview_url,
    song?.url,
  ].filter(Boolean);
  for (const c of candidates) {
    if (/^https?:\/\//i.test(c) && /saavncdn\.com/i.test(c)) return c;
  }
  return null;
}

async function fetchViaSongDetails(id) {
  const url = SAAVN_SONG_DETAILS.replace("%s", encodeURIComponent(id));
  const r = await rawGet(url);
  const song = r.json?.songs?.[0];
  if (!song) return { ok: false, raw: r };
  const enc = extractEncrypted(song);
  const plain = extractPlainUrl(song);
  if (!enc && !plain) return { ok: false, raw: r, song };
  return { ok: true, raw: r, song, encrypted: enc, plain };
}

async function fetchViaWebApi(id) {
  for (const type of ["song", "album", "playlist"]) {
    const url = SAAVN_WEBAPI.replace("%s", encodeURIComponent(id)).replace(
      "%t",
      type,
    );
    const r = await rawGet(url);
    const list = r.json?.songs || r.json?.list || (r.json?.id ? [r.json] : []);
    const pick =
      list.find((x) => extractEncrypted(x) || extractPlainUrl(x)) || null;
    if (pick) {
      return {
        ok: true,
        kind: type,
        song: pick,
        encrypted: extractEncrypted(pick),
        plain: extractPlainUrl(pick),
      };
    }
  }
  return { ok: false };
}

async function resolveAny(id) {
  const details = await fetchViaSongDetails(id);
  if (details.ok) {
    return {
      kind: "song",
      source: "song.getDetails",
      song: details.song,
      encrypted: details.encrypted,
      plain: details.plain,
    };
  }
  const legacy = await fetchViaWebApi(id);
  if (legacy.ok) {
    return {
      kind: legacy.kind,
      source: "webapi.get",
      song: legacy.song,
      encrypted: legacy.encrypted,
      plain: legacy.plain,
    };
  }
  return { kind: null, raw: details.raw };
}

async function fetchSongMeta(songId) {
  const url = SAAVN_SONG_DETAILS.replace("%s", encodeURIComponent(songId));
  const r = await rawGet(url);
  const s = r.json?.songs?.[0];
  if (!s) return null;
  const mi = s.more_info || {};
  return {
    title: decodeHtml(s.title || ""),
    artists: (mi.artistMap?.primary_artists || []).map((a) =>
      decodeHtml(a.name),
    ),
    duration: Number(mi.duration || 0),
    album: decodeHtml(mi.album || ""),
  };
}

async function fetchSaavnLyrics(songId) {
  const url = SAAVN_LYRICS.replace("%s", encodeURIComponent(songId));
  const r = await rawGet(url);
  if (!r.json) return { ok: false, reason: "empty response" };

  const lyricsRaw =
    r.json.lyrics ||
    r.json.lyrics_text ||
    r.json.data?.lyrics ||
    r.json.song?.lyrics ||
    "";
  const snippet = r.json.snippet || r.json.lyrics_snippet || "";

  if (!lyricsRaw && !snippet) {
    return { ok: false, reason: "no lyrics field" };
  }

  return {
    ok: true,
    lyrics: normaliseLyrics(lyricsRaw),
    snippet: normaliseLyrics(snippet),
    copyright: r.json.copyright || r.json.song?.copyright || null,
  };
}

async function fetchLrclib(meta) {
  if (!meta?.title) return null;
  const artist = meta.artists?.[0] || "";
  const params = new URLSearchParams({
    track_name: meta.title,
    artist_name: artist,
  });
  if (meta.album) params.set("album_name", meta.album);
  if (meta.duration) params.set("duration", String(meta.duration));

  const url = `https://lrclib.net/api/get?${params.toString()}`;
  const r = await rawGet(url, {
    "User-Agent": "SaavnLyricsGenerator/2.0 (web-app)",
    Accept: "application/json",
  });

  if (!r.json) return null;
  const synced = r.json.syncedLyrics || "";
  const plain = r.json.plainLyrics || "";
  if (!synced && !plain) return null;

  return {
    synced: synced ? normaliseLyrics(synced) : null,
    plain: plain ? normaliseLyrics(plain) : null,
    source: "lrclib",
  };
}

/* ------------------------------------------------------------------ */
/*  Middleware                                                         */
/* ------------------------------------------------------------------ */
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Static directories
app.use("/assets/background", express.static(DIRS.backgrounds));
app.use("/output", express.static(DIRS.output));
app.use(express.static(DIRS.public, { etag: false, maxAge: 0 }));

/* ------------------------------------------------------------------ */
/*  API 1: Song Search                                                */
/* ------------------------------------------------------------------ */
app.get("/api/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: 'missing "q"' });

  const n = Math.min(Number(req.query.n) || 20, 50);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const call = "search.getResults";

  const url = SAAVN_SEARCH.replace("%q", encodeURIComponent(q))
    .replace("%call", call)
    .replace("%page", String(page))
    .replace("%n", String(n));

  const r = await rawGet(url);
  if (!r.json) {
    return res.status(502).json({ error: "search failed", detail: r.text });
  }

  const results = r.json.results || r.json.songs || [];
  const items = results.map(shapeSong);

  res.json({
    query: q,
    total: Number(r.json.total) || items.length,
    count: items.length,
    items,
  });
});

/* ------------------------------------------------------------------ */
/*  API 2: Song Stream Details & Proxy URL                             */
/* ------------------------------------------------------------------ */
app.get("/api/song/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const resolved = await resolveAny(id);
    if (!resolved.kind) {
      return res.status(404).json({ error: "song not found", id });
    }

    const song = resolved.song;
    const mi = song.more_info || {};

    let finalUrl = null;
    let via = null;

    if (resolved.encrypted) {
      const d = decryptMediaUrlFull(resolved.encrypted);
      finalUrl = d.url;
      via = d.via;
    }
    if (!finalUrl && resolved.plain) {
      finalUrl = resolved.plain;
      via = "plain";
    }

    if (!finalUrl) {
      return res.status(500).json({ error: "no playable audio url found", id });
    }

    const downloadUrl = buildQualityUrls(finalUrl);
    const best = downloadUrl[0]; // 320kbps
    const origin = `${req.protocol}://${req.get("host")}`;

    res.json({
      id: song.id,
      title: decodeHtml(song.title || song.song || song.name),
      subtitle: decodeHtml(song.subtitle || ""),
      album: decodeHtml(mi.album || ""),
      year: song.year,
      duration: Number(mi.duration || song.duration || 0),
      language: song.language,
      image: (song.image || "").replace("150x150", "500x500"),
      artists: {
        primary: (
          mi.artistMap?.primary_artists ||
          mi.artistMap?.artists ||
          []
        ).map((a) => ({ id: a.id, name: decodeHtml(a.name) })),
      },
      downloadUrl,
      streamUrl: best.url,
      proxyUrl: `${origin}/api/stream?url=${encodeURIComponent(best.url)}`,
    });
  } catch (err) {
    res.status(502).json({ error: "resolve failed", detail: String(err) });
  }
});

/* ------------------------------------------------------------------ */
/*  API 3: Audio Streaming Proxy (Range-aware, Saavn CDN)             */
/* ------------------------------------------------------------------ */
app.get("/api/stream", async (req, res) => {
  const raw = req.query.url;
  if (!raw) return res.status(400).json({ error: 'missing "url" query param' });

  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }

  if (!ALLOWED_HOSTS.some((re) => re.test(target.hostname))) {
    return res
      .status(403)
      .json({ error: `host not allowed: ${target.hostname}` });
  }

  const headers = {
    "User-Agent": UA,
    Referer: "https://www.jiosaavn.com/",
    Origin: "https://www.jiosaavn.com",
    Accept: "*/*",
    "Accept-Encoding": "identity;q=1, *;q=0",
    "Cache-Control": "no-cache",
  };
  if (req.headers.range) headers.Range = req.headers.range;

  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    const upstream = await fetch(target, {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });

    res.status(upstream.status);
    for (const h of PASSTHROUGH_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "HEAD" || !upstream.body) return res.end();

    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on("error", () => {
      if (!res.writableEnded) res.destroy();
    });
    res.on("error", () => nodeStream.destroy());
    nodeStream.pipe(res);
  } catch (err) {
    if (controller.signal.aborted) return;
    res
      .status(502)
      .json({ error: "upstream fetch failed", detail: String(err) });
  }
});

/* ------------------------------------------------------------------ */
/*  API 4: Synced Lyrics                                              */
/* ------------------------------------------------------------------ */
async function getSyncedLyricsData(id, options = { romanize: true }) {
  try {
    const meta = await fetchSongMeta(id);
    if (!meta) return null;

    const saavn = await fetchSaavnLyrics(id);
    const lrclib = await fetchLrclib(meta);

    let lrc = lrclib?.synced || null;
    let lines = lrc ? parseLrc(lrc) : [];
    let plainLyrics = lrclib?.plain || saavn?.lyrics || null;

    // Transliterate lyrics if non-Latin (Devanagari, Gurmukhi, etc.) to Romanized English letters using Groq
    if (options.romanize && isGroqConfigured() && lines.length > 0) {
      const needsTransliteration = lines.some((l) => hasNonLatinScript(l.text));
      if (needsTransliteration) {
        try {
          const singerStr = Array.isArray(meta.artists)
            ? meta.artists.map((a) => (typeof a === "object" ? a.name : a)).join(", ")
            : String(meta.artists || "");
          lines = await transliterateLyricsToRomanized(lines, {
            title: meta.title,
            singer: singerStr,
          });
        } catch (transErr) {
          console.warn("[lyrics] Groq transliteration warning:", transErr.message);
        }
      }
    }

    // Fallback: If no synced lyrics and no plain lyrics, attempt finding with Groq
    if (!lines.length && !plainLyrics && isGroqConfigured()) {
      try {
        const singerStr = Array.isArray(meta.artists)
          ? meta.artists.map((a) => (typeof a === "object" ? a.name : a)).join(", ")
          : String(meta.artists || "");
        const groqLyrics = await findLyricsWithGroq({
          title: meta.title,
          singer: singerStr,
        });
        if (groqLyrics?.lyrics) {
          plainLyrics = groqLyrics.lyrics;
        }
      } catch (findErr) {
        console.warn("[lyrics] Groq find lyrics warning:", findErr.message);
      }
    }

    return {
      id,
      title: meta.title,
      artists: meta.artists,
      album: meta.album,
      duration: meta.duration,
      synced: !!(lines && lines.length),
      source: lrc ? "lrclib" : saavn.lyrics ? "jiosaavn" : (plainLyrics ? "groq" : null),
      lyrics: plainLyrics,
      lrc,
      lines,
    };
  } catch (err) {
    console.warn(`[lyrics] Failed to fetch lyrics for ${id}:`, err.message);
    return null;
  }
}

app.get("/api/lyrics/:id/synced", async (req, res) => {
  const { id } = req.params;
  try {
    const data = await getSyncedLyricsData(id);
    if (!data) return res.status(404).json({ error: "song not found", id });

    if (!data.lrc && !data.lyrics) {
      return res.status(404).json({
        error: "no lyrics available",
        id,
        title: data.title,
      });
    }

    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "lyrics fetch failed", detail: String(err) });
  }
});

/* ------------------------------------------------------------------ */
/*  API 5: Background Images Management                               */
/* ------------------------------------------------------------------ */
app.get("/api/backgrounds", (_req, res) => {
  try {
    const files = fs
      .readdirSync(DIRS.backgrounds)
      .filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f));

    files.sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );

    const list = files.map((filename) => ({
      filename,
      url: `/assets/background/${encodeURIComponent(filename)}`,
    }));

    res.json({ backgrounds: list });
  } catch (err) {
    res
      .status(500)
      .json({ error: "failed to list backgrounds", detail: String(err) });
  }
});

app.post("/api/backgrounds/upload", (req, res) => {
  const { dataUrl, filename } = req.body;
  if (!dataUrl) return res.status(400).json({ error: "missing dataUrl" });

  try {
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: "invalid base64 image data" });
    }

    const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
    const safeName = `custom_${Date.now()}_${(filename || "bg").replace(/[^a-zA-Z0-9_-]/g, "_")}.${ext}`;
    const filePath = path.join(DIRS.backgrounds, safeName);

    fs.writeFileSync(filePath, Buffer.from(matches[2], "base64"));

    res.json({
      success: true,
      filename: safeName,
      url: `/assets/background/${encodeURIComponent(safeName)}`,
    });
  } catch (err) {
    res.status(500).json({ error: "failed to upload", detail: String(err) });
  }
});

/* ------------------------------------------------------------------ */
/*  ASS Subtitle Generator (Spark Style)                              */
/* ------------------------------------------------------------------ */
function formatAssTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const frac = Math.floor((ms % 1000) / 10);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
}

/** Convert hex color #RRGGBB into ASS &HAABBGGRR format */
function hexToAssColor(hex, alpha = 0) {
  const clean = hex.replace("#", "");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${a}${b}${g}${r}&`.toUpperCase();
}

function generateAssSubtitles({
  lines,
  fontFamily = "Edo",
  fontSize = 150,
  fontWeight = "Regular",
  primaryColor = "#FFFFFF",
  outlineColor = "#000000",
  outlineWidth = 0,
  shadowColor = "#000000",
  shadowDepth = 3,
  shadowBlur = 21,
  shadowSpread = 0,
  animation = "fade",
  songDurationMs = 180000,
  linesMode = "single", // "single" or "duo"
  lyricDelay = 0.0,
}) {
  let sampleLyrics = "";
  if (Array.isArray(lines) && lines.length) {
    for (let i = 0; i < Math.min(25, lines.length); i++) {
      sampleLyrics += " " + (lines[i].text || "");
    }
  }
  const resolvedFont = resolveFontForText(fontFamily, sampleLyrics);
  const assFont = resolvedFont;
  const assPrimary = hexToAssColor(primaryColor, 0);
  const assOutline = hexToAssColor(outlineColor, 0);
  const assShadow = hexToAssColor(shadowColor, 0.4);
  const isBold = fontWeight === "Bold" || Number(fontWeight) >= 700 ? 1 : 0;

  // Clamped fontSize between 150 and 170
  const finalFontSize = Math.min(170, Math.max(150, Number(fontSize) || 150));

  // Outline width = shadowSpread if specified, else outlineWidth
  const effectiveOutline =
    shadowSpread !== undefined && !isNaN(Number(shadowSpread)) && Number(shadowSpread) > 0
      ? Number(shadowSpread)
      : (outlineWidth !== undefined && !isNaN(Number(outlineWidth))
        ? Math.max(0, Number(outlineWidth))
        : 0);
  const effectiveShadow =
    shadowDepth !== undefined && !isNaN(Number(shadowDepth))
      ? Math.max(0, Number(shadowDepth))
      : 3;
  const effectiveBlur =
    shadowBlur !== undefined && !isNaN(Number(shadowBlur))
      ? Math.max(0, Math.min(50, Number(shadowBlur)))
      : 21;

  let ass = `[Script Info]
Title: Spark Style Lyric Video
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${assFont},${finalFontSize},${assPrimary},&H000000FF,${assOutline},${assShadow},${isBold},0,0,0,100,100,0,0,1,${effectiveOutline},${effectiveShadow},5,100,100,100,1
Style: Upcoming,${assFont},${Math.round(finalFontSize * 0.7)},&H88FFFFFF,&H000000FF,${assOutline},${assShadow},${isBold},0,0,0,100,100,0,0,1,${effectiveOutline},${effectiveShadow},5,100,100,100,1
Style: Particle,Arial,24,&H80FFFFFF&,&H000000FF,&H40FFFFFF&,&H00000000&,0,0,0,0,100,100,0,0,1,1,0,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  if (!lines || !lines.length) return ass;

  const delayMs = Math.round(Number(lyricDelay || 0) * 1000);

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1];

    const startMs = Math.max(0, cur.timeMs + delayMs);
    // Line stays until next line starts, or for 4.5 seconds if at end
    const rawEndMs = next ? Math.max(0, next.timeMs + delayMs) : startMs + 4500;
    // Leave a small breath between lines
    const endMs = Math.max(startMs + 500, rawEndMs);

    const startStr = formatAssTime(startMs);
    const endStr = formatAssTime(endMs);
    const durationMs = endMs - startMs;

    const fadeMs = Math.min(220, Math.floor(durationMs * 0.22));

    // Decorative particles for dynamic visual effects
    if (animation === "bubbles") {
      const bubbleSeeds = [
        { x: 380, y1: 120, x2: 410, y2: 780, fs: 24, alpha: "D8", sym: "●" },
        { x: 680, y1: 60, x2: 660, y2: 720, fs: 32, alpha: "E0", sym: "○" },
        { x: 1180, y1: 180, x2: 1210, y2: 840, fs: 20, alpha: "D0", sym: "●" },
        { x: 1540, y1: 90, x2: 1510, y2: 790, fs: 28, alpha: "E2", sym: "○" },
        { x: 880, y1: 140, x2: 900, y2: 710, fs: 18, alpha: "D6", sym: "●" },
        { x: 1360, y1: 100, x2: 1340, y2: 820, fs: 22, alpha: "DE", sym: "○" },
      ];
      for (const b of bubbleSeeds) {
        ass += `Dialogue: 0,${startStr},${endStr},Particle,,0,0,0,,{\\move(${b.x},${b.y1},${b.x2},${b.y2})\\fs${b.fs}\\alpha&H${b.alpha}&\\fad(${fadeMs},${fadeMs})}${b.sym}\n`;
      }
    } else if (animation === "sparkles") {
      const sparkleSeeds = [
        { x: 420, y1: 680, x2: 440, y2: 240, fs: 22, alpha: "C0", sym: "✦" },
        { x: 780, y1: 720, x2: 760, y2: 280, fs: 28, alpha: "D0", sym: "✧" },
        { x: 1140, y1: 660, x2: 1160, y2: 220, fs: 20, alpha: "C4", sym: "✦" },
        { x: 1480, y1: 740, x2: 1460, y2: 300, fs: 26, alpha: "D4", sym: "✧" },
        { x: 920, y1: 690, x2: 940, y2: 260, fs: 18, alpha: "BC", sym: "✦" },
      ];
      for (const s of sparkleSeeds) {
        ass += `Dialogue: 0,${startStr},${endStr},Particle,,0,0,0,,{\\move(${s.x},${s.y1},${s.x2},${s.y2})\\fs${s.fs}\\alpha&H${s.alpha}&\\fad(${fadeMs},${fadeMs})}${s.sym}\n`;
      }
    } else if (animation === "snow") {
      const snowSeeds = [
        { x: 340, y1: 80, x2: 380, y2: 820, fs: 22, alpha: "C8", sym: "❄" },
        { x: 720, y1: 40, x2: 690, y2: 780, fs: 18, alpha: "D4", sym: "•" },
        { x: 1220, y1: 100, x2: 1260, y2: 860, fs: 24, alpha: "CC", sym: "❄" },
        { x: 1600, y1: 60, x2: 1570, y2: 800, fs: 16, alpha: "D8", sym: "•" },
      ];
      for (const sn of snowSeeds) {
        ass += `Dialogue: 0,${startStr},${endStr},Particle,,0,0,0,,{\\move(${sn.x},${sn.y1},${sn.x2},${sn.y2})\\fs${sn.fs}\\alpha&H${sn.alpha}&\\fad(${fadeMs},${fadeMs})}${sn.sym}\n`;
      }
    } else if (animation === "rain") {
      const rainSeeds = [
        { x: 400, y1: 50, x2: 390, y2: 900, fs: 26, alpha: "D8", sym: "│" },
        { x: 800, y1: 30, x2: 790, y2: 920, fs: 26, alpha: "E0", sym: "│" },
        { x: 1200, y1: 60, x2: 1190, y2: 890, fs: 26, alpha: "D4", sym: "│" },
        { x: 1560, y1: 40, x2: 1550, y2: 930, fs: 26, alpha: "DC", sym: "│" },
      ];
      for (const r of rainSeeds) {
        ass += `Dialogue: 0,${startStr},${endStr},Particle,,0,0,0,,{\\move(${r.x},${r.y1},${r.x2},${r.y2})\\fs${r.fs}\\alpha&H${r.alpha}&\\fad(${fadeMs},${fadeMs})}${r.sym}\n`;
      }
    }

    // Animation tags - Ensure initial transform tags are placed BEFORE \\t() so libass doesn't overwrite
    let animTags = "";
    if (animation === "pop") {
      animTags = `\\an5\\pos(960,540)\\fad(${fadeMs},${fadeMs})\\fscx92\\fscy92\\t(0,${Math.min(220, durationMs)},\\fscx100\\fscy100)`;
    } else if (animation === "slide") {
      animTags = `\\an5\\fad(${fadeMs},${fadeMs})\\move(960,570,960,540,0,${Math.min(300, durationMs)})`;
    } else if (animation === "bubbles") {
      animTags = `\\an5\\pos(960,540)\\fad(${fadeMs},${fadeMs})\\move(960,518,960,540,0,${Math.min(320, durationMs)})\\t(0,${Math.min(320, durationMs)},\\fscx100\\fscy100)`;
    } else if (animation === "sparkles") {
      animTags = `\\an5\\pos(960,540)\\fad(${fadeMs},${fadeMs})\\move(960,555,960,540,0,${Math.min(300, durationMs)})\\t(0,${Math.min(220, durationMs)},\\fscx104\\fscy104)\\t(${Math.min(220, durationMs)},${Math.min(420, durationMs)},\\fscx100\\fscy100)`;
    } else if (animation === "snow") {
      animTags = `\\an5\\pos(960,540)\\fad(${fadeMs},${fadeMs})\\move(960,525,960,540,0,${Math.min(400, durationMs)})`;
    } else if (animation === "rain") {
      animTags = `\\an5\\pos(960,540)\\fad(${fadeMs},${fadeMs})\\move(960,500,960,540,0,${Math.min(250, durationMs)})`;
    } else if (animation === "bounce") {
      animTags = `\\an5\\pos(960,540)\\fad(${fadeMs},${fadeMs})\\fscx95\\fscy95\\t(0,140,\\fscx106\\fscy106)\\t(140,280,\\fscx100\\fscy100)`;
    } else if (animation === "zoom") {
      animTags = `\\an5\\pos(960,540)\\fad(${fadeMs},${fadeMs})\\fscx120\\fscy120\\t(0,${Math.min(300, durationMs)},\\fscx100\\fscy100)`;
    } else if (animation === "glitch") {
      animTags = `\\an5\\pos(960,540)\\fad(0,${fadeMs})\\t(0,60,\\frz4\\fscx96)\\t(60,120,\\frz-3\\fscx104)\\t(120,200,\\frz0\\fscx100)`;
    } else if (animation === "typewriter") {
      animTags = `\\an5\\fad(${fadeMs},${fadeMs})\\move(480,540,960,540,0,${Math.min(400, durationMs)})`;
    } else if (animation === "blur") {
      animTags = `\\an5\\pos(960,540)\\fad(${Math.min(300, durationMs)},${fadeMs})\\fscx108\\fscy108\\alpha&H88&\\t(0,${Math.min(300, durationMs)},\\fscx100\\fscy100\\alpha&H00&)`;
    } else if (animation === "glow") {
      animTags = `\\an5\\fad(${fadeMs},${fadeMs})\\move(960,590,960,540,0,${Math.min(350, durationMs)})\\t(0,${Math.min(200, durationMs)},\\fscx103\\fscy103)\\t(${Math.min(200, durationMs)},${Math.min(400, durationMs)},\\fscx100\\fscy100)`;
    } else if (animation === "flip") {
      animTags = `\\an5\\pos(960,540)\\fad(${fadeMs},${fadeMs})\\fscx0\\t(0,${Math.min(250, durationMs)},\\fscx100)`;
    } else if (animation === "swing") {
      animTags = `\\an5\\pos(960,540)\\fad(${fadeMs},${fadeMs})\\t(0,120,\\frz-8)\\t(120,260,\\frz5)\\t(260,380,\\frz-2)\\t(380,460,\\frz0)`;
    } else {
      // Classic smooth crossfade (fade)
      animTags = `\\an5\\pos(960,540)\\fad(${fadeMs},${fadeMs})`;
    }

    let textClean = String(cur.text || "")
      .replace(/\{/g, "\\{")
      .replace(/\}/g, "\\}")
      .replace(/\r?\n/g, "\\N")
      .trim();

    if (!textClean) continue;

    // Auto-wrap long lines (greater than 40 chars) at nearest middle space for clean 2-line rendering
    if (!textClean.includes("\\N") && textClean.length > 40) {
      const words = textClean.split(" ");
      if (words.length > 1) {
        const mid = Math.floor(textClean.length / 2);
        let bestIdx = 0;
        let bestDist = Infinity;
        let charAcc = 0;
        for (let w = 0; w < words.length - 1; w++) {
          charAcc += words[w].length + 1;
          const dist = Math.abs(charAcc - mid);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = w;
          }
        }
        textClean = `${words.slice(0, bestIdx + 1).join(" ")}\\N${words.slice(bestIdx + 1).join(" ")}`;
      }
    }

    // Main line
    ass += `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,{${animTags}}${textClean}\n`;

    // If duo lines mode enabled, also show next line below in dimmed style
    if (linesMode === "duo" && next && next.text && String(next.text).trim()) {
      let nextClean = String(next.text)
        .replace(/\{/g, "\\{")
        .replace(/\}/g, "\\}")
        .replace(/\r?\n/g, " ")
        .trim();
      const upcomingAnim = `\\an5\\pos(960,630)\\fad(${fadeMs},${fadeMs})`;
      ass += `Dialogue: 1,${startStr},${endStr},Upcoming,,0,0,0,,{${upcomingAnim}}${nextClean}\n`;
    }
  }

  return ass;
}


/* ------------------------------------------------------------------ */
/*  Video Rendering Engine (FFmpeg)                                   */
/* ------------------------------------------------------------------ */
const renderJobs = new Map();

app.get("/api/render/status/:jobId", (req, res) => {
  const job = renderJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "job not found" });
  res.json(job);
});

/* ------------------------------------------------------------------ */
/*  Audio Stream Downloader (Resilient with Range Auto-Resumption)    */
/* ------------------------------------------------------------------ */
async function downloadAudioToTemp(audioUrl, destPath, onProgress = null) {
  if (fs.existsSync(audioUrl)) return audioUrl;

  const client = audioUrl.startsWith("https") ? https : http;
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const existingSize = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;

      await new Promise((resolve, reject) => {
        const headers = {
          "User-Agent": UA,
          Referer: "https://www.jiosaavn.com/",
          Accept: "*/*",
          Connection: "keep-alive",
        };

        if (existingSize > 0) {
          headers["Range"] = `bytes=${existingSize}-`;
        }

        const req = client.get(audioUrl, { headers }, (res) => {
          if (res.statusCode !== 200 && res.statusCode !== 206) {
            reject(new Error(`HTTP status ${res.statusCode}`));
            return;
          }

          const append = existingSize > 0 && res.statusCode === 206;
          const fileStream = fs.createWriteStream(destPath, {
            flags: append ? "a" : "w",
          });

          let received = existingSize;
          const total = res.headers["content-range"]
            ? parseInt(res.headers["content-range"].split("/")[1], 10)
            : parseInt(res.headers["content-length"] || "0", 10) + existingSize;

          res.on("data", (chunk) => {
            received += chunk.length;
            if (onProgress && total > 0) {
              onProgress(Math.floor((received / total) * 100), received, total);
            }
          });

          res.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close(() => resolve());
          });

          fileStream.on("error", (err) => {
            fileStream.close(() => reject(err));
          });

          res.on("error", (err) => {
            fileStream.close(() => reject(err));
          });
        });

        req.setTimeout(25000, () => {
          req.destroy(new Error("Audio download socket timeout"));
        });

        req.on("error", reject);
      });

      if (fs.existsSync(destPath) && fs.statSync(destPath).size > 10000) {
        return destPath;
      }
    } catch (err) {
      console.warn(`[audio download] Attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying...`);
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  throw new Error("Failed to download audio after retries");
}

/* ------------------------------------------------------------------ */
/*  Core Render Pipeline (Shared by Studio & Automation Engine)       */
/* ------------------------------------------------------------------ */
async function executeRenderPipeline(
  jobId,
  job,
  {
    songId,
    audioUrl,
    background,
    lines,
    options = {},
    onComplete = null,
  }
) {
  const ffmpegExe = getFFmpegPath();

  // Identify background image
  let bgFilename = background || "1.png";
  let bgPath = path.join(DIRS.backgrounds, bgFilename);
  if (!fs.existsSync(bgPath)) {
    const all = fs
      .readdirSync(DIRS.backgrounds)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    if (all.length) {
      bgFilename = all[0];
      bgPath = path.join(DIRS.backgrounds, bgFilename);
    } else {
      throw new Error("No background image found on server");
    }
  }

  job.status = "downloading_audio";
  job.message = "Resolving audio stream...";
  job.percent = 5;

  // 1. Resolve Audio Stream URL
  let resolvedAudioUrl = audioUrl;
  let songDurationSec = 0;

  if (songId) {
    const resolved = await resolveAny(songId);
    if (resolved.kind) {
      const s = resolved.song;
      const mi = s.more_info || {};
      songDurationSec = Number(mi.duration || s.duration || 0);

      if (resolved.encrypted) {
        const dec = decryptMediaUrlFull(resolved.encrypted);
        if (dec.url) {
          const qualities = buildQualityUrls(dec.url);
          resolvedAudioUrl = qualities[1]?.url || qualities[0]?.url;
        }
      }
      if (!resolvedAudioUrl && resolved.plain) {
        resolvedAudioUrl = resolved.plain;
      }
    }
  }

  if (!resolvedAudioUrl) {
    throw new Error("Could not resolve playable audio stream URL");
  }

  // Unpack proxy URL if passed
  if (resolvedAudioUrl && resolvedAudioUrl.includes("/api/stream?url=")) {
    try {
      const parsed = new URL(resolvedAudioUrl, "http://localhost:3000");
      const directUrl = parsed.searchParams.get("url");
      if (directUrl) resolvedAudioUrl = directUrl;
    } catch { }
  }

  // 1b. Buffer audio locally to guarantee 100% reliable NVENC GPU rendering with zero network stalls
  const isRemoteAudio = /^https?:\/\//i.test(resolvedAudioUrl);
  let audioFilePath = resolvedAudioUrl;

  if (isRemoteAudio) {
    job.status = "downloading_audio";
    job.message = "Buffering audio track...";
    job.percent = 8;
    const tempAudioPath = path.join(DIRS.temp, `${jobId}_audio.mp4`);
    await downloadAudioToTemp(resolvedAudioUrl, tempAudioPath, (pct) => {
      job.percent = Math.min(25, Math.floor(8 + (pct / 100) * 17));
      job.message = `Buffering audio track (${pct}%)...`;
    });
    audioFilePath = tempAudioPath;
  }

  // Estimate duration if unknown
  if (!songDurationSec || songDurationSec < 10) {
    const lastLyric = lines[lines.length - 1];
    songDurationSec = Math.max(120, Math.ceil((lastLyric?.timeMs || 60000) / 1000) + 8);
  }

  // Map transition style if user passed alias e.g. "slide up", "crossfade", "flip in", "bubbles"
  const animMap = {
    "slide up": "slide",
    slide: "slide",
    crossfade: "fade",
    fade: "fade",
    "flip in": "flip",
    flip: "flip",
    pop: "pop",
    bounce: "bounce",
    zoom: "zoom",
    glitch: "glitch",
    typewriter: "typewriter",
    blur: "blur",
    glow: "glow",
    swing: "swing",
    bubbles: "bubbles",
    droplets: "bubbles",
    "dropping bubbles": "bubbles",
    "bubbles drop": "bubbles",
    sparkles: "sparkles",
    stars: "sparkles",
    snow: "snow",
    rain: "rain",
  };
  const animationKey =
    animMap[String(options.animation || "").toLowerCase()] ||
    options.animation ||
    "fade";

  // 2. Generate ASS Subtitle File
  job.message = "Generating synchronized subtitle animations...";
  job.percent = 25;

  const assContent = generateAssSubtitles({
    lines,
    fontFamily: options.fontFamily || "Edo",
    fontSize: Math.min(170, Math.max(150, Number(options.fontSize) || 150)),
    fontWeight: options.fontWeight || "Regular",
    primaryColor: options.fontColor || "#FFFFFF",
    outlineColor: options.outlineColor || "#000000",
    outlineWidth:
      options.shadowSpread !== undefined && !isNaN(Number(options.shadowSpread))
        ? Number(options.shadowSpread)
        : (options.outlineWidth !== undefined && !isNaN(Number(options.outlineWidth))
          ? Number(options.outlineWidth)
          : 0),
    shadowColor: options.shadowColor || "#000000",
    shadowDepth:
      options.shadowDepth !== undefined && !isNaN(Number(options.shadowDepth))
        ? Number(options.shadowDepth)
        : 3,
    shadowBlur:
      options.shadowBlur !== undefined && !isNaN(Number(options.shadowBlur))
        ? Number(options.shadowBlur)
        : 21,
    shadowSpread:
      options.shadowSpread !== undefined && !isNaN(Number(options.shadowSpread))
        ? Number(options.shadowSpread)
        : 0,
    animation: animationKey,
    linesMode: options.linesMode || "single",
    songDurationMs: songDurationSec * 1000,
    lyricDelay: Number(options.lyricDelay !== undefined ? options.lyricDelay : -0.3),
  });

  const assFilePath = path.join(DIRS.temp, `${jobId}_sub.ass`);
  fs.writeFileSync(assFilePath, assContent, "utf8");

  // 3. Build FFmpeg Filter Chain
  job.status = "rendering";
  const willUseNvenc = ENCODER_INFO.hasNvenc && process.env.VIDEO_ENCODER !== "cpu";
  job.encoderMode = willUseNvenc ? "nvenc" : "cpu";
  job.message = willUseNvenc
    ? "Encoding 1080p 60fps MP4 video with FFmpeg NVENC (RTX 2050)..."
    : `Encoding 1080p MP4 video with FFmpeg CPU (libx264 ${ENCODER_INFO.cpuPreset})...`;
  job.percent = 30;

  const outFilename = `lyric_video_${jobId}.mp4`;
  const outFilePath = path.join(DIRS.output, outFilename);

  const defaultFps = willUseNvenc ? 60 : (Number(process.env.DEFAULT_FPS) || 30);
  const maxFps = Number(process.env.MAX_FPS) || 60;
  const requestedFps = options.fps ? Number(options.fps) : defaultFps;
  const fps = Math.min(maxFps, requestedFps === 30 ? 30 : 60);
  const bgDarkness = Math.max(
    0,
    Math.min(1, Number(options.bgDarkness ?? 0)),
  );
  const bgBlur = Math.max(0, Math.min(30, Number(options.bgBlur ?? 0)));
  const bgMotion = options.bgMotion || "zoom";

  const relAssPath = path.relative(process.cwd(), assFilePath).replace(/\\/g, "/");
  const relFontsDir = path.relative(process.cwd(), path.join(DIRS.assets, "fonts")).replace(/\\/g, "/");

  let filterComplex = `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080`;

  if (bgBlur > 0) {
    filterComplex += `,boxblur=luma_radius=${bgBlur}:luma_power=2`;
  }

  if (bgMotion === "zoom") {
    filterComplex += `,zoompan=z='min(zoom+0.0003,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${fps}`;
  }

  if (bgDarkness > 0) {
    filterComplex += `,drawbox=x=0:y=0:w=1920:h=1080:color=black@${bgDarkness}:t=fill`;
  }

  filterComplex += `,setpts=PTS-STARTPTS,subtitles='${relAssPath}':fontsdir='${relFontsDir}'[vout]`;

  let audioMapTag = "1:a";
  if (options.audio3dEnabled) {
    const soundStyle = options.audio3dSoundStyle || "orbit";
    const speed = Math.max(0.2, Math.min(3.0, Number(options.audio3dSpeed || 1.0)));
    const hz = (0.12 * speed).toFixed(3);
    const slowHz = (0.06 * speed).toFixed(3);
    const cyberHz = (0.16 * speed).toFixed(3);

    let audioFilter = "";
    if (soundStyle === "orbit") {
      audioFilter = `apulsator=mode=sine:hz=${hz}:amount=0.88:offset_r=0.5,stereowiden=delay=20:feedback=0.3:crossfeed=0.25:drymix=0.85`;
    } else if (soundStyle === "wide") {
      audioFilter = `stereowiden=delay=25:feedback=0.35:crossfeed=0.2:drymix=0.75,equalizer=f=60:t=q:w=1.2:g=3`;
    } else if (soundStyle === "concert") {
      audioFilter = `stereowiden=delay=30:feedback=0.4:crossfeed=0.3:drymix=0.7,aecho=0.8:0.88:40|70:0.3|0.2`;
    } else if (soundStyle === "slow") {
      audioFilter = `apulsator=mode=sine:hz=${slowHz}:amount=0.85:offset_r=0.5,stereowiden=delay=20:feedback=0.25:crossfeed=0.2:drymix=0.85`;
    } else if (soundStyle === "cyber") {
      audioFilter = `apulsator=mode=triangle:hz=${cyberHz}:amount=0.92:offset_r=0.5,treble=g=2,bass=g=4`;
    } else {
      audioFilter = `apulsator=mode=sine:hz=${hz}:amount=0.88:offset_r=0.5,stereowiden=delay=20:feedback=0.3:crossfeed=0.25:drymix=0.85`;
    }

    filterComplex += `;[1:a]${audioFilter}[aout]`;
    audioMapTag = "[aout]";
  }

  return new Promise((resolve, reject) => {
    function runEncoder(useNvenc = willUseNvenc) {
      job.encoderMode = useNvenc ? "nvenc" : "cpu";
      const videoEncoderArgs = useNvenc
        ? ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "20"]
        : [
            "-c:v", "libx264",
            "-preset", ENCODER_INFO.cpuPreset,
            "-crf", ENCODER_INFO.cpuCrf,
            "-threads", ENCODER_INFO.cpuThreads,
          ];

      const audioBitrate = process.env.AUDIO_BITRATE || (useNvenc ? "320k" : (ENCODER_INFO.isFreeTierCpu ? "192k" : "256k"));

      const ffmpegArgs = [
        "-y",
        "-loop",
        "1",
        "-framerate",
        String(fps),
        "-i",
        bgPath,
        "-i",
        audioFilePath,
        "-filter_complex",
        filterComplex,
        "-map",
        "[vout]",
        "-map",
        audioMapTag,
        ...videoEncoderArgs,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        audioBitrate,
        "-shortest",
        "-movflags",
        "+faststart",
        outFilePath,
      ];

      console.log(`[render] Starting FFmpeg (${useNvenc ? "NVIDIA NVENC RTX 2050 GPU" : `CPU libx264 ${ENCODER_INFO.cpuPreset}`}):`, ffmpegArgs.join(" "));

      const proc = spawn(ffmpegExe, ffmpegArgs);
      const stderrLines = [];

      proc.stderr.on("data", (data) => {
        const text = data.toString();
        stderrLines.push(text);
        if (stderrLines.length > 30) stderrLines.shift();

        const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10);
          const mins = parseInt(timeMatch[2], 10);
          const secs = parseInt(timeMatch[3], 10);
          const curSeconds = hours * 3600 + mins * 60 + secs;
          const pct = Math.min(
            99,
            Math.max(30, Math.floor(30 + (curSeconds / songDurationSec) * 68)),
          );
          job.percent = pct;
          job.message = `Rendering frames (${useNvenc ? "NVENC RTX GPU" : `CPU libx264 ${ENCODER_INFO.cpuPreset}`}): ${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]} / ${Math.floor(songDurationSec / 60)}:${String(Math.floor(songDurationSec % 60)).padStart(2, "0")}`;
        }
      });

      proc.on("error", (err) => {
        if (useNvenc) {
          console.warn("[render] NVENC spawn failed, falling back to libx264 CPU encoder:", err.message);
          runEncoder(false);
          return;
        }
        console.error("[render] Process error:", err);
        job.status = "failed";
        job.error = `FFmpeg failed to start: ${err.message}`;
        reject(err);
      });

      proc.on("close", async (code) => {
        if (code === 0 && fs.existsSync(outFilePath)) {
          try {
            if (isRemoteAudio && fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
            if (fs.existsSync(assFilePath)) fs.unlinkSync(assFilePath);
          } catch { }

          job.status = "completed";
          job.percent = 100;
          job.message = "Video generated successfully!";
          job.outputFile = outFilename;
          job.outputUrl = `/output/${outFilename}`;
          console.log(`[render] Job ${jobId} finished successfully via ${useNvenc ? "NVENC GPU" : `CPU (${ENCODER_INFO.cpuPreset})`}!`);

          if (onComplete) {
            try {
              await onComplete(outFilename);
            } catch (completeErr) {
              console.warn("[render] onComplete hook warning:", completeErr.message);
            }
          }

          resolve(outFilename);
        } else {
          const lastErr = stderrLines.slice(-3).join(" ").trim();
          if (useNvenc && /nvenc|cuda|nvcuda|device|not supported|driver/i.test(lastErr)) {
            console.warn(`[render] NVENC runtime failed (${lastErr}), retrying with libx264 CPU fallback...`);
            runEncoder(false);
            return;
          }

          try {
            if (isRemoteAudio && fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
            if (fs.existsSync(assFilePath)) fs.unlinkSync(assFilePath);
          } catch { }

          job.status = "failed";
          job.error = lastErr || `FFmpeg exited with error code ${code}`;
          console.error(`[render] Job ${jobId} failed with code ${code}:`, lastErr);
          reject(new Error(job.error));
        }
      });
    }

    runEncoder(willUseNvenc);
  });
}

/* ------------------------------------------------------------------ */
/*  Studio Manual Render Endpoint                                      */
/* ------------------------------------------------------------------ */
app.post("/api/render", async (req, res) => {
  const {
    songId,
    audioUrl,
    background,
    lyrics,
    lrc,
    options = {},
  } = req.body;

  let lines = lyrics || [];
  if ((!lines || !lines.length) && lrc) {
    lines = parseLrc(lrc);
  }

  if (!lines || !lines.length) {
    return res.status(400).json({ error: "No lyrics lines available to render" });
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id: jobId,
    status: "preparing",
    percent: 0,
    message: "Preparing audio and subtitles...",
    outputFile: null,
    outputUrl: null,
    error: null,
    createdAt: Date.now(),
  };
  renderJobs.set(jobId, job);

  res.status(202).json({ jobId, status: "queued" });

  (async () => {
    try {
      await executeRenderPipeline(jobId, job, {
        songId,
        audioUrl,
        background,
        lines,
        options,
      });
    } catch (err) {
      console.error("[render] Error in pipeline:", err);
      job.status = "failed";
      job.error = err.message || String(err);
    }
  })();
});

/* ------------------------------------------------------------------ */
/*  SERIAL AUTOMATION QUEUE & PIPELINE RUNNER                         */
/*  Ensures only ONE video encodes at a time (FIFO serial queue).    */
/*  If any song fails, stores in MongoDB `failed_songs` with reason   */
/*  and automatically advances to the next song in the queue.         */
/* ------------------------------------------------------------------ */
const automationQueue = {
  activeJob: null,
  waitingQueue: [],
  isWorkerRunning: false,
};

function getQueueSnapshot() {
  return {
    isProcessing: Boolean(automationQueue.activeJob),
    engine: {
      hasNvenc: ENCODER_INFO.hasNvenc,
      activeMode: ENCODER_INFO.activeMode,
      preferredEncoder: ENCODER_INFO.preferredEncoder,
      cpuPreset: ENCODER_INFO.cpuPreset,
    },
    activeJob: automationQueue.activeJob
      ? {
          id: automationQueue.activeJob.id,
          songTitle: automationQueue.activeJob.songTitle,
          singer: automationQueue.activeJob.singer,
          status: automationQueue.activeJob.status,
          percent: automationQueue.activeJob.percent,
          message: automationQueue.activeJob.message,
          thumbUrl: automationQueue.activeJob.thumbUrl,
          startedAt: automationQueue.activeJob.startedAt,
          encoderMode: automationQueue.activeJob.encoderMode || ENCODER_INFO.activeMode,
        }
      : null,
    queue: automationQueue.waitingQueue.map((j, idx) => ({
      id: j.id,
      songTitle: j.songTitle,
      singer: j.singer,
      status: j.status,
      queuePosition: idx + 1,
      bgFilename: j.bgFilename,
      chosenTitleFont: j.chosenTitleFont || "Edo",
      chosenSingerFont: j.chosenSingerFont || "Edo",
      fontFamily: j.fontFamily || "Edo",
      titleFontSize: j.titleFontSize || 280,
      singerFontSize: j.singerFontSize || 132,
      thumbnailGap: j.thumbnailGap !== undefined ? j.thumbnailGap : 42,
      thumbnailGlowDepth: j.thumbnailGlowDepth !== undefined ? j.thumbnailGlowDepth : 13,
      thumbnailBlur: j.thumbnailBlur !== undefined ? j.thumbnailBlur : 30,
      thumbnailSpread: j.thumbnailSpread !== undefined ? j.thumbnailSpread : 1,
      lyricsGlowDepth: j.lyricsGlowDepth !== undefined ? j.lyricsGlowDepth : 3,
      lyricsBlur: j.lyricsBlur !== undefined ? j.lyricsBlur : 21,
      lyricsSpread: j.lyricsSpread !== undefined ? j.lyricsSpread : 0,
      lyricFontSize: Math.min(170, Math.max(150, Number(j.lyricFontSize) || 150)),
      animation: j.animation || "crossfade",
      createdAt: j.createdAt,
    })),
    queueLength: automationQueue.waitingQueue.length,
  };
}

async function runAutomationPipelineForJob(job) {
  const ffmpegExe = getFFmpegPath();

  // A. Generate Custom 1080p Thumbnail
  job.step = "thumbnail_generation";
  job.message = "Generating custom 1080p thumbnail...";
  const thumbFilename = `thumbnail_${job.id}.jpg`;
  const thumbPath = path.join(DIRS.output, thumbFilename);

  await generateThumbnail({
    bgFilename: job.bgFilename,
    songTitle: job.songTitle,
    singerName: job.singer,
    titleFont: job.chosenTitleFont,
    singerFont: job.chosenSingerFont,
    titleFontSize: job.titleFontSize ? Math.min(500, Math.max(80, Number(job.titleFontSize))) : 280,
    singerFontSize: job.singerFontSize || 132,
    gap: job.thumbnailGap || 42,
    glowDepth: job.thumbnailGlowDepth !== undefined ? job.thumbnailGlowDepth : 13,
    blur: job.thumbnailBlur !== undefined ? Number(job.thumbnailBlur) : 30,
    spread: job.thumbnailSpread !== undefined ? Number(job.thumbnailSpread) : 1,
    outPath: thumbPath,
    ffmpegExe,
  });

  job.thumbFile = thumbFilename;
  job.thumbUrl = `/output/${thumbFilename}`;
  job.thumbnailReady = true;
  job.percent = 25;
  job.message = ENCODER_INFO.hasNvenc
    ? "1080p custom thumbnail generated! Starting 60fps NVENC video encoding..."
    : `1080p custom thumbnail generated! Starting CPU video encoding (${ENCODER_INFO.cpuPreset})...`;
  console.log(`[queue] Thumbnail ready for "${job.songTitle}": ${thumbFilename}`);

  // B. Run Video Render Pipeline
  job.step = "video_encoding";
  await executeRenderPipeline(job.id, job, {
    songId: job.songId,
    audioUrl: null,
    background: job.bgFilename,
    lines: job.lyricsLines,
    options: {
      fontSize: Math.min(170, Math.max(150, Number(job.lyricFontSize) || 150)),
      lyricDelay: -0.3,
      fps: 60,
      bgDarkness: 0,
      bgBlur: 0,
      outlineWidth: job.lyricsSpread !== undefined && !isNaN(Number(job.lyricsSpread)) ? Number(job.lyricsSpread) : 0,
      shadowDepth: job.lyricsGlowDepth !== undefined && !isNaN(Number(job.lyricsGlowDepth)) ? Number(job.lyricsGlowDepth) : 3,
      shadowBlur: job.lyricsBlur !== undefined && !isNaN(Number(job.lyricsBlur)) ? Number(job.lyricsBlur) : 21,
      shadowSpread: job.lyricsSpread !== undefined && !isNaN(Number(job.lyricsSpread)) ? Number(job.lyricsSpread) : 0,
      fontFamily: job.fontFamily,
      animation: job.animation,
      bgMotion: "zoom",
      aspectRatio: "16:9",
    },
    onComplete: async (outFilename) => {
      const outFilePath = path.join(DIRS.output, outFilename);

      // C. YouTube Upload
      job.step = "youtube_upload";
      job.message = "Uploading video to YouTube...";
      const ytTitle = job.singer
        ? `${job.songTitle} - ${job.singer} (Lyrics)`
        : `${job.songTitle} (Lyrics)`;
      
      let ytDescription = "";
      try {
        ytDescription = formatYouTubeDescription(
          job.songTitle,
          job.singer,
          job.lyricsLines
        );
      } catch (descErr) {
        console.warn(`[queue] Description generation fallback for "${job.songTitle}":`, descErr.message);
        ytDescription = `${job.songTitle} (Official Lyric Video)\nCreated with Spark Lyric Studio.`;
      }

      let ytResult = null;
      try {
        console.log(`[queue] Initiating YouTube upload for "${ytTitle}"...`);
        ytResult = await uploadVideoToYouTube({
          videoPath: outFilePath,
          thumbPath,
          title: ytTitle,
          description: ytDescription,
          tags: [
            "Lyrics",
            job.songTitle,
            job.singer || "Music",
            "Spark Lyric Video",
          ].filter(Boolean),
        });

        if (ytResult?.uploaded) {
          job.youtubeVideoId = ytResult.videoId;
          job.youtubeUrl = ytResult.youtubeUrl;
          job.youtubeUploaded = true;
          console.log(`[queue] ✔ YouTube upload successful for "${job.songTitle}": ${ytResult.youtubeUrl}`);

          // Delete local video and thumbnail after successful YouTube upload
          try {
            if (fs.existsSync(outFilePath)) {
              fs.unlinkSync(outFilePath);
              console.log(`[queue] Cleaned up local video file: ${outFilename}`);
            }
            if (fs.existsSync(thumbPath)) {
              fs.unlinkSync(thumbPath);
              console.log(`[queue] Cleaned up local thumbnail file: ${thumbFilename}`);
            }
            job.localCleaned = true;
            job.outputFile = null;
            job.outputUrl = null;
            job.thumbUrl = `https://i.ytimg.com/vi/${ytResult.videoId}/hqdefault.jpg`;
          } catch (cleanErr) {
            console.warn("[queue] File cleanup warning:", cleanErr.message);
          }
        } else {
          job.youtubeError = ytResult?.reason || "Upload unsuccessful";
          console.warn(`[queue] YouTube upload skipped/unsuccessful:`, job.youtubeError);
        }
      } catch (ytErr) {
        job.youtubeError = ytErr.message;
        console.error(`[queue] YouTube upload error for "${job.songTitle}":`, ytErr.message);
      }

      // D. Save Full Record into MongoDB Atlas
      job.step = "db_save";
      try {
        const ytThumbUrl = ytResult?.uploaded
          ? `https://i.ytimg.com/vi/${ytResult.videoId}/hqdefault.jpg`
          : `/output/${thumbFilename}`;

        const record = {
          songId: job.songId,
          title: job.songTitle,
          singer: job.singer,
          duration: job.topSong?.duration || 0,
          background: job.bgFilename,
          fontFamily: job.fontFamily,
          animation: job.animation,
          videoFile: ytResult?.uploaded ? null : outFilename,
          videoUrl: ytResult?.uploaded ? null : `/output/${outFilename}`,
          thumbFile: ytResult?.uploaded ? null : thumbFilename,
          thumbUrl: ytThumbUrl,
          youtubeVideoId: ytResult?.videoId || null,
          youtubeUrl: ytResult?.youtubeUrl || null,
          youtubeUploaded: Boolean(ytResult?.uploaded),
          youtubeError: ytResult?.uploaded ? null : (job.youtubeError || null),
          localCleaned: Boolean(ytResult?.uploaded),
          titleFontSize: job.titleFontSize || 280,
          singerFontSize: job.singerFontSize || 132,
          thumbnailGap: job.thumbnailGap !== undefined ? job.thumbnailGap : 42,
          thumbnailGlowDepth: job.thumbnailGlowDepth !== undefined ? job.thumbnailGlowDepth : 13,
          thumbnailBlur: job.thumbnailBlur !== undefined ? job.thumbnailBlur : 30,
          thumbnailSpread: job.thumbnailSpread !== undefined ? job.thumbnailSpread : 1,
          lyricsCount: job.lyricsLines.length,
          lyricsFontSize: Math.min(170, Math.max(150, Number(job.lyricFontSize) || 150)),
          lyricsGlowDepth: job.lyricsGlowDepth !== undefined ? job.lyricsGlowDepth : 3,
          lyricsBlur: job.lyricsBlur !== undefined ? job.lyricsBlur : 21,
          lyricsSpread: job.lyricsSpread !== undefined ? job.lyricsSpread : 0,
          createdAt: new Date(),
        };

        await withMongo((db) => db.collection("songs").insertOne(record));
        console.log(`[queue] Saved "${job.songTitle}" to MongoDB Atlas!`);
      } catch (dbErr) {
        console.error(`[queue] Failed to save record in MongoDB:`, dbErr.message);
      }
    },
  });
}

async function startQueueWorker() {
  if (automationQueue.isWorkerRunning) return;
  automationQueue.isWorkerRunning = true;

  try {
    while (automationQueue.waitingQueue.length > 0) {
      const job = automationQueue.waitingQueue.shift();
      automationQueue.activeJob = job;

      // Update positions of remaining items
      automationQueue.waitingQueue.forEach((qJob, idx) => {
        qJob.queuePosition = idx + 1;
        qJob.message = `Queued (Position #${idx + 1}). Waiting for current video to finish...`;
      });

      job.status = "preparing";
      job.percent = 5;
      job.queuePosition = 0;
      job.startedAt = Date.now();
      job.message = `Automation started for "${job.songTitle}". Generating custom 1080p thumbnail...`;

      console.log(`[queue] ▶ Processing job ${job.id} for "${job.songTitle}"`);

      try {
        await runAutomationPipelineForJob(job);
        job.status = "completed";
        job.percent = 100;
        job.completedAt = Date.now();
        job.message = `Automation completed successfully for "${job.songTitle}"!`;
        console.log(`[queue] ✔ Completed job ${job.id} for "${job.songTitle}"`);
      } catch (pipelineErr) {
        const errorReason = pipelineErr.message || String(pipelineErr);
        console.error(`[queue] ✖ Pipeline failure for "${job.songTitle}":`, errorReason);

        job.status = "failed";
        job.error = errorReason;
        job.failedAt = Date.now();
        job.message = `Failed: ${errorReason}`;

        // Store failed song in MongoDB failed_songs collection
        try {
          await withMongo((db) =>
            db.collection("failed_songs").insertOne({
              jobId: job.id,
              query: job.query,
              songId: job.songId,
              title: job.songTitle,
              singer: job.singer,
              reason: errorReason,
              step: job.step || "video_encoding",
              background: job.bgFilename,
              fontFamily: job.fontFamily,
              failedAt: new Date(),
            })
          );
          console.log(`[queue] Stored failed song "${job.songTitle}" in MongoDB database`);
        } catch (dbErr) {
          console.error(`[queue] Failed to store failure in DB:`, dbErr.message);
        }
      } finally {
        automationQueue.activeJob = null;
      }
    }
  } finally {
    automationQueue.isWorkerRunning = false;
    automationQueue.activeJob = null;
  }
}

/* ------------------------------------------------------------------ */
/*  ADMIN SEARCH & AUTOMATION ENDPOINTS                               */
/* ------------------------------------------------------------------ */

// Top 10 Song Search with Image, Title, Singer, & Synced Lyrics Status
app.get("/api/admin/search-songs", async (req, res) => {
  const query = (req.query.q || req.query.query || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Please enter a song name to search" });
  }

  try {
    const searchUrl = SAAVN_SEARCH.replace("%page", "1")
      .replace("%q", encodeURIComponent(query))
      .replace("%n", "10")
      .replace("%call", "search.getResults");

    const searchRes = await rawGet(searchUrl);
    const results =
      (searchRes.json &&
        (searchRes.json.results || searchRes.json.data?.results)) ||
      [];
    const items = results.map(shapeSong).filter(Boolean);

    if (!items.length) {
      return res.json({
        query,
        count: 0,
        songs: [],
        message: "No songs found for this search",
      });
    }

    // Check DB for existing songs
    const songIds = items.map((s) => String(s.id));
    const existingInDb = new Set();
    try {
      const dbRecords = await withMongo((db) =>
        db
          .collection("songs")
          .find({
            $or: [
              { songId: { $in: songIds } },
              { id: { $in: songIds } },
            ],
          })
          .project({ songId: 1, id: 1 })
          .toArray()
      );
      dbRecords.forEach((r) => {
        if (r.songId) existingInDb.add(String(r.songId));
        if (r.id) existingInDb.add(String(r.id));
      });
    } catch (e) {
      console.warn("[search-songs] DB check warning:", e.message);
    }

    // Check synced lyrics for all 10 songs in parallel
    const lyricsChecks = await Promise.allSettled(
      items.map(async (song) => {
        try {
          const lData = await getSyncedLyricsData(String(song.id));
          return {
            hasSyncedLyrics: Boolean(lData && lData.lines && lData.lines.length > 0),
            lyricsCount: lData?.lines?.length || 0,
            hasPlainLyrics: Boolean(lData?.lyrics),
            source: lData?.source || null,
          };
        } catch {
          return { hasSyncedLyrics: false, lyricsCount: 0, hasPlainLyrics: false, source: null };
        }
      })
    );

    const shapedSongs = items.map((song, idx) => {
      const lCheck =
        lyricsChecks[idx].status === "fulfilled"
          ? lyricsChecks[idx].value
          : { hasSyncedLyrics: false, lyricsCount: 0, hasPlainLyrics: false, source: null };

      const singerName =
        (song.artists?.primary || []).map((a) => a.name).join(", ") ||
        song.subtitle ||
        "";

      const titleScript = detectScript(song.title);

      return {
        id: String(song.id),
        title: song.title,
        singer: singerName,
        album: song.album || "",
        duration: song.duration || 0,
        durationFormatted: formatDurationSec(song.duration || 0),
        image: song.image || "",
        hasSyncedLyrics: lCheck.hasSyncedLyrics,
        lyricsCount: lCheck.lyricsCount,
        hasPlainLyrics: lCheck.hasPlainLyrics,
        lyricsSource: lCheck.source,
        isSavedInDb: existingInDb.has(String(song.id)),
        script: titleScript,
      };
    });

    res.json({
      query,
      count: shapedSongs.length,
      songs: shapedSongs,
    });
  } catch (err) {
    console.error("[search-songs error]", err);
    res.status(500).json({ error: err.message || "Failed to search songs" });
  }
});

// Process Song Endpoint (supports direct query OR selection from search with custom title & singer)
app.post("/api/admin/process-song", async (req, res) => {
  const {
    query,
    songId: inputSongId,
    customTitle,
    customSinger,
    background,
    titleFont,
    singerFont,
    songFont,
    fontSize,
    titleFontSize,
    singerFontSize,
    thumbnailGap,
    thumbnailGlowDepth,
    lyricsGlowDepth,
    thumbnailBlur,
    thumbnailSpread,
    lyricsBlur,
    lyricsSpread,
    animation: reqAnimation,
  } = req.body;

  if (!inputSongId && (!query || !query.trim())) {
    return res.status(400).json({ error: "Please enter a song name or select a song" });
  }

  try {
    let topSong = null;
    let songId = inputSongId ? String(inputSongId) : null;

    if (songId) {
      try {
        const resolved = await resolveAny(songId);
        if (resolved?.song) {
          topSong = shapeSong(resolved.song);
        }
      } catch (err) {
        console.warn("[process-song] Direct resolve failed for songId:", songId, err.message);
      }
    }

    if (!topSong) {
      const q = (query || "").trim();
      const searchUrl = SAAVN_SEARCH.replace("%page", "1")
        .replace("%q", encodeURIComponent(q))
        .replace("%n", "5")
        .replace("%call", "search.getResults");

      const searchRes = await rawGet(searchUrl);
      const results =
        (searchRes.json &&
          (searchRes.json.results || searchRes.json.data?.results)) ||
        [];
      const items = results.map(shapeSong).filter(Boolean);

      if (!items.length) {
        return res.json({
          status: "not_found",
          message: "Song is not found",
        });
      }

      topSong = items[0];
      songId = String(topSong.id);
    }

    // Determine final title & singer (thumbnail editor inputs override defaults)
    const rawSinger =
      (topSong.artists?.primary || []).map((a) => a.name).join(", ") ||
      topSong.subtitle ||
      "";

    let finalSongTitle = (customTitle && customTitle.trim()) || topSong.title;
    let finalSingerName =
      customSinger !== undefined && customSinger !== null && customSinger.trim() !== ""
        ? customSinger.trim()
        : rawSinger;

    // Transliterate title and singer to Romanized English letters if non-Latin script is detected and Groq is configured
    if (isGroqConfigured()) {
      if (hasNonLatinScript(finalSongTitle)) {
        try {
          finalSongTitle = await transliterateTextToRomanized(finalSongTitle);
        } catch (e) {
          console.warn("[groq] Title transliteration skipped:", e.message);
        }
      }
      if (hasNonLatinScript(finalSingerName)) {
        try {
          finalSingerName = await transliterateTextToRomanized(finalSingerName);
        } catch (e) {
          console.warn("[groq] Singer transliteration skipped:", e.message);
        }
      }
    }

    // Check MongoDB database
    const existing = await withMongo((db) =>
      db.collection("songs").findOne({
        $or: [{ songId }, { id: songId }],
      })
    );

    if (existing) {
      return res.json({
        status: "already_present",
        message: "Song already present in database",
        song: existing,
      });
    }

    // Check if synced lyrics is present
    const lyricsData = await getSyncedLyricsData(songId);

    if (!lyricsData || !lyricsData.lines || !lyricsData.lines.length) {
      // Store in failed_songs collection so admin can review in failed list
      try {
        await withMongo((db) =>
          db.collection("failed_songs").insertOne({
            query: (query || finalSongTitle).trim(),
            songId,
            title: finalSongTitle,
            singer: finalSingerName,
            reason: "Synced lyrics not found on JioSaavn or LRCLIB",
            step: "lyrics_verification",
            failedAt: new Date(),
          })
        );
      } catch (dbErr) {
        console.warn("Failed to store failed song in db:", dbErr.message);
      }

      return res.json({
        status: "lyrics_not_found",
        message: "Lyrics is not present",
        song: topSong,
      });
    }

    // Prepare song parameters
    const bgFilename =
      background && background !== "auto" && background !== "random"
        ? background
        : getRandomBackground();

    const fontFamily =
      songFont && songFont !== "auto" && songFont !== "random"
        ? songFont
        : "Edo";

    const chosenTitleFont =
      titleFont && titleFont !== "auto" && titleFont !== "random"
        ? titleFont
        : "Edo";

    const chosenSingerFont =
      singerFont && singerFont !== "auto" && singerFont !== "random"
        ? singerFont
        : "Edo";

    const lyricFontSize = Math.min(170, Math.max(150, Number(fontSize) || 150));
    const animation = reqAnimation ? String(reqAnimation).trim() : "crossfade";

    const jobId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const isBusy = Boolean(automationQueue.activeJob);
    const currentQueuePos = isBusy ? automationQueue.waitingQueue.length + 1 : 0;

    const job = {
      id: jobId,
      query: (query || finalSongTitle).trim(),
      topSong,
      songId,
      songTitle: finalSongTitle,
      singer: finalSingerName,
      bgFilename,
      fontFamily,
      chosenTitleFont,
      chosenSingerFont,
      lyricFontSize,
      titleFontSize: titleFontSize && !isNaN(Number(titleFontSize)) ? Math.max(40, Math.min(500, Number(titleFontSize))) : 280,
      singerFontSize: singerFontSize && !isNaN(Number(singerFontSize)) ? Number(singerFontSize) : 132,
      thumbnailGap: thumbnailGap !== undefined && thumbnailGap !== null && !isNaN(Number(thumbnailGap)) ? Number(thumbnailGap) : 42,
      thumbnailGlowDepth: thumbnailGlowDepth !== undefined && !isNaN(Number(thumbnailGlowDepth)) ? Number(thumbnailGlowDepth) : 13,
      thumbnailBlur: thumbnailBlur !== undefined && !isNaN(Number(thumbnailBlur)) ? Math.max(0, Math.min(50, Number(thumbnailBlur))) : 30,
      thumbnailSpread: thumbnailSpread !== undefined && !isNaN(Number(thumbnailSpread)) ? Math.max(0, Math.min(20, Number(thumbnailSpread))) : 1,
      lyricsGlowDepth: lyricsGlowDepth !== undefined && !isNaN(Number(lyricsGlowDepth)) ? Number(lyricsGlowDepth) : 3,
      lyricsBlur: lyricsBlur !== undefined && !isNaN(Number(lyricsBlur)) ? Math.max(0, Math.min(50, Number(lyricsBlur))) : 21,
      lyricsSpread: lyricsSpread !== undefined && !isNaN(Number(lyricsSpread)) ? Math.max(0, Math.min(20, Number(lyricsSpread))) : 0,
      animation,
      lyricsLines: lyricsData.lines,
      status: isBusy ? "queued" : "preparing",
      queuePosition: currentQueuePos,
      percent: isBusy ? 0 : 5,
      message: isBusy
        ? `Queued (Position #${currentQueuePos}). Waiting for current video to finish...`
        : `Automation started for "${finalSongTitle}". Generating 1080p custom thumbnail...`,
      outputFile: null,
      outputUrl: null,
      thumbFile: null,
      thumbUrl: null,
      youtubeVideoId: null,
      youtubeUrl: null,
      youtubeUploaded: false,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
    };

    renderJobs.set(jobId, job);
    automationQueue.waitingQueue.push(job);

    // Trigger queue processing worker
    startQueueWorker().catch((err) => {
      console.error("[queue worker error]", err);
    });

    if (isBusy) {
      res.json({
        status: "queued",
        message: `Song "${finalSongTitle}" added to queue (Position #${currentQueuePos}). Video for "${automationQueue.activeJob.songTitle}" is currently processing.`,
        jobId,
        queuePosition: currentQueuePos,
        isProcessing: true,
        activeSongTitle: automationQueue.activeJob.songTitle,
        song: {
          id: songId,
          title: finalSongTitle,
          singer: finalSingerName,
          background: bgFilename,
          lyricsCount: lyricsData.lines.length,
        },
      });
    } else {
      res.json({
        status: "started",
        message: `Song found: "${finalSongTitle}". Synced lyrics verified (${lyricsData.lines.length} lines). Automation pipeline started.`,
        jobId,
        queuePosition: 0,
        isProcessing: false,
        song: {
          id: songId,
          title: finalSongTitle,
          singer: finalSingerName,
          background: bgFilename,
          lyricsCount: lyricsData.lines.length,
        },
      });
    }
  } catch (err) {
    console.error("[admin] process-song error:", err);
    res.status(500).json({ error: err.message || "Failed to process song" });
  }
});

// Automation Queue Status Endpoint
app.get("/api/admin/queue", (_req, res) => {
  res.json(getQueueSnapshot());
});

// Delete a Queued Item (only allowed if item is waiting in queue, not actively processing)
app.delete("/api/admin/queue/:id", (req, res) => {
  const { id } = req.params;

  if (automationQueue.activeJob && automationQueue.activeJob.id === id) {
    return res.status(400).json({
      error: "Cannot remove this video: it is currently being encoded and uploaded.",
    });
  }

  const idx = automationQueue.waitingQueue.findIndex((j) => j.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Queued video not found" });
  }

  const removed = automationQueue.waitingQueue.splice(idx, 1)[0];

  // Update remaining queue positions
  automationQueue.waitingQueue.forEach((qJob, i) => {
    qJob.queuePosition = i + 1;
    qJob.message = `Queued (Position #${i + 1}). Waiting for current video to finish...`;
  });

  if (renderJobs.has(id)) {
    renderJobs.delete(id);
  }

  console.log(`[queue] Admin removed job ${id} ("${removed.songTitle}") from queue`);

  res.json({
    success: true,
    message: `Removed "${removed.songTitle}" from the queue`,
    queue: getQueueSnapshot(),
  });
});

// Edit a Queued Item (only allowed if item is waiting in queue, not actively processing)
app.put("/api/admin/queue/:id", (req, res) => {
  const { id } = req.params;

  if (automationQueue.activeJob && automationQueue.activeJob.id === id) {
    return res.status(400).json({
      error: "Cannot edit this video: it is currently being encoded and uploaded.",
    });
  }

  const job = automationQueue.waitingQueue.find((j) => j.id === id);
  if (!job) {
    return res.status(404).json({ error: "Queued video not found" });
  }

  const {
    songTitle,
    singer,
    background,
    titleFont,
    singerFont,
    songFont,
    titleFontSize,
    singerFontSize,
    thumbnailGap,
    thumbnailGlowDepth,
    thumbnailBlur,
    thumbnailSpread,
    lyricsGlowDepth,
    lyricsBlur,
    lyricsSpread,
    fontSize,
    animation,
  } = req.body;

  if (songTitle && songTitle.trim()) job.songTitle = songTitle.trim();
  if (singer !== undefined) job.singer = String(singer).trim();
  if (background) job.bgFilename = background;
  if (titleFont) job.chosenTitleFont = titleFont;
  if (singerFont) job.chosenSingerFont = singerFont;
  if (songFont) job.fontFamily = songFont;
  if (titleFontSize && !isNaN(Number(titleFontSize))) job.titleFontSize = Math.max(40, Math.min(500, Number(titleFontSize)));
  if (singerFontSize && !isNaN(Number(singerFontSize))) job.singerFontSize = Number(singerFontSize);
  if (thumbnailGap !== undefined && !isNaN(Number(thumbnailGap))) job.thumbnailGap = Number(thumbnailGap);
  if (thumbnailGlowDepth !== undefined && !isNaN(Number(thumbnailGlowDepth))) job.thumbnailGlowDepth = Number(thumbnailGlowDepth);
  if (thumbnailBlur !== undefined && !isNaN(Number(thumbnailBlur))) job.thumbnailBlur = Math.max(0, Math.min(50, Number(thumbnailBlur)));
  if (thumbnailSpread !== undefined && !isNaN(Number(thumbnailSpread))) job.thumbnailSpread = Math.max(0, Math.min(20, Number(thumbnailSpread)));
  if (lyricsGlowDepth !== undefined && !isNaN(Number(lyricsGlowDepth))) job.lyricsGlowDepth = Number(lyricsGlowDepth);
  if (lyricsBlur !== undefined && !isNaN(Number(lyricsBlur))) job.lyricsBlur = Math.max(0, Math.min(50, Number(lyricsBlur)));
  if (lyricsSpread !== undefined && !isNaN(Number(lyricsSpread))) job.lyricsSpread = Math.max(0, Math.min(20, Number(lyricsSpread)));
  if (fontSize && !isNaN(Number(fontSize))) job.lyricFontSize = Math.min(170, Math.max(150, Number(fontSize)));
  if (animation && String(animation).trim()) job.animation = String(animation).trim();

  console.log(`[queue] Admin updated parameters for queued job ${id} ("${job.songTitle}")`);

  res.json({
    success: true,
    message: `Updated settings for "${job.songTitle}"`,
    job: {
      id: job.id,
      songTitle: job.songTitle,
      singer: job.singer,
      bgFilename: job.bgFilename,
      chosenTitleFont: job.chosenTitleFont,
      chosenSingerFont: job.chosenSingerFont,
      fontFamily: job.fontFamily,
      titleFontSize: job.titleFontSize,
      singerFontSize: job.singerFontSize,
      thumbnailGap: job.thumbnailGap,
      thumbnailGlowDepth: job.thumbnailGlowDepth !== undefined ? job.thumbnailGlowDepth : 13,
      thumbnailBlur: job.thumbnailBlur !== undefined ? job.thumbnailBlur : 30,
      thumbnailSpread: job.thumbnailSpread !== undefined ? job.thumbnailSpread : 1,
      lyricsGlowDepth: job.lyricsGlowDepth !== undefined ? job.lyricsGlowDepth : 3,
      lyricsBlur: job.lyricsBlur !== undefined ? job.lyricsBlur : 21,
      lyricsSpread: job.lyricsSpread !== undefined ? job.lyricsSpread : 0,
      lyricFontSize: job.lyricFontSize,
      animation: job.animation,
    },
    queue: getQueueSnapshot(),
  });
});

app.post("/api/admin/queue/:id/edit", (req, res) => {
  const { id } = req.params;

  if (automationQueue.activeJob && automationQueue.activeJob.id === id) {
    return res.status(400).json({
      error: "Cannot edit this video: it is currently being encoded and uploaded.",
    });
  }

  const job = automationQueue.waitingQueue.find((j) => j.id === id);
  if (!job) {
    return res.status(404).json({ error: "Queued video not found" });
  }

  const {
    songTitle,
    singer,
    background,
    titleFont,
    singerFont,
    songFont,
    titleFontSize,
    singerFontSize,
    thumbnailGap,
    thumbnailGlowDepth,
    thumbnailBlur,
    thumbnailSpread,
    lyricsGlowDepth,
    lyricsBlur,
    lyricsSpread,
    fontSize,
    animation,
  } = req.body;

  if (songTitle && songTitle.trim()) job.songTitle = songTitle.trim();
  if (singer !== undefined) job.singer = String(singer).trim();
  if (background) job.bgFilename = background;
  if (titleFont) job.chosenTitleFont = titleFont;
  if (singerFont) job.chosenSingerFont = singerFont;
  if (songFont) job.fontFamily = songFont;
  if (titleFontSize && !isNaN(Number(titleFontSize))) job.titleFontSize = Math.max(40, Math.min(500, Number(titleFontSize)));
  if (singerFontSize && !isNaN(Number(singerFontSize))) job.singerFontSize = Number(singerFontSize);
  if (thumbnailGap !== undefined && !isNaN(Number(thumbnailGap))) job.thumbnailGap = Number(thumbnailGap);
  if (thumbnailGlowDepth !== undefined && !isNaN(Number(thumbnailGlowDepth))) job.thumbnailGlowDepth = Number(thumbnailGlowDepth);
  if (thumbnailBlur !== undefined && !isNaN(Number(thumbnailBlur))) job.thumbnailBlur = Math.max(0, Math.min(50, Number(thumbnailBlur)));
  if (thumbnailSpread !== undefined && !isNaN(Number(thumbnailSpread))) job.thumbnailSpread = Math.max(0, Math.min(20, Number(thumbnailSpread)));
  if (lyricsGlowDepth !== undefined && !isNaN(Number(lyricsGlowDepth))) job.lyricsGlowDepth = Number(lyricsGlowDepth);
  if (lyricsBlur !== undefined && !isNaN(Number(lyricsBlur))) job.lyricsBlur = Math.max(0, Math.min(50, Number(lyricsBlur)));
  if (lyricsSpread !== undefined && !isNaN(Number(lyricsSpread))) job.lyricsSpread = Math.max(0, Math.min(20, Number(lyricsSpread)));
  if (fontSize && !isNaN(Number(fontSize))) job.lyricFontSize = Math.min(170, Math.max(150, Number(fontSize)));
  if (animation && String(animation).trim()) job.animation = String(animation).trim();

  console.log(`[queue] Admin updated parameters for queued job ${id} ("${job.songTitle}")`);

  res.json({
    success: true,
    message: `Updated settings for "${job.songTitle}"`,
    job: {
      id: job.id,
      songTitle: job.songTitle,
      singer: job.singer,
      bgFilename: job.bgFilename,
      chosenTitleFont: job.chosenTitleFont,
      chosenSingerFont: job.chosenSingerFont,
      fontFamily: job.fontFamily,
      titleFontSize: job.titleFontSize,
      singerFontSize: job.singerFontSize,
      thumbnailGap: job.thumbnailGap,
      thumbnailGlowDepth: job.thumbnailGlowDepth !== undefined ? job.thumbnailGlowDepth : 13,
      thumbnailBlur: job.thumbnailBlur !== undefined ? job.thumbnailBlur : 30,
      thumbnailSpread: job.thumbnailSpread !== undefined ? job.thumbnailSpread : 1,
      lyricsGlowDepth: job.lyricsGlowDepth !== undefined ? job.lyricsGlowDepth : 3,
      lyricsBlur: job.lyricsBlur !== undefined ? job.lyricsBlur : 21,
      lyricsSpread: job.lyricsSpread !== undefined ? job.lyricsSpread : 0,
      lyricFontSize: job.lyricFontSize,
      animation: job.animation,
    },
    queue: getQueueSnapshot(),
  });
});

// Failed Songs Management Endpoints
app.get("/api/admin/failed-songs", async (_req, res) => {
  try {
    const failedSongs = await withMongo((db) =>
      db
        .collection("failed_songs")
        .find({})
        .sort({ failedAt: -1 })
        .limit(100)
        .toArray()
    );
    res.json({ failedSongs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/failed-songs/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let filter = { _id: id };
    try {
      filter = { $or: [{ _id: new ObjectId(id) }, { _id: id }, { jobId: id }] };
    } catch {}
    await withMongo((db) => db.collection("failed_songs").deleteOne(filter));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/failed-songs", async (_req, res) => {
  try {
    await withMongo((db) => db.collection("failed_songs").deleteMany({}));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/failed-songs/retry/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let filter = { _id: id };
    try {
      filter = { $or: [{ _id: new ObjectId(id) }, { _id: id }, { jobId: id }] };
    } catch {}

    const record = await withMongo((db) =>
      db.collection("failed_songs").findOne(filter)
    );

    if (!record) {
      return res.status(404).json({ error: "Failed song record not found" });
    }

    // Remove from failed_songs upon retrying
    await withMongo((db) => db.collection("failed_songs").deleteOne(filter));

    res.json({
      success: true,
      query: record.query || record.title,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  Admin Database & YouTube Status Endpoints                         */
/* ------------------------------------------------------------------ */
app.get("/api/admin/songs", async (_req, res) => {
  try {
    const songs = await withMongo((db) =>
      db
        .collection("songs")
        .find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray()
    );
    res.json({ songs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/stats", async (_req, res) => {
  try {
    const totalSongs = await withMongo((db) =>
      db.collection("songs").countDocuments({})
    );
    const youtubeUploaded = await withMongo((db) =>
      db.collection("songs").countDocuments({ youtubeUploaded: true })
    );
    res.json({ totalSongs, youtubeUploaded });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/song/:songId", async (req, res) => {
  try {
    await withMongo((db) =>
      db.collection("songs").deleteOne({
        $or: [{ songId: String(req.params.songId) }, { id: String(req.params.songId) }],
      })
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retry YouTube Upload for an already generated song
app.post("/api/admin/song/:songId/retry-youtube", async (req, res) => {
  try {
    const { songId } = req.params;
    const song = await withMongo((db) =>
      db.collection("songs").findOne({
        $or: [{ songId: String(songId) }, { id: String(songId) }],
      })
    );

    if (!song) {
      return res.status(404).json({ error: "Song record not found" });
    }

    if (song.youtubeUploaded && song.youtubeUrl) {
      return res.json({
        success: true,
        message: "Song already uploaded to YouTube",
        youtubeUrl: song.youtubeUrl,
      });
    }

    const videoFilename = song.videoFile || `lyric_video_${song.songId}.mp4`;
    const videoPath = path.join(DIRS.output, videoFilename);
    const thumbFilename = song.thumbFile || `thumbnail_${song.songId}.jpg`;
    const thumbPath = path.join(DIRS.output, thumbFilename);

    if (!fs.existsSync(videoPath)) {
      return res.status(400).json({
        error: "Rendered video file is no longer on the server. Please re-run the automation.",
      });
    }

    const ytTitle = `${song.title}${song.singer ? ` - ${song.singer}` : ""} (Lyrics)`;
    const ytDesc = formatYouTubeDescription({
      songTitle: song.title,
      singer: song.singer,
      duration: song.duration,
      font: song.fontFamily || "Edo",
      lyricsLines: [],
    });

    const ytResult = await uploadVideoToYouTube({
      videoPath,
      thumbPath: fs.existsSync(thumbPath) ? thumbPath : null,
      title: ytTitle,
      description: ytDesc,
      tags: [song.title, song.singer, "Lyrics", "Spark Lyrics", "Music"].filter(Boolean),
    });

    if (ytResult && ytResult.uploaded) {
      await withMongo((db) =>
        db.collection("songs").updateOne(
          { _id: song._id },
          {
            $set: {
              youtubeUploaded: true,
              youtubeVideoId: ytResult.videoId,
              youtubeUrl: ytResult.youtubeUrl,
              youtubeError: null,
            },
          }
        )
      );

      return res.json({
        success: true,
        message: `Uploaded to YouTube: ${ytResult.youtubeUrl}`,
        youtubeUrl: ytResult.youtubeUrl,
      });
    } else {
      const errMsg = ytResult?.reason || "Upload failed";
      await withMongo((db) =>
        db.collection("songs").updateOne(
          { _id: song._id },
          { $set: { youtubeError: errMsg } }
        )
      );
      return res.status(400).json({ error: errMsg });
    }
  } catch (err) {
    console.error("[retry-youtube error]", err);
    await withMongo((db) =>
      db.collection("songs").updateOne(
        { $or: [{ songId: String(req.params.songId) }, { id: String(req.params.songId) }] },
        { $set: { youtubeError: err.message } }
      )
    ).catch(() => {});

    res.status(500).json({ error: err.message || "Failed to upload to YouTube" });
  }
});

// YouTube OAuth Handlers
app.get("/auth/youtube", (_req, res) => {
  try {
    const url = getYouTubeAuthUrl();
    res.redirect(url);
  } catch (err) {
    res.status(500).send(`YouTube Auth Error: ${err.message}`);
  }
});

app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code parameter");
  try {
    await handleYouTubeCallback(code);
    res.redirect("/admin.html?youtube=connected");
  } catch (err) {
    res.status(500).send(`OAuth Callback Error: ${err.message}`);
  }
});

app.get("/api/youtube/status", (_req, res) => {
  res.json({
    authenticated: isYouTubeAuthenticated(),
  });
});

app.get("/api/system/status", (_req, res) => {
  res.json({
    encoder: {
      activeMode: ENCODER_INFO.activeMode,
      hasNvenc: ENCODER_INFO.hasNvenc,
      preferredEncoder: ENCODER_INFO.preferredEncoder,
      cpuPreset: ENCODER_INFO.cpuPreset,
      cpuThreads: ENCODER_INFO.cpuThreads,
      cpuCrf: ENCODER_INFO.cpuCrf,
      isFreeTierCpu: ENCODER_INFO.isFreeTierCpu,
    },
    system: {
      platform: process.platform,
      arch: os.arch(),
      os: ENCODER_INFO.osInfo,
      cpuModel: ENCODER_INFO.cpuModel,
      cpuCores: ENCODER_INFO.cpuCores,
      totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
      freeMemoryMb: Math.round(os.freemem() / (1024 * 1024)),
      uptimeSeconds: Math.floor(process.uptime()),
    },
    ffmpeg: {
      path: ENCODER_INFO.ffmpegPath,
    },
    youtubeAuthenticated: isYouTubeAuthenticated(),
  });
});

/* ------------------------------------------------------------------ */
/*  Start Express Server                                               */
/* ------------------------------------------------------------------ */
app.listen(PORT, HOST, () => {
  console.log(`\n======================================================`);
  console.log(`▶ Spark Lyric Video Generator running on:`);
  console.log(`  Local / Server: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`  Host Binding:   ${HOST}:${PORT}`);
  console.log(`  OS Platform:    ${ENCODER_INFO.osInfo}`);
  console.log(`  Engine Mode:    ${ENCODER_INFO.hasNvenc ? "NVIDIA NVENC (RTX 2050 GPU)" : `CPU libx264 (${ENCODER_INFO.cpuPreset} preset, ${ENCODER_INFO.cpuThreads} threads)`}`);
  console.log(`  CPU Cores:      ${ENCODER_INFO.cpuCores} vCPU (${ENCODER_INFO.isFreeTierCpu ? "Free-Tier / Low Resource Mode" : "Standard Multi-Core"})`);
  console.log(`  FFmpeg binary:  ${ENCODER_INFO.ffmpegPath}`);
  console.log(`======================================================\n`);
});
