import fs from "node:fs";
import path from "node:path";
import dns from "node:dns";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { MongoClient } from "mongodb";
import "dotenv/config";
import { uploadVideoToYouTube, isYouTubeAuthenticated } from "./youtube.js";

// Ensure DNS works for MongoDB Atlas SRV lookup and YouTube APIs on Windows
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dns.setDefaultResultOrder("ipv4first");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIRS = {
  assets: path.join(__dirname, "assets"),
  fonts: path.join(__dirname, "assets", "fonts"),
  backgrounds: path.join(__dirname, "assets", "background"),
  output: path.join(__dirname, "output"),
  temp: path.join(__dirname, "temp"),
};

for (const p of Object.values(DIRS)) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

// MongoDB Client with auto-reconnect on topology closure
let mongoClient = null;
let db = null;

export async function getDb() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is missing in .env");

  const isConnected = Boolean(
    mongoClient &&
    mongoClient.topology &&
    mongoClient.topology.s?.state === "connected"
  );

  if (!isConnected) {
    if (mongoClient) {
      try {
        await mongoClient.close();
      } catch {}
    }
    mongoClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
    });
    await mongoClient.connect();
    console.log("[db] Connected to MongoDB Atlas (spark_lyrics)");
    db = mongoClient.db("spark_lyrics");
  }

  return db;
}

export async function withMongo(fn) {
  try {
    const database = await getDb();
    return await fn(database);
  } catch (err) {
    console.warn("[db] MongoDB operation error, reconnecting:", err.message);
    try {
      if (mongoClient) await mongoClient.close();
    } catch {}
    mongoClient = null;
    db = null;
    const database = await getDb();
    return await fn(database);
  }
}

// Curated Automation Options per User Specs
export const AUTOMATION_FONTS = [
  "Edo",
  "Cormorant Garamond",
  "Manrope",
  "Oswald",
  "Kalam",
  "Caveat",
  "Space Grotesk",
  "Poppins",
  "Montserrat",
];

export const SINGER_FONTS = [
  "Edo",
  "Playfair Display",
  "Cinzel",
  "Outfit",
  "Plus Jakarta Sans",
  "Inter",
  "Raleway",
];

export const AUTOMATION_ANIMATIONS = [
  "pop",
  "slide up",
  "crossfade",
  "flip in",
  "bounce",
];

export function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getRandomBackground() {
  const files = fs
    .readdirSync(DIRS.backgrounds)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  if (!files.length) return "1.png";
  return getRandomElement(files);
}

// Estimate character width for Edo brush font and proportional typography
export function estimateTextWidth(text, fontSize = 1) {
  let units = 0;
  for (const ch of text) {
    if (/[WMwm%#@]/.test(ch)) {
      units += 0.92;
    } else if (/[ijlI1!|.,:;'`\s]/.test(ch)) {
      units += 0.32;
    } else if (/[frtJ]/.test(ch)) {
      units += 0.45;
    } else if (/[A-Z0-9]/.test(ch)) {
      units += 0.72;
    } else {
      units += 0.65;
    }
  }
  return units * fontSize;
}

// Helper to normalize font name for ASS subtitles
export function normalizeAssFont(fontName) {
  if (!fontName) return "Edo SZ";
  const lower = fontName.trim().toLowerCase();
  if (lower === "edo" || lower === "edo sz") return "Edo SZ";
  return fontName.trim();
}

/**
 * Dynamically compute title layout and font size per specifications:
 * - Nominal size: 18–24% of canvas height (nominal 240px on 1080p canvas)
 * - Auto-shrink to fit within 90% width (1728px), keeping 1–2 lines max
 * - Rule: prioritize keeping the title large; only reduce font size when it exceeds width
 */
export function computeThumbnailTitleLayout(title, targetWidth = 1728) {
  const cleanTitle = (title || "").trim();
  const words = cleanTitle.split(/\s+/).filter(Boolean);
  const nominalSize = 280; // 280px default for 1080p canvas

  // Check if title fits on 1 line within 90% width at nominal size
  const singleLineWidth = estimateTextWidth(cleanTitle, nominalSize);
  if (singleLineWidth <= targetWidth && words.length <= 3) {
    return {
      fontSize: nominalSize,
      lines: [cleanTitle],
      wrappedText: cleanTitle,
      lineCount: 1,
    };
  }

  // If short (<= 4 words) and can fit on 1 line with font size >= 220px, keep 1 line
  const singleLineUnits = estimateTextWidth(cleanTitle, 1);
  const singleLineSize = Math.floor(targetWidth / Math.max(1, singleLineUnits));
  if (words.length <= 4 && singleLineSize >= 220) {
    return {
      fontSize: Math.min(nominalSize, singleLineSize),
      lines: [cleanTitle],
      wrappedText: cleanTitle,
      lineCount: 1,
    };
  }

  // Wrap into 2 balanced lines
  if (words.length >= 2) {
    let bestSplitIndex = 1;
    let minMaxUnits = Infinity;
    for (let i = 1; i < words.length; i++) {
      const l1 = words.slice(0, i).join(" ");
      const l2 = words.slice(i).join(" ");
      const u1 = estimateTextWidth(l1, 1);
      const u2 = estimateTextWidth(l2, 1);
      const maxU = Math.max(u1, u2);
      if (maxU < minMaxUnits) {
        minMaxUnits = maxU;
        bestSplitIndex = i;
      }
    }
    const line1 = words.slice(0, bestSplitIndex).join(" ");
    const line2 = words.slice(bestSplitIndex).join(" ");
    const maxLineUnits = minMaxUnits;

    let fontSize = nominalSize;
    if (maxLineUnits * nominalSize > targetWidth) {
      fontSize = Math.floor(targetWidth / Math.max(1, maxLineUnits));
      fontSize = Math.max(100, Math.min(nominalSize, fontSize));
    }

    return {
      fontSize,
      lines: [line1, line2],
      wrappedText: line1 + "\\N" + line2,
      lineCount: 2,
    };
  }

  let fontSize = nominalSize;
  if (singleLineUnits * nominalSize > targetWidth) {
    fontSize = Math.max(100, Math.floor(targetWidth / Math.max(1, singleLineUnits)));
  }
  return {
    fontSize,
    lines: [cleanTitle],
    wrappedText: cleanTitle,
    lineCount: 1,
  };
}

/**
 * Dynamically compute artist layout per specifications:
 * - Artist: nominal 132px on 1080p canvas
 * - Auto-shrink to fit 70–80% width (1440px), preferably 1 line
 */
export function computeThumbnailSingerLayout(singer, targetWidth = 1440) {
  const cleanSinger = (singer || "").trim();
  if (!cleanSinger) return null;
  const nominalSize = 132; // 132px default on 1080p canvas
  const units = estimateTextWidth(cleanSinger, 1);
  let fontSize = nominalSize;
  if (units * nominalSize > targetWidth) {
    fontSize = Math.max(60, Math.floor(targetWidth / Math.max(1, units)));
  }
  return {
    fontSize,
    wrappedText: cleanSinger,
    lineCount: 1,
  };
}

// Generate high-resolution 1920x1080 thumbnail
// Settings: Edo brush font, Title 280px default (90% width, 1-2 lines),
// Artist 132px default (70-80% width, 1 line), Gap default 42px,
// White, subtle black shadow & glow depth default 2px, 0 outline, centered.
export async function generateThumbnail({
  bgFilename,
  songTitle,
  singerName,
  titleFont = "Edo",
  singerFont = "Edo",
  titleFontSize = null,
  singerFontSize = null,
  gap = null,
  glowDepth = 2,
  outPath,
  ffmpegExe,
}) {
  const isWin = process.platform === "win32";
  const binaryNames = isWin ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg", "ffmpeg.exe"];
  let finalFfmpeg = ffmpegExe;
  if (!finalFfmpeg) {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
      finalFfmpeg = process.env.FFMPEG_PATH;
    } else {
      for (const name of binaryNames) {
        const gpuBin = path.join(__dirname, "ffmpeg", "bin", name);
        if (fs.existsSync(gpuBin)) { finalFfmpeg = gpuBin; break; }
        const localBin = path.join(__dirname, "bin", name);
        if (fs.existsSync(localBin)) { finalFfmpeg = localBin; break; }
      }
      if (!finalFfmpeg && !isWin) {
        if (fs.existsSync("/usr/bin/ffmpeg")) finalFfmpeg = "/usr/bin/ffmpeg";
      }
      if (!finalFfmpeg) finalFfmpeg = "ffmpeg";
    }
  }

  const bgPath = path.join(DIRS.backgrounds, bgFilename);
  if (!fs.existsSync(bgPath)) {
    throw new Error(`Background file not found: ${bgPath}`);
  }

  const titleInfo = computeThumbnailTitleLayout(songTitle, 1728);
  const finalTitleSize = titleFontSize && !isNaN(Number(titleFontSize))
    ? Math.max(40, Math.min(450, Number(titleFontSize)))
    : (titleInfo.fontSize || 280);

  const singerClean = (singerName || "").trim();
  const singerInfo = computeThumbnailSingerLayout(singerClean, 1440);
  const finalSingerSize = singerInfo
    ? (singerFontSize && !isNaN(Number(singerFontSize))
        ? Math.max(30, Math.min(300, Number(singerFontSize)))
        : (singerInfo.fontSize || 132))
    : 0;

  const finalGlowDepth = glowDepth !== undefined && !isNaN(Number(glowDepth))
    ? Math.max(0, Math.min(25, Number(glowDepth)))
    : 2;

  const finalTitleFont = normalizeAssFont(titleFont);
  let finalSingerFont = singerFont && singerFont !== "auto" ? singerFont : "Edo";
  finalSingerFont = normalizeAssFont(finalSingerFont);

  const titleEscaped = titleInfo.wrappedText
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");

  const singerEscaped = singerInfo
    ? singerInfo.wrappedText
        .replace(/\\/g, "\\\\")
        .replace(/\{/g, "\\{")
        .replace(/\}/g, "\\}")
    : "";

  const thumbAssId = `thumb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const thumbAssPath = path.join(DIRS.temp, `${thumbAssId}.ass`);

  // Vertical Centering & Spacing Formula:
  // - Title height: 1 line = fontSize * 0.9, 2 lines = fontSize * 1.85
  // - Artist height: fontSize * 0.9
  // - Gap: verified gap from user adjustment (default 42px)
  // - Centered vertically on 1080 canvas
  const titleH = titleInfo.lineCount > 1 ? finalTitleSize * 1.85 : finalTitleSize * 0.9;
  const artistH = singerInfo ? finalSingerSize * 0.9 : 0;
  const finalGap = singerInfo
    ? (gap !== null && gap !== undefined && !isNaN(Number(gap)) ? Number(gap) : 42)
    : 0;
  const totalH = titleH + finalGap + artistH;
  const blockTop = (1080 - totalH) / 2;
  const titleY = Math.round(blockTop + titleH / 2);
  const singerY = Math.round(blockTop + titleH + finalGap + artistH / 2);

  // ASS Style: White (&H00FFFFFF), Edo brush font, 0 outline, shadow/glow depth = 2px (&H50000000), centered (\an5)
  const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,${finalTitleFont},${finalTitleSize},&H00FFFFFF,&H000000FF,&H00000000,&H50000000,0,0,0,0,100,100,0,0,1,0,${finalGlowDepth},5,100,100,100,1
${singerInfo ? `Style: Singer,${finalSingerFont},${finalSingerSize},&H00FFFFFF,&H000000FF,&H00000000,&H50000000,0,0,0,0,100,100,0,0,1,0,${finalGlowDepth},5,100,100,100,1` : ""}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:10.00,Title,,0,0,0,,{\\an5\\pos(960,${titleY})}${titleEscaped}
${singerInfo ? `Dialogue: 0,0:00:00.00,0:00:10.00,Singer,,0,0,0,,{\\an5\\pos(960,${singerY})}${singerEscaped}` : ""}
`;


  fs.writeFileSync(thumbAssPath, assContent, "utf8");
  const relAss = path.relative(process.cwd(), thumbAssPath).replace(/\\/g, "/");
  const relFonts = path.relative(process.cwd(), DIRS.fonts).replace(/\\/g, "/");

  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      bgPath,
      "-vf",
      `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,drawbox=x=0:y=0:w=1920:h=1080:color=black@0.22:t=fill,subtitles='${relAss}':fontsdir='${relFonts}'`,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outPath,
    ];

    const proc = spawn(finalFfmpeg, args);
    proc.on("close", (code) => {
      try {
        if (fs.existsSync(thumbAssPath)) fs.unlinkSync(thumbAssPath);
      } catch {}
      if (code === 0 && fs.existsSync(outPath)) {
        resolve(outPath);
      } else {
        reject(new Error(`Thumbnail generation failed with code ${code}`));
      }
    });
    proc.on("error", (err) => {
      try {
        if (fs.existsSync(thumbAssPath)) fs.unlinkSync(thumbAssPath);
      } catch {}
      reject(err);
    });
  });
}

// Format milliseconds into MM:SS timeline string for YouTube descriptions
export function formatTimelineTime(ms = 0) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSec = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Generate YouTube description with timeline
export function formatYouTubeDescription(songTitle = "Song", singerName = "", lyricsLines = []) {
  const safeTitle = String(songTitle || "Song").trim();
  const safeSinger = String(singerName || "").trim();
  const singerText = safeSinger ? `by ${safeSinger}` : "";
  let timeline = "";

  if (Array.isArray(lyricsLines) && lyricsLines.length) {
    timeline = lyricsLines
      .filter((l) => l && l.text && String(l.text).trim())
      .map((l) => `[${formatTimelineTime(l.timeMs)} - ${String(l.text).trim()}]`)
      .join("\n");
  }

  const tagTitle = safeTitle.replace(/[^a-zA-Z0-9]/g, "");
  const tagSinger = safeSinger ? "#" + safeSinger.replace(/[^a-zA-Z0-9]/g, "") : "";

  return `${safeTitle} ${singerText} (Official Lyric Video)

Enjoy the synchronized lyrics video for "${safeTitle}" ${singerText}.
Created with Spark Lyric Studio.

Lyrics Timeline:
${timeline || "[00:00 - Instrumental]"}

#Lyrics ${tagTitle ? "#" + tagTitle : ""} ${tagSinger} #Spark
`.trim();
}
