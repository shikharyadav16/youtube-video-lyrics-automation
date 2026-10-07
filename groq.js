import "dotenv/config";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
export const FALLBACK_GROQ_MODEL = "openai/gpt-oss-20b";

export function isGroqConfigured() {
  return !!(process.env.GROQ_API_KEY || process.env.GROQ_KEY);
}

/**
 * Detect if text contains non-Latin scripts (Devanagari, Gurmukhi, Bengali, etc.)
 */
export function hasNonLatinScript(text) {
  if (!text) return false;
  // Non-Latin Unicode ranges (Devanagari, Gurmukhi, Bengali, Gujarati, Tamil, Telugu, Arabic, etc.)
  return /[\u0900-\u0DFF\u0600-\u06FF]/.test(String(text));
}

/**
 * Call Groq Chat Completions API with automatic model fallback
 */
async function callGroqChat({ messages, temperature = 0.2, maxTokens = 3000, model = DEFAULT_GROQ_MODEL }) {
  const apiKey = (process.env.GROQ_API_KEY || process.env.GROQ_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY / GROQ_KEY is not set in environment or .env file.");
  }

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  let res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(payload),
  });

  // If primary model (e.g. openai/gpt-oss-120b) fails with 404 or 400 or rate limit, retry with fallback
  if (!res.ok && model !== FALLBACK_GROQ_MODEL) {
    const errText = await res.text();
    console.warn(`[groq] Model ${model} request failed (${res.status}): ${errText.slice(0, 120)}. Retrying with ${FALLBACK_GROQ_MODEL}...`);
    payload.model = FALLBACK_GROQ_MODEL;
    res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify(payload),
    });
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const choice = json.choices && json.choices[0];
  return (choice?.message?.content || "").trim();
}

/**
 * Transliterate an array of synced lyric lines into Romanized English letters (Hinglish/English-script Hindi/Punjabi)
 * Preserves exact line-by-line timestamp alignment!
 *
 * @param {Array<{ timeMs: number, text: string }>} lines
 * @param {Object} [meta]
 * @param {string} [meta.title]
 * @param {string} [meta.singer]
 * @returns {Promise<Array<{ timeMs: number, text: string }>>}
 */
export async function transliterateLyricsToRomanized(lines, meta = {}) {
  if (!lines || !lines.length) return lines;

  // Check if any lines have non-Latin script
  const nonLatinCount = lines.filter((l) => hasNonLatinScript(l.text)).length;
  if (nonLatinCount === 0) {
    // Already in Latin/English letters
    return lines;
  }

  console.log(`[groq] Transliterating ${lines.length} lyric lines (${nonLatinCount} non-Latin) for "${meta.title || "Song"}" using Groq (${DEFAULT_GROQ_MODEL})...`);

  const songContext = meta.title ? `Song: "${meta.title}"${meta.singer ? ` by ${meta.singer}` : ""}` : "";

  // Prepare numbered lines so Groq maintains strict 1-to-1 matching
  const inputPrompt = lines
    .map((l, idx) => `[L${idx + 1}] ${l.text}`)
    .join("\n");

  const systemPrompt = `You are an expert Indian song lyric transliterator.
Your task is to convert song lyrics written in Indian scripts (Hindi/Devanagari, Punjabi/Gurmukhi, Bengali, Gujarati, etc.) into Romanized / Hinglish (English letters), as commonly used in official Bollywood/Punjabi lyric videos and Spotify.

CRITICAL INSTRUCTIONS:
1. Transliterate the pronunciation accurately into standard Romanized English letters (e.g., 'तेरा मुखड़ा' -> 'Tera mukhda', 'ਕਿਆ ਬਾਤ ਐ' -> 'Kya baat ay', 'कर दी है हुस्न की खाली तिजोरियाँ' -> 'Kar di hai husn ki khaali tijoriyan').
2. DO NOT translate the meaning into English words. Retain the original Hindi/Punjabi words spelled phonetically in English alphabet.
3. If a line or word is already in English letters, keep it as is.
4. Keep the exact line markers [L1], [L2], etc. at the start of each line so timestamps can be accurately synchronized.
5. Return ONLY the transliterated lines with their line markers. Do not add any conversational text, explanations, or notes.`;

  const userPrompt = `${songContext ? `${songContext}\n\n` : ""}Please transliterate these lyrics into English letters:\n\n${inputPrompt}`;

  try {
    const rawOutput = await callGroqChat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
    });

    // Parse the output lines by line marker [L1], [1], (L1), etc.
    const markerRegex = /(?:\[|\()L?(\d+)(?:\]|\))\s*[:\-]?\s*(.*)/g;
    const transliteratedMap = new Map();

    let match;
    while ((match = markerRegex.exec(rawOutput)) !== null) {
      const lineNum = parseInt(match[1], 10);
      const cleanText = match[2]
        .replace(/^(?:\[|\()L?\d+(?:\]|\))\s*[:\-]?\s*/i, "")
        .trim();
      transliteratedMap.set(lineNum, cleanText);
    }

    // Fallback split if markers weren't used
    const rawLines = rawOutput
      .split(/\r?\n/)
      .map((l) => l.replace(/^(?:\[|\()L?\d+(?:\]|\))\s*[:\-]?\s*/i, "").trim())
      .filter((l) => l && !l.startsWith("```"));

    const result = lines.map((originalLine, idx) => {
      const lineNum = idx + 1;
      let newText = transliteratedMap.get(lineNum);

      if (!newText && rawLines[idx]) {
        newText = rawLines[idx];
      }

      // If still missing or empty, fallback to original
      if (!newText) {
        newText = originalLine.text;
      }

      // Final cleanup of any lingering markers or quote wraps
      newText = newText
        .replace(/^(?:\[|\()L?\d+(?:\]|\))\s*[:\-]?\s*/i, "")
        .replace(/^["']|["']$/g, "")
        .trim();

      return {
        timeMs: originalLine.timeMs,
        text: newText,
      };
    });

    console.log(`[groq] ✔ Successfully transliterated ${result.length} lines into Romanized English letters!`);
    return result;
  } catch (err) {
    console.error(`[groq] Transliteration failed:`, err.message);
    // Graceful fallback to original lines so pipeline doesn't break
    return lines;
  }
}

/**
 * Transliterate a single string (title or singer) into Romanized English letters
 */
export async function transliterateTextToRomanized(text) {
  if (!text || !hasNonLatinScript(text)) return text;

  try {
    const prompt = `Transliterate the following Hindi/Punjabi title or name into standard Romanized English letters (Hinglish/English script). Output ONLY the transliterated text, nothing else:\n"${text}"`;
    const result = await callGroqChat({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      maxTokens: 1200,
    });
    return result.replace(/^["']|["']$/g, "").trim() || text;
  } catch (err) {
    console.warn(`[groq] Single text transliteration failed:`, err.message);
    return text;
  }
}

/**
 * Find lyrics using Groq when JioSaavn and LRCLIB have no lyrics
 */
export async function findLyricsWithGroq({ title, singer }) {
  if (!title) return null;

  console.log(`[groq] Searching lyrics for "${title}" by "${singer || "Artist"}" using Groq...`);

  const prompt = `Provide the complete lyrics for the song "${title}" by ${singer || "the artist"}.
Write the lyrics in Romanized English letters (Hinglish/English script Hindi or Punjabi if Indian, or English).
Output ONLY the lyrics text, one line per line, without chords, section headers (no [Chorus], [Verse]), or commentary.`;

  try {
    const rawLyrics = await callGroqChat({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      maxTokens: 2500,
    });

    if (!rawLyrics || rawLyrics.length < 20) return null;

    const refusalPatterns = [
      /sorry.*(?:can'?t|cannot).*provide/i,
      /as an ai/i,
      /copyright/i,
      /cannot reproduce/i,
      /unable to provide/i,
    ];
    if (refusalPatterns.some((p) => p.test(rawLyrics))) {
      console.warn("[groq] Model declined to output lyrics for policy reasons.");
      return null;
    }

    return {
      source: "groq",
      lyrics: rawLyrics,
    };
  } catch (err) {
    console.error(`[groq] Finding lyrics failed:`, err.message);
    return null;
  }
}
