import fs from "node:fs";
import path from "node:path";
import dns from "node:dns";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

dns.setDefaultResultOrder("ipv4first");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREDENTIALS_DIR = path.join(__dirname, "credentials");
const SECRET_PATH = path.join(CREDENTIALS_DIR, "secret.json");
const TOKENS_PATH = path.join(CREDENTIALS_DIR, "tokens.json");

let oauth2Client = null;

export function getOAuth2Client() {
  if (oauth2Client) return oauth2Client;

  if (!fs.existsSync(SECRET_PATH)) {
    console.warn("[youtube] Warning: credentials/secret.json not found");
    return null;
  }

  try {
    const raw = fs.readFileSync(SECRET_PATH, "utf8");
    const secret = JSON.parse(raw);
    const cfg = secret.web || secret.installed;

    if (!cfg || !cfg.client_id || !cfg.client_secret) {
      console.warn("[youtube] Invalid secret.json format");
      return null;
    }

    const redirectUri =
      process.env.YOUTUBE_REDIRECT_URI ||
      (cfg.redirect_uris && cfg.redirect_uris[0]) ||
      "http://localhost:3000/oauth2callback";

    oauth2Client = new google.auth.OAuth2(
      cfg.client_id,
      cfg.client_secret,
      redirectUri
    );

    // Load saved tokens if available
    if (fs.existsSync(TOKENS_PATH)) {
      try {
        const tokensRaw = fs.readFileSync(TOKENS_PATH, "utf8");
        const tokens = JSON.parse(tokensRaw);
        oauth2Client.setCredentials(tokens);
      } catch (err) {
        console.warn("[youtube] Failed to parse tokens.json:", err.message);
      }
    }

    // Auto-save refreshed tokens
    oauth2Client.on("tokens", (newTokens) => {
      try {
        let existing = {};
        if (fs.existsSync(TOKENS_PATH)) {
          existing = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"));
        }
        const updated = { ...existing, ...newTokens };
        fs.writeFileSync(TOKENS_PATH, JSON.stringify(updated, null, 2), "utf8");
        console.log("[youtube] Refreshed tokens saved to tokens.json");
      } catch (err) {
        console.warn("[youtube] Failed to save updated tokens:", err.message);
      }
    });

    return oauth2Client;
  } catch (err) {
    console.error("[youtube] Failed to initialize OAuth2 client:", err.message);
    return null;
  }
}

export function isYouTubeAuthenticated() {
  const client = getOAuth2Client();
  if (!client) return false;
  if (!fs.existsSync(TOKENS_PATH)) return false;
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"));
    return !!(tokens && (tokens.access_token || tokens.refresh_token));
  } catch {
    return false;
  }
}

export function getYouTubeAuthUrl() {
  const client = getOAuth2Client();
  if (!client) throw new Error("YouTube OAuth2 client not configured. Check credentials/secret.json");

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
  });
}

export async function handleYouTubeCallback(code) {
  const client = getOAuth2Client();
  if (!client) throw new Error("OAuth2 client not initialized");

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), "utf8");
  return tokens;
}

export async function uploadVideoToYouTube({ videoPath, thumbPath, title, description, tags = [] }) {
  if (!isYouTubeAuthenticated()) {
    console.warn("[youtube] YouTube is not connected. Skipping upload.");
    return {
      uploaded: false,
      reason: "YouTube account not authorized. Authorize in the admin dashboard.",
    };
  }

  const client = getOAuth2Client();
  const youtube = google.youtube({ version: "v3", auth: client });

  console.log(`[youtube] Starting video upload: "${title}"`);

  // 1. Insert video
  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description,
        tags: tags.length ? tags : ["Lyrics", "Music", "Spark"],
        categoryId: "10", // Music category
        defaultLanguage: "en",
        defaultAudioLanguage: "en",
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = res.data.id;
  const youtubeUrl = `https://youtu.be/${videoId}`;
  console.log(`[youtube] Video uploaded successfully! Video ID: ${videoId} (${youtubeUrl})`);

  // 2. Set thumbnail if available
  if (thumbPath && fs.existsSync(thumbPath)) {
    try {
      console.log(`[youtube] Uploading custom thumbnail for video ${videoId}...`);
      await youtube.thumbnails.set({
        videoId,
        media: {
          mimeType: "image/jpeg",
          body: fs.createReadStream(thumbPath),
        },
      });
      console.log("[youtube] Custom thumbnail set successfully!");
    } catch (thumbErr) {
      console.warn("[youtube] Failed to set thumbnail:", thumbErr.message);
    }
  }

  return {
    uploaded: true,
    videoId,
    youtubeUrl,
  };
}
