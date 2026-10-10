/**
 * Spark Shorts Studio — Client Application
 * Dedicated 9:16 Vertical Video Editor for YouTube Shorts, Reels & TikTok.
 * Features:
 *  - JioSaavn song search & stream proxy
 *  - Synced lyrics with frame-perfect audio trimming
 *  - Interactive waveform cut handles (presets: 15s, 30s, 60s, Full)
 *  - Continuous vertical sliding lyrics reel preview (past dimmed, current centered & highlighted, upcoming dimmed)
 *  - Background gallery, blur, darkness overlay, 3D audio, 60 FPS NVENC render pipeline
 */

// Application State
const state = {
  currentSong: null,
  audioUrl: null,
  lyrics: [], // [{ timeMs, text }]
  activeLineIndex: -1,
  backgrounds: [],
  selectedBackground: "1.jpg",

  // Audio Trimming
  songDuration: 180,
  trimStart: 0,
  trimEnd: 30,
  isPlayingTrimmed: false,

  // Video & Typography Settings
  resolution: "9:16",
  width: 1080,
  height: 1920,
  fontFamily: "Edo",
  fontWeight: "Regular", // Default 400
  fontSize: 56,
  highlightColor: "#00f0ff",
  textColor: "#ffffff",

  // Visual Overlays
  bgBlur: 0,
  bgDarkness: 0.25,
  bgMotion: "zoom",

  // Timing & Audio
  lyricDelay: -0.3,
  audio3dEnabled: false,
  audio3dSoundStyle: "orbit",
  fps: 60, // Default 60 FPS

  // Rendering
  activeJobId: null,
  pollTimer: null,
};

// DOM Elements
const dom = {
  // Tabs
  tabButtons: document.querySelectorAll(".tab-btn"),
  tabContents: document.querySelectorAll(".tab-content"),

  // Search
  searchInput: document.getElementById("searchInput"),
  btnSearch: document.getElementById("btnSearch"),
  searchResultsList: document.getElementById("searchResultsList"),
  resultsCount: document.getElementById("resultsCount"),
  activeSongCard: document.getElementById("activeSongCard"),
  activeSongArt: document.getElementById("activeSongArt"),
  activeSongTitle: document.getElementById("activeSongTitle"),
  activeSongArtist: document.getElementById("activeSongArtist"),
  activeSongDuration: document.getElementById("activeSongDuration"),
  activeSongQuality: document.getElementById("activeSongQuality"),
  activeLyricsSource: document.getElementById("activeLyricsSource"),
  btnQuickDemo: document.getElementById("btnQuickDemo"),

  // Trimmer
  trimmerCard: document.getElementById("trimmerCard"),
  trimmerDurationBadge: document.getElementById("trimmerDurationBadge"),
  trimRangeHighlight: document.getElementById("trimRangeHighlight"),
  trimPlayhead: document.getElementById("trimPlayhead"),
  sliderTrimStart: document.getElementById("sliderTrimStart"),
  sliderTrimEnd: document.getElementById("sliderTrimEnd"),
  inputTrimStart: document.getElementById("inputTrimStart"),
  inputTrimEnd: document.getElementById("inputTrimEnd"),
  btnStartMinus: document.getElementById("btnStartMinus"),
  btnStartPlus: document.getElementById("btnStartPlus"),
  btnEndMinus: document.getElementById("btnEndMinus"),
  btnEndPlus: document.getElementById("btnEndPlus"),
  btnPreviewTrim: document.getElementById("btnPreviewTrim"),
  previewTrimIcon: document.getElementById("previewTrimIcon"),
  presetButtons: document.querySelectorAll(".preset-btn"),

  // Lyrics Timeline
  lyricsTimeline: document.getElementById("lyricsTimeline"),
  lyricsCountBadge: document.getElementById("lyricsCountBadge"),
  btnToggleLrcRaw: document.getElementById("btnToggleLrcRaw"),
  rawLrcContainer: document.getElementById("rawLrcContainer"),
  rawLrcText: document.getElementById("rawLrcText"),
  btnApplyRawLrc: document.getElementById("btnApplyRawLrc"),
  btnCancelRawLrc: document.getElementById("btnCancelRawLrc"),

  // 9:16 Stage & Viewport
  viewport916: document.getElementById("viewport916"),
  stageBgLayer: document.getElementById("stageBgLayer"),
  stageDarkOverlay: document.getElementById("stageDarkOverlay"),
  slidingLyricsReel: document.getElementById("slidingLyricsReel"),
  reelLinePrev: document.getElementById("reelLinePrev"),
  reelTextPrev: document.getElementById("reelTextPrev"),
  reelLineActive: document.getElementById("reelLineActive"),
  reelTextActive: document.getElementById("reelTextActive"),
  reelLineNext: document.getElementById("reelLineNext"),
  reelTextNext: document.getElementById("reelTextNext"),
  stagePlayOverlay: document.getElementById("stagePlayOverlay"),

  // Master Audio Bar
  nativeAudio: document.getElementById("nativeAudio"),
  btnPlayPause: document.getElementById("btnPlayPause"),
  playIcon: document.getElementById("playIcon"),
  currentTimecode: document.getElementById("currentTimecode"),
  totalDurationTimecode: document.getElementById("totalDurationTimecode"),
  progressBarContainer: document.getElementById("progressBarContainer"),
  progressBarFill: document.getElementById("progressBarFill"),
  volumeSlider: document.getElementById("volumeSlider"),

  // Settings Controls
  selectResolution: document.getElementById("selectResolution"),
  customResInputs: document.getElementById("customResInputs"),
  inputWidth: document.getElementById("inputWidth"),
  inputHeight: document.getElementById("inputHeight"),

  selectFontFamily: document.getElementById("selectFontFamily"),
  selectFontWeight: document.getElementById("selectFontWeight"),
  sliderFontSize: document.getElementById("sliderFontSize"),
  valFontSize: document.getElementById("valFontSize"),
  pickerHighlightColor: document.getElementById("pickerHighlightColor"),
  labelHighlightColor: document.getElementById("labelHighlightColor"),
  pickerTextColor: document.getElementById("pickerTextColor"),
  labelTextColor: document.getElementById("labelTextColor"),

  bgGalleryGrid: document.getElementById("bgGalleryGrid"),
  bgUploadInput: document.getElementById("bgUploadInput"),
  sliderBgBlur: document.getElementById("sliderBgBlur"),
  valBgBlur: document.getElementById("valBgBlur"),
  sliderBgDarkness: document.getElementById("sliderBgDarkness"),
  valBgDarkness: document.getElementById("valBgDarkness"),
  selectBgMotion: document.getElementById("selectBgMotion"),

  sliderLyricDelay: document.getElementById("sliderLyricDelay"),
  valLyricDelay: document.getElementById("valLyricDelay"),
  btnResetDelay: document.getElementById("btnResetDelay"),

  chk3dAudio: document.getElementById("chk3dAudio"),
  body3dAudio: document.getElementById("body3dAudio"),
  select3dSoundStyle: document.getElementById("select3dSoundStyle"),
  selectFps: document.getElementById("selectFps"),

  // Render & Export
  btnExportTop: document.getElementById("btnExportTop"),
  btnExportBottom: document.getElementById("btnExportBottom"),
  renderModal: document.getElementById("renderModal"),
  renderInProgressView: document.getElementById("renderInProgressView"),
  renderStatusTitle: document.getElementById("renderStatusTitle"),
  renderStatusSubtitle: document.getElementById("renderStatusSubtitle"),
  renderProgressFill: document.getElementById("renderProgressFill"),
  renderPercentLabel: document.getElementById("renderPercentLabel"),
  renderSuccessView: document.getElementById("renderSuccessView"),
  renderedVideoPlayer: document.getElementById("renderedVideoPlayer"),
  btnDownloadVideo: document.getElementById("btnDownloadVideo"),
  btnCloseRenderModal: document.getElementById("btnCloseRenderModal"),
  renderFailView: document.getElementById("renderFailView"),
  renderFailMsg: document.getElementById("renderFailMsg"),
  btnRetryRender: document.getElementById("btnRetryRender"),
  toastContainer: document.getElementById("toastContainer"),
};

/* ------------------------------------------------------------------ */
/*  Helper Functions                                                  */
/* ------------------------------------------------------------------ */
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

/* ------------------------------------------------------------------ */
/*  1. Tab Switching & Initialization                                 */
/* ------------------------------------------------------------------ */
dom.tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    dom.tabButtons.forEach((b) => b.classList.remove("active"));
    dom.tabContents.forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.classList.add("active");
  });
});

/* ------------------------------------------------------------------ */
/*  2. JioSaavn Song Search & Loading                                 */
/* ------------------------------------------------------------------ */
async function searchSongs(query) {
  if (!query) return;
  dom.searchResultsList.innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <p>Searching JioSaavn database for "${escapeHtml(query)}"...</p>
    </div>
  `;

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&n=25`);
    const data = await res.json();

    if (!data.items || !data.items.length) {
      dom.searchResultsList.innerHTML = `
        <div class="empty-state">
          <i class="fa-regular fa-face-frown"></i>
          <p>No tracks found for "${escapeHtml(query)}". Try another search!</p>
        </div>
      `;
      return;
    }

    dom.resultsCount.textContent = `Found ${data.items.length} tracks:`;
    dom.searchResultsList.innerHTML = data.items
      .map((item) => {
        const title = escapeHtml(item.title);
        const artist = escapeHtml(
          (item.artists?.primary || []).map((a) => a.name).join(", ") ||
          item.subtitle ||
          item.artist ||
          "Unknown Artist"
        );
        const duration = formatTime(item.duration);
        const img = item.image || item.albumArt || "";

        return `
        <div class="song-item" data-id="${item.id}">
          <img src="${img}" alt="${title}" class="song-item-art" onerror="this.src='/assets/background/1.jpg'">
          <div class="song-item-meta">
            <div class="song-item-title">${title}</div>
            <div class="song-item-artist">${artist} &bull; ${duration}</div>
          </div>
          <button class="btn btn-xs btn-secondary"><i class="fa-solid fa-arrow-right"></i></button>
        </div>
      `;
      })
      .join("");

    // Click handler for search items
    document.querySelectorAll(".song-item").forEach((el) => {
      el.addEventListener("click", () => {
        const songId = el.dataset.id;
        const matched = data.items.find((x) => x.id === songId);
        loadSong(songId, matched);
      });
    });
  } catch (err) {
    console.error("Search error:", err);
    dom.searchResultsList.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-circle-exclamation"></i>
        <p>Search failed. Check server connection.</p>
      </div>
    `;
  }
}

dom.btnSearch.addEventListener("click", () => searchSongs(dom.searchInput.value.trim()));
dom.searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchSongs(dom.searchInput.value.trim());
});

dom.btnQuickDemo.addEventListener("click", () => {
  dom.searchInput.value = "Millionaire";
  searchSongs("Millionaire");
});

/* ------------------------------------------------------------------ */
/*  3. Load Song, Audio Stream & Synced Lyrics                        */
/* ------------------------------------------------------------------ */
async function loadSong(songId, cachedMeta = null) {
  showToast("Fetching decrypted audio stream & synced lyrics...");

  if (cachedMeta) {
    dom.activeSongCard.style.display = "flex";
    dom.activeSongArt.src = cachedMeta.image || cachedMeta.albumArt || "";
    dom.activeSongTitle.textContent = cachedMeta.title || "Selected Song";
    dom.activeSongArtist.textContent =
      (cachedMeta.artists?.primary || []).map((a) => a.name).join(", ") ||
      cachedMeta.subtitle ||
      "";
    dom.activeSongDuration.textContent = formatTime(cachedMeta.duration);
  }

  try {
    const songRes = await fetch(`/api/song/${encodeURIComponent(songId)}`);
    const songData = await songRes.json();

    if (songData.error || !songData.streamUrl) {
      showToast(`Error: ${songData.error || "No audio stream available"}`);
      return;
    }

    state.currentSong = songData;
    state.audioUrl = songData.proxyUrl || songData.streamUrl;
    state.songDuration = Number(songData.duration) || 180;

    // Set Audio Player Source
    dom.nativeAudio.src = state.audioUrl;
    dom.nativeAudio.load();

    // Fetch Synced Lyrics
    const lyricsRes = await fetch(`/api/lyrics/${encodeURIComponent(songId)}/synced`);
    const lyricsData = await lyricsRes.json();

    let loadedLines = [];
    if (lyricsData.lines && lyricsData.lines.length) {
      loadedLines = lyricsData.lines;
      dom.activeLyricsSource.innerHTML = `<i class="fa-solid fa-check"></i> Synced (${(lyricsData.source || "LRCLIB").toUpperCase()})`;
    } else if (lyricsData.lyrics) {
      loadedLines = generateEstimatedTimestamps(lyricsData.lyrics, state.songDuration);
      dom.activeLyricsSource.innerHTML = `<i class="fa-solid fa-align-left"></i> Plain text`;
    } else {
      loadedLines = [
        { timeMs: 0, text: `♪ ${songData.title} ♪` },
        { timeMs: 4000, text: (songData.artists?.primary || []).map((a) => a.name).join(", ") || "Spark Shorts" },
      ];
      dom.activeLyricsSource.innerHTML = `<i class="fa-solid fa-music"></i> Instrumental`;
    }

    setLyrics(loadedLines, lyricsData.lrc || "");

    // Setup Initial Trimmer
    initTrimmer(state.songDuration);

    // Update active highlight
    document.querySelectorAll(".song-item").forEach((el) => {
      el.classList.toggle("selected", el.dataset.id === songId);
    });

    showToast(`Loaded "${songData.title}" (${loadedLines.length} lyric lines)!`);

    // Auto play preview from trim start
    dom.nativeAudio.currentTime = state.trimStart;
    dom.nativeAudio.play().catch(() => {});
  } catch (err) {
    console.error("Load song error:", err);
    showToast("Failed to load song audio and lyrics.");
  }
}

function generateEstimatedTimestamps(plainLyrics, durationSec) {
  const rawLines = plainLyrics
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("[") && !l.startsWith("Chorus") && !l.startsWith("Verse"));

  if (!rawLines.length) return [{ timeMs: 0, text: "♪ Instrumental ♪" }];
  const intervalMs = Math.floor((durationSec * 1000) / (rawLines.length + 1));
  return rawLines.map((text, idx) => ({
    timeMs: idx * intervalMs,
    text,
  }));
}

function setLyrics(lines, rawLrc = "") {
  state.lyrics = lines;
  dom.lyricsCountBadge.textContent = lines.length;
  dom.rawLrcText.value = rawLrc || lines.map((l) => `[${formatLrcTime(l.timeMs)}] ${l.text}`).join("\n");

  renderLyricsTimeline();
  updateStageLyrics(0);
}

function formatLrcTime(timeMs) {
  const totalSec = timeMs / 1000;
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(2);
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

function renderLyricsTimeline() {
  dom.lyricsTimeline.innerHTML = state.lyrics
    .map((line, idx) => {
      const timeStr = formatLrcTime(line.timeMs);
      return `
      <div class="timeline-row" data-idx="${idx}" data-time="${line.timeMs}">
        <span class="timeline-time">${timeStr}</span>
        <span class="timeline-text">${escapeHtml(line.text)}</span>
      </div>
    `;
    })
    .join("");

  document.querySelectorAll(".timeline-row").forEach((row) => {
    row.addEventListener("click", () => {
      const ms = Number(row.dataset.time);
      const sec = ms / 1000;
      dom.nativeAudio.currentTime = Math.max(0, sec);
      dom.nativeAudio.play().catch(() => {});
    });
  });
}

// Raw LRC Editor Toggle
dom.btnToggleLrcRaw.addEventListener("click", () => {
  const isHidden = dom.rawLrcContainer.style.display === "none";
  dom.rawLrcContainer.style.display = isHidden ? "flex" : "none";
  dom.lyricsTimeline.style.display = isHidden ? "none" : "flex";
});

dom.btnCancelRawLrc.addEventListener("click", () => {
  dom.rawLrcContainer.style.display = "none";
  dom.lyricsTimeline.style.display = "flex";
});

dom.btnApplyRawLrc.addEventListener("click", () => {
  const raw = dom.rawLrcText.value.trim();
  if (!raw) return;
  const parsed = parseLrc(raw);
  if (parsed.length) {
    setLyrics(parsed, raw);
    dom.rawLrcContainer.style.display = "none";
    dom.lyricsTimeline.style.display = "flex";
    showToast(`Applied ${parsed.length} lyric lines from LRC!`);
  } else {
    showToast("Invalid LRC format. Lines must start with [mm:ss.xx]");
  }
});

function parseLrc(lrcText) {
  const lines = [];
  const regex = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;
  for (const rawLine of lrcText.split(/\r?\n/)) {
    const match = rawLine.match(regex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const timeMs = Math.round((minutes * 60 + seconds) * 1000);
      const text = match[3].trim();
      if (text) lines.push({ timeMs, text });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/* ------------------------------------------------------------------ */
/*  4. Interactive Audio Trimmer Controller                           */
/* ------------------------------------------------------------------ */
function initTrimmer(durationSec) {
  state.songDuration = Math.max(10, Math.round(durationSec));

  // Configure slider max
  dom.sliderTrimStart.max = state.songDuration;
  dom.sliderTrimEnd.max = state.songDuration;
  dom.inputTrimStart.max = state.songDuration;
  dom.inputTrimEnd.max = state.songDuration;

  // Default to 30s cut (or shorter if song is short)
  state.trimStart = 0;
  state.trimEnd = Math.min(30, state.songDuration);

  updateTrimmerUI();
}

function updateTrimmerUI() {
  // Sync sliders
  dom.sliderTrimStart.value = state.trimStart;
  dom.sliderTrimEnd.value = state.trimEnd;

  // Sync inputs
  dom.inputTrimStart.value = Number(state.trimStart).toFixed(1);
  dom.inputTrimEnd.value = Number(state.trimEnd).toFixed(1);

  // Compute duration
  const dur = Math.max(0, state.trimEnd - state.trimStart);
  dom.trimmerDurationBadge.textContent = `Selected: ${dur.toFixed(1)}s (${formatTime(state.trimStart)} → ${formatTime(state.trimEnd)})`;

  // Update visual highlight bar
  const startPct = (state.trimStart / state.songDuration) * 100;
  const endPct = (state.trimEnd / state.songDuration) * 100;
  const widthPct = Math.max(0, endPct - startPct);

  dom.trimRangeHighlight.style.left = `${startPct}%`;
  dom.trimRangeHighlight.style.width = `${widthPct}%`;
}

// Trimmer Sliders Events
dom.sliderTrimStart.addEventListener("input", (e) => {
  let val = parseFloat(e.target.value);
  if (val >= state.trimEnd - 1) {
    val = Math.max(0, state.trimEnd - 1);
    dom.sliderTrimStart.value = val;
  }
  state.trimStart = val;
  updateTrimmerUI();
});

dom.sliderTrimEnd.addEventListener("input", (e) => {
  let val = parseFloat(e.target.value);
  if (val <= state.trimStart + 1) {
    val = Math.min(state.songDuration, state.trimStart + 1);
    dom.sliderTrimEnd.value = val;
  }
  state.trimEnd = val;
  updateTrimmerUI();
});

// Trimmer Steppers
dom.btnStartMinus.addEventListener("click", () => {
  state.trimStart = Math.max(0, parseFloat((state.trimStart - 0.5).toFixed(1)));
  updateTrimmerUI();
});
dom.btnStartPlus.addEventListener("click", () => {
  state.trimStart = Math.min(state.trimEnd - 1, parseFloat((state.trimStart + 0.5).toFixed(1)));
  updateTrimmerUI();
});
dom.btnEndMinus.addEventListener("click", () => {
  state.trimEnd = Math.max(state.trimStart + 1, parseFloat((state.trimEnd - 0.5).toFixed(1)));
  updateTrimmerUI();
});
dom.btnEndPlus.addEventListener("click", () => {
  state.trimEnd = Math.min(state.songDuration, parseFloat((state.trimEnd + 0.5).toFixed(1)));
  updateTrimmerUI();
});

// Direct Input Changes
dom.inputTrimStart.addEventListener("change", (e) => {
  let val = parseFloat(e.target.value) || 0;
  val = Math.max(0, Math.min(state.trimEnd - 1, val));
  state.trimStart = val;
  updateTrimmerUI();
});
dom.inputTrimEnd.addEventListener("change", (e) => {
  let val = parseFloat(e.target.value) || 30;
  val = Math.max(state.trimStart + 1, Math.min(state.songDuration, val));
  state.trimEnd = val;
  updateTrimmerUI();
});

// Quick Cut Presets
dom.presetButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    dom.presetButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const secType = btn.dataset.seconds;
    if (secType === "full") {
      state.trimStart = 0;
      state.trimEnd = state.songDuration;
    } else {
      const cutSec = parseFloat(secType);
      if (state.trimStart + cutSec <= state.songDuration) {
        state.trimEnd = state.trimStart + cutSec;
      } else {
        state.trimStart = Math.max(0, state.songDuration - cutSec);
        state.trimEnd = state.songDuration;
      }
    }
    updateTrimmerUI();
    showToast(`Trim set to ${btn.textContent.trim()} segment.`);
  });
});

// Preview Trim Button
dom.btnPreviewTrim.addEventListener("click", () => {
  if (!state.audioUrl) {
    showToast("Please load a track first!");
    return;
  }
  state.isPlayingTrimmed = true;
  dom.nativeAudio.currentTime = state.trimStart;
  dom.nativeAudio.play().catch(() => {});
  dom.previewTrimIcon.className = "fa-solid fa-rotate-right fa-spin";
  setTimeout(() => {
    dom.previewTrimIcon.className = "fa-solid fa-play";
  }, 1000);
});

/* ------------------------------------------------------------------ */
/*  5. Master Audio Playback & Vertical Sliding Lyrics Reel           */
/* ------------------------------------------------------------------ */
function togglePlayPause() {
  if (!state.audioUrl) {
    showToast("Please select a song first!");
    return;
  }
  if (dom.nativeAudio.paused) {
    dom.nativeAudio.play();
  } else {
    dom.nativeAudio.pause();
  }
}

dom.btnPlayPause.addEventListener("click", togglePlayPause);
dom.stagePlayOverlay.addEventListener("click", togglePlayPause);

dom.nativeAudio.addEventListener("play", () => {
  dom.playIcon.className = "fa-solid fa-pause";
  dom.stagePlayOverlay.style.display = "none";
});

dom.nativeAudio.addEventListener("pause", () => {
  dom.playIcon.className = "fa-solid fa-play";
  dom.stagePlayOverlay.style.display = "flex";
  state.isPlayingTrimmed = false;
});

dom.nativeAudio.addEventListener("timeupdate", () => {
  const cur = dom.nativeAudio.currentTime;
  const dur = dom.nativeAudio.duration || state.songDuration || 1;
  const pct = (cur / dur) * 100;

  dom.currentTimecode.textContent = formatTime(cur);
  dom.totalDurationTimecode.textContent = formatTime(dur);
  dom.progressBarFill.style.width = `${pct}%`;

  // Update Trimmer Playhead
  if (state.songDuration > 0) {
    const playheadPct = Math.min(100, Math.max(0, (cur / state.songDuration) * 100));
    dom.trimPlayhead.style.left = `${playheadPct}%`;
  }

  // Handle Trimmed segment playback boundary
  if (state.isPlayingTrimmed && cur >= state.trimEnd) {
    dom.nativeAudio.pause();
    dom.nativeAudio.currentTime = state.trimStart;
    state.isPlayingTrimmed = false;
    return;
  }

  // Update Live Vertical Sliding Lyrics Reel
  updateStageLyrics(cur * 1000);
});

// Seek by clicking progress bar
dom.progressBarContainer.addEventListener("click", (e) => {
  if (!dom.nativeAudio.duration) return;
  const rect = dom.progressBarContainer.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = clickX / rect.width;
  dom.nativeAudio.currentTime = pct * dom.nativeAudio.duration;
});

// Volume control
dom.volumeSlider.addEventListener("input", (e) => {
  dom.nativeAudio.volume = parseFloat(e.target.value);
});

/* ------------------------------------------------------------------ */
/*  6. Vertical Sliding Lyrics Reel Engine                            */
/* ------------------------------------------------------------------ */
function updateStageLyrics(currentMs) {
  if (!state.lyrics || !state.lyrics.length) {
    dom.reelTextPrev.textContent = "";
    dom.reelTextActive.textContent = state.currentSong
      ? `♪ ${state.currentSong.title} ♪`
      : "Select a track to start";
    dom.reelTextNext.textContent = "";
    return;
  }

  // Apply user-configured delay offset (-3.0s to +3.0s)
  const targetMs = currentMs - state.lyricDelay * 1000;

  // Find active line
  let activeIdx = -1;
  for (let i = 0; i < state.lyrics.length; i++) {
    if (state.lyrics[i].timeMs <= targetMs) {
      activeIdx = i;
    } else {
      break;
    }
  }

  if (activeIdx !== state.activeLineIndex) {
    state.activeLineIndex = activeIdx;

    // Timeline row highlight
    document.querySelectorAll(".timeline-row").forEach((el, idx) => {
      el.classList.toggle("active", idx === activeIdx);
    });

    // Animate sliding reel transition
    dom.slidingLyricsReel.style.transform = "translateY(-54%)";
    dom.slidingLyricsReel.style.transition = "transform 0.12s ease-out";

    setTimeout(() => {
      dom.slidingLyricsReel.style.transform = "translateY(-50%)";
      dom.slidingLyricsReel.style.transition = "transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)";
    }, 120);

    if (activeIdx >= 0) {
      const prevLine = state.lyrics[activeIdx - 1];
      const curLine = state.lyrics[activeIdx];
      const nextLine = state.lyrics[activeIdx + 1];

      dom.reelTextPrev.textContent = prevLine ? prevLine.text : "";
      dom.reelTextActive.textContent = curLine ? curLine.text : "♪";
      dom.reelTextNext.textContent = nextLine ? nextLine.text : "";
    } else {
      dom.reelTextPrev.textContent = "";
      dom.reelTextActive.textContent = state.lyrics[0] ? state.lyrics[0].text : "♪";
      dom.reelTextNext.textContent = state.lyrics[1] ? state.lyrics[1].text : "";
    }
  }
}

/* ------------------------------------------------------------------ */
/*  7. Background Gallery, Blur & Darkness Management                */
/* ------------------------------------------------------------------ */
async function loadBackgrounds() {
  try {
    const res = await fetch("/api/backgrounds");
    const data = await res.json();
    state.backgrounds = data.backgrounds || [];
    renderBackgroundGallery();

    if (state.backgrounds.length) {
      selectBackground(state.backgrounds[0].filename);
    }
  } catch (err) {
    console.error("Failed to load backgrounds:", err);
  }
}

function renderBackgroundGallery() {
  dom.bgGalleryGrid.innerHTML = state.backgrounds
    .map((bg) => {
      const isSelected = bg.filename === state.selectedBackground;
      return `
      <div class="bg-thumb ${isSelected ? "selected" : ""}" data-filename="${bg.filename}">
        <img src="${bg.url}" alt="${bg.filename}" loading="lazy">
      </div>
    `;
    })
    .join("");

  document.querySelectorAll(".bg-thumb").forEach((thumb) => {
    thumb.addEventListener("click", () => {
      selectBackground(thumb.dataset.filename);
    });
  });
}

function selectBackground(filename) {
  state.selectedBackground = filename;
  const found = state.backgrounds.find((b) => b.filename === filename);
  if (found) {
    dom.stageBgLayer.src = found.url;
  } else {
    dom.stageBgLayer.src = `/assets/background/${filename}`;
  }

  document.querySelectorAll(".bg-thumb").forEach((thumb) => {
    thumb.classList.toggle("selected", thumb.dataset.filename === filename);
  });
}

// Background Upload
dom.bgUploadInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await fetch("/api/backgrounds/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl: reader.result,
          filename: file.name,
        }),
      });
      const data = await res.json();
      if (data.success) {
        state.backgrounds.unshift({ filename: data.filename, url: data.url });
        renderBackgroundGallery();
        selectBackground(data.filename);
        showToast("Custom background loaded & selected!");
      }
    } catch (err) {
      console.error("Upload failed:", err);
      showToast("Background upload failed");
    }
  };
  reader.readAsDataURL(file);
});

// Blur Slider
dom.sliderBgBlur.addEventListener("input", (e) => {
  state.bgBlur = parseInt(e.target.value, 10);
  dom.valBgBlur.textContent = `${state.bgBlur}px`;
  dom.stageBgLayer.style.filter = state.bgBlur > 0 ? `blur(${state.bgBlur}px)` : "none";
});

// Darkness Slider
dom.sliderBgDarkness.addEventListener("input", (e) => {
  state.bgDarkness = parseFloat(e.target.value);
  dom.valBgDarkness.textContent = `${Math.round(state.bgDarkness * 100)}%`;
  dom.stageDarkOverlay.style.opacity = state.bgDarkness;
});

// Motion Selector
dom.selectBgMotion.addEventListener("change", (e) => {
  state.bgMotion = e.target.value;
  if (state.bgMotion === "zoom") {
    dom.stageBgLayer.classList.add("motion-zoom");
  } else {
    dom.stageBgLayer.classList.remove("motion-zoom");
  }
});

/* ------------------------------------------------------------------ */
/*  8. Studio Controls (Resolution, Fonts, Colors, Delay, 3D, FPS)    */
/* ------------------------------------------------------------------ */
// Resolution
dom.selectResolution.addEventListener("change", (e) => {
  state.resolution = e.target.value;
  if (state.resolution === "9:16") {
    state.width = 1080;
    state.height = 1920;
    dom.customResInputs.style.display = "none";
  } else if (state.resolution === "1:1") {
    state.width = 1080;
    state.height = 1080;
    dom.customResInputs.style.display = "none";
  } else if (state.resolution === "4:5") {
    state.width = 1080;
    state.height = 1350;
    dom.customResInputs.style.display = "none";
  } else {
    dom.customResInputs.style.display = "block";
    state.width = parseInt(dom.inputWidth.value, 10) || 1080;
    state.height = parseInt(dom.inputHeight.value, 10) || 1920;
  }
});

dom.inputWidth.addEventListener("input", (e) => {
  state.width = parseInt(e.target.value, 10) || 1080;
});
dom.inputHeight.addEventListener("input", (e) => {
  state.height = parseInt(e.target.value, 10) || 1920;
});

// Typography: Font Family
dom.selectFontFamily.addEventListener("change", (e) => {
  state.fontFamily = e.target.value;
  applyStageTypography();
});

// Typography: Font Weight
dom.selectFontWeight.addEventListener("change", (e) => {
  state.fontWeight = e.target.value;
  applyStageTypography();
});

// Typography: Font Size
dom.sliderFontSize.addEventListener("input", (e) => {
  state.fontSize = parseInt(e.target.value, 10);
  dom.valFontSize.textContent = `${state.fontSize}px`;
  applyStageTypography();
});

// Color Pickers
dom.pickerHighlightColor.addEventListener("input", (e) => {
  state.highlightColor = e.target.value;
  dom.labelHighlightColor.textContent = state.highlightColor.toUpperCase();
  applyStageTypography();
});

dom.pickerTextColor.addEventListener("input", (e) => {
  state.textColor = e.target.value;
  dom.labelTextColor.textContent = state.textColor.toUpperCase();
  applyStageTypography();
});

function applyStageTypography() {
  const weightMap = {
    Regular: "400",
    Medium: "500",
    SemiBold: "600",
    Bold: "700",
    ExtraBold: "800",
    Black: "900",
  };
  const cssWeight = weightMap[state.fontWeight] || "400";

  // Active Center Lyric
  dom.reelLineActive.style.fontFamily = `'${state.fontFamily}', var(--font-shorts)`;
  dom.reelLineActive.style.fontWeight = cssWeight;
  dom.reelTextActive.style.fontSize = `${Math.round(state.fontSize * 0.42)}px`;
  dom.reelTextActive.style.color = state.highlightColor;
  dom.reelTextActive.style.textShadow = `0 2px 10px rgba(0,0,0,0.9), 0 0 16px ${state.highlightColor}66`;

  // Dimmed Context Lyrics
  dom.reelLinePrev.style.fontFamily = `'${state.fontFamily}', var(--font-shorts)`;
  dom.reelTextPrev.style.fontSize = `${Math.round(state.fontSize * 0.31)}px`;
  dom.reelTextPrev.style.color = state.textColor;

  dom.reelLineNext.style.fontFamily = `'${state.fontFamily}', var(--font-shorts)`;
  dom.reelTextNext.style.fontSize = `${Math.round(state.fontSize * 0.31)}px`;
  dom.reelTextNext.style.color = state.textColor;
}

// Lyrics Timing Delay
dom.sliderLyricDelay.addEventListener("input", (e) => {
  state.lyricDelay = parseFloat(e.target.value);
  dom.valLyricDelay.textContent = `${state.lyricDelay >= 0 ? "+" : ""}${state.lyricDelay.toFixed(2)}s`;
  updateStageLyrics(dom.nativeAudio.currentTime * 1000);
});

dom.btnResetDelay.addEventListener("click", () => {
  state.lyricDelay = -0.3;
  dom.sliderLyricDelay.value = -0.3;
  dom.valLyricDelay.textContent = "-0.30s";
  updateStageLyrics(dom.nativeAudio.currentTime * 1000);
  showToast("Lyrics delay reset to default (-0.30s)");
});

// 3D Spatial Audio
dom.chk3dAudio.addEventListener("change", (e) => {
  state.audio3dEnabled = e.target.checked;
  dom.body3dAudio.style.display = state.audio3dEnabled ? "block" : "none";
});

dom.select3dSoundStyle.addEventListener("change", (e) => {
  state.audio3dSoundStyle = e.target.value;
});

// Video FPS
dom.selectFps.addEventListener("change", (e) => {
  state.fps = parseInt(e.target.value, 10);
});

/* ------------------------------------------------------------------ */
/*  9. Render & Export Video Pipeline                                 */
/* ------------------------------------------------------------------ */
async function startVideoRender() {
  if (!state.currentSong || !state.audioUrl) {
    showToast("Please select a song first before rendering!");
    return;
  }

  if (!state.lyrics || !state.lyrics.length) {
    showToast("No lyrics available to render.");
    return;
  }

  // Open Progress Modal
  dom.renderModal.style.display = "flex";
  dom.renderInProgressView.style.display = "block";
  dom.renderSuccessView.style.display = "none";
  dom.renderFailView.style.display = "none";
  dom.renderProgressFill.style.width = "5%";
  dom.renderPercentLabel.textContent = "5%";
  dom.renderStatusTitle.textContent = "Initiating 9:16 Shorts Render Pipeline...";

  const payload = {
    songId: state.currentSong.id,
    audioUrl: state.audioUrl,
    background: state.selectedBackground,
    lyrics: state.lyrics,
    options: {
      aspectRatio: state.resolution === "custom" ? "custom" : state.resolution,
      isShorts: true,
      lyricsLayout: "scroll",
      width: state.width,
      height: state.height,
      trimStart: state.trimStart,
      trimEnd: state.trimEnd,
      fontFamily: state.fontFamily,
      fontWeight: state.fontWeight,
      fontSize: state.fontSize,
      fontColor: state.textColor,
      highlightColor: state.highlightColor,
      bgBlur: state.bgBlur,
      bgDarkness: state.bgDarkness,
      bgMotion: state.bgMotion,
      lyricDelay: state.lyricDelay,
      audio3dEnabled: state.audio3dEnabled,
      audio3dSoundStyle: state.audio3dSoundStyle,
      fps: state.fps,
    },
  };

  try {
    const res = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || "Failed to start render task");
    }

    state.activeJobId = data.jobId;
    pollRenderStatus(data.jobId);
  } catch (err) {
    console.error("Render initiation error:", err);
    dom.renderInProgressView.style.display = "none";
    dom.renderFailView.style.display = "block";
    dom.renderFailMsg.textContent = err.message || "Failed to contact render service.";
  }
}

function pollRenderStatus(jobId) {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/render/status/${jobId}`);
      if (!res.ok) return;
      const job = await res.json();

      dom.renderProgressFill.style.width = `${job.percent}%`;
      dom.renderPercentLabel.textContent = `${job.percent}%`;
      dom.renderStatusTitle.textContent = job.message || "Encoding 9:16 Shorts Video...";

      if (job.status === "completed") {
        clearInterval(state.pollTimer);
        dom.renderInProgressView.style.display = "none";
        dom.renderSuccessView.style.display = "block";

        dom.btnDownloadVideo.href = job.outputUrl;
        dom.renderedVideoPlayer.src = job.outputUrl;
        dom.renderedVideoPlayer.load();

        showToast("9:16 Shorts Video is ready!");
      } else if (job.status === "failed") {
        clearInterval(state.pollTimer);
        dom.renderInProgressView.style.display = "none";
        dom.renderFailView.style.display = "block";
        dom.renderFailMsg.textContent = job.error || "Render pipeline encountered an error.";
      }
    } catch (err) {
      console.error("Status polling error:", err);
    }
  }, 1200);
}

dom.btnExportTop.addEventListener("click", startVideoRender);
dom.btnExportBottom.addEventListener("click", startVideoRender);

dom.btnCloseRenderModal.addEventListener("click", () => {
  dom.renderModal.style.display = "none";
  clearInterval(state.pollTimer);
  dom.renderedVideoPlayer.pause();
});

dom.btnRetryRender.addEventListener("click", () => {
  dom.renderModal.style.display = "none";
  clearInterval(state.pollTimer);
});

/* ------------------------------------------------------------------ */
/*  10. Bootstrapping                                                 */
/* ------------------------------------------------------------------ */
window.addEventListener("DOMContentLoaded", () => {
  loadBackgrounds();
  applyStageTypography();
  initTrimmer(180);

  // Initial JioSaavn search
  searchSongs("Millionaire");
});
