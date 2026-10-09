/**
 * Spark Studio — Client Application
 * Handles JioSaavn search, audio streaming, synchronized lyrics sync,
 * 16:9 canvas live simulation, visual styling, and FFmpeg video generation.
 */

// Application State
const state = {
  currentSong: null,
  audioUrl: null,
  lyrics: [], // [{ timeMs, text }]
  activeLineIndex: -1,
  backgrounds: [],
  selectedBackground: "1.jpg",

  // Visual Studio Settings
  bgDarkness: 0,
  bgBlur: 0,
  bgMotion: "zoom", // "zoom", "static", "pulse"
  fontFamily: "Edo",
  fontSize: 150,
  fontWeight: "400",
  textColor: "#FFFFFF",
  outlineColor: "#000000",
  outlineWidth: 0,
  shadowDepth: 3,
  shadowBlur: 21,
  shadowSpread: 0,
  shadowColor: "#000000",
  animation: "fade", // "fade", "bubbles", "sparkles", "snow", "rain", "pop", etc.
  linesMode: "single", // "single", "duo"
  lyricDelay: -0.3, // Delay in lyrics playing (-3.0 to 3.0s, default -0.3)
  fps: 60,

  // 3D Audio & Visualizer
  audio3dEnabled: false,
  audio3dSoundStyle: "orbit", // "orbit", "wide", "concert", "slow", "cyber"
  audio3dSpeed: 1.0, // 0.3 - 2.5
  audio3dVisualizer: "bars", // "bars", "wave", "mirror", "circle", "dots"
  audio3dIntensity: 1.5,
  audio3dColor: "cyan", // "cyan", "purple", "fire", "rainbow", "white"
  audio3dSmooth: 0.75,

  // Rendering
  activeJobId: null,
  pollTimer: null,
};

// DOM Elements Cache
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

  // Lyrics Timeline
  lyricsTimeline: document.getElementById("lyricsTimeline"),
  lyricsCountBadge: document.getElementById("lyricsCountBadge"),
  btnAddLine: document.getElementById("btnAddLine"),
  btnToggleLrcRaw: document.getElementById("btnToggleLrcRaw"),
  rawLrcContainer: document.getElementById("rawLrcContainer"),
  rawLrcText: document.getElementById("rawLrcText"),
  btnApplyRawLrc: document.getElementById("btnApplyRawLrc"),

  // 16:9 Stage
  stageCanvas: document.getElementById("stageCanvas"),
  stageBgLayer: document.getElementById("stageBgLayer"),
  stageDarkOverlay: document.getElementById("stageDarkOverlay"),
  stageParticlesLayer: document.getElementById("stageParticlesLayer"),
  stageLyricActive: document.getElementById("stageLyricActive"),
  stageLyricText: document.getElementById("stageLyricText"),
  stageLyricUpcoming: document.getElementById("stageLyricUpcoming"),
  stageLyricUpcomingText: document.getElementById("stageLyricUpcomingText"),
  stagePlayOverlay: document.getElementById("stagePlayOverlay"),
  btnToggleFullPreview: document.getElementById("btnToggleFullPreview"),
  btnExitFullscreen: document.getElementById("btnExitFullscreen"),

  // Audio Player
  nativeAudio: document.getElementById("nativeAudio"),
  btnPlayPause: document.getElementById("btnPlayPause"),
  playIcon: document.getElementById("playIcon"),
  currentTimecode: document.getElementById("currentTimecode"),
  totalDurationTimecode: document.getElementById("totalDurationTimecode"),
  progressBarContainer: document.getElementById("progressBarContainer"),
  progressBarFill: document.getElementById("progressBarFill"),
  volumeSlider: document.getElementById("volumeSlider"),

  // Visual Controls
  bgGalleryGrid: document.getElementById("bgGalleryGrid"),
  bgUploadInput: document.getElementById("bgUploadInput"),
  sliderBgDarkness: document.getElementById("sliderBgDarkness"),
  valBgDarkness: document.getElementById("valBgDarkness"),
  sliderBgBlur: document.getElementById("sliderBgBlur"),
  valBgBlur: document.getElementById("valBgBlur"),
  motionPills: document.getElementById("motionPills"),
  fontCategoryPills: document.getElementById("fontCategoryPills"),
  selectFontFamily: document.getElementById("selectFontFamily"),
  sliderFontSize: document.getElementById("sliderFontSize"),
  valFontSize: document.getElementById("valFontSize"),
  selectFontWeight: document.getElementById("selectFontWeight"),
  valFontWeight: document.getElementById("valFontWeight"),
  pickerTextColor: document.getElementById("pickerTextColor"),
  labelTextColor: document.getElementById("labelTextColor"),
  pickerOutlineColor: document.getElementById("pickerOutlineColor"),
  labelOutlineColor: document.getElementById("labelOutlineColor"),
  sliderOutlineWidth: document.getElementById("sliderOutlineWidth"),
  valOutlineWidth: document.getElementById("valOutlineWidth"),
  sliderShadowDepth: document.getElementById("sliderShadowDepth"),
  valShadowDepth: document.getElementById("valShadowDepth"),
  btnResetShadowDepth: document.getElementById("btnResetShadowDepth"),
  sliderShadowBlur: document.getElementById("sliderShadowBlur"),
  valShadowBlur: document.getElementById("valShadowBlur"),
  btnResetShadowBlur: document.getElementById("btnResetShadowBlur"),
  sliderShadowSpread: document.getElementById("sliderShadowSpread"),
  valShadowSpread: document.getElementById("valShadowSpread"),
  btnResetShadowSpread: document.getElementById("btnResetShadowSpread"),
  sliderLyricDelay: document.getElementById("sliderLyricDelay"),
  valLyricDelay: document.getElementById("valLyricDelay"),
  btnResetDelay: document.getElementById("btnResetDelay"),
  animPills: document.getElementById("animPills"),
  animHint: document.getElementById("animHint"),
  linesModePills: document.getElementById("linesModePills"),
  fpsPills: document.getElementById("fpsPills"),

  // 3D Audio Controls
  toggle3DAudio: document.getElementById("toggle3DAudio"),
  audio3dOptions: document.getElementById("audio3dOptions"),
  audio3dSoundPills: document.getElementById("audio3dSoundPills"),
  audio3dHint: document.getElementById("audio3dHint"),
  slider3DSpeed: document.getElementById("slider3DSpeed"),
  val3DSpeed: document.getElementById("val3DSpeed"),
  audio3dStylePills: document.getElementById("audio3dStylePills"),
  slider3DIntensity: document.getElementById("slider3DIntensity"),
  val3DIntensity: document.getElementById("val3DIntensity"),
  audio3dColorPills: document.getElementById("audio3dColorPills"),
  slider3DSmooth: document.getElementById("slider3DSmooth"),
  val3DSmooth: document.getElementById("val3DSmooth"),
  stageAudio3dWrap: document.getElementById("stageAudio3dWrap"),
  stageAudio3dCanvas: document.getElementById("stageAudio3dCanvas"),

  // Header and Render Actions
  btnQuickDemo: document.getElementById("btnQuickDemo"),
  btnGenerateVideoTop: document.getElementById("btnGenerateVideoTop"),
  btnGenerateVideoMain: document.getElementById("btnGenerateVideoMain"),

  // Modal
  renderModal: document.getElementById("renderModal"),
  btnCloseModal: document.getElementById("btnCloseModal"),
  renderInProgressView: document.getElementById("renderInProgressView"),
  renderSuccessView: document.getElementById("renderSuccessView"),
  renderFailView: document.getElementById("renderFailView"),
  renderStatusTitle: document.getElementById("renderStatusTitle"),
  renderStatusSub: document.getElementById("renderStatusSub"),
  renderProgressFill: document.getElementById("renderProgressFill"),
  renderPercentLabel: document.getElementById("renderPercentLabel"),
  renderedVideoPlayer: document.getElementById("renderedVideoPlayer"),
  btnDownloadVideo: document.getElementById("btnDownloadVideo"),
  btnDismissSuccess: document.getElementById("btnDismissSuccess"),
  renderFailMsg: document.getElementById("renderFailMsg"),
  btnRetryRender: document.getElementById("btnRetryRender"),

  toast: document.getElementById("toast"),
};

/* ------------------------------------------------------------------ */
/*  Notification Toast                                                */
/* ------------------------------------------------------------------ */
function showToast(message, duration = 3000) {
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  clearTimeout(dom.toast._t);
  dom.toast._t = setTimeout(() => {
    dom.toast.classList.remove("show");
  }, duration);
}

/* ------------------------------------------------------------------ */
/*  Tab Switching                                                      */
/* ------------------------------------------------------------------ */
dom.tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-tab");
    dom.tabButtons.forEach((b) => b.classList.remove("active"));
    dom.tabContents.forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    const content = document.getElementById(target);
    if (content) content.classList.add("active");
  });
});

/* ------------------------------------------------------------------ */
/*  Format Utilities                                                  */
/* ------------------------------------------------------------------ */
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatLrcTimestamp(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}]`;
}

/* ------------------------------------------------------------------ */
/*  1. JioSaavn Song Search & Selection                                */
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

    dom.resultsCount.textContent = `Found ${data.total} results:`;
    dom.searchResultsList.innerHTML = "";

    data.items.forEach((item) => {
      const el = document.createElement("div");
      el.className = "song-item";
      el.dataset.id = item.id;

      const artistText = (item.artists?.primary || []).map((a) => a.name).join(", ") || item.subtitle || "Various Artists";
      const durationStr = formatTime(item.duration);

      el.innerHTML = `
        <img class="song-item-art" src="${item.image || ''}" onerror="this.src='https://via.placeholder.com/64?text=Music'" alt="art">
        <div class="song-item-info">
          <div class="song-item-title">${escapeHtml(item.title)}</div>
          <div class="song-item-sub">${escapeHtml(artistText)} &bull; ${durationStr}</div>
        </div>
        <div class="song-item-action">
          <i class="fa-solid fa-cloud-arrow-down"></i>
        </div>
      `;

      el.addEventListener("click", () => loadSong(item.id, item));
      dom.searchResultsList.appendChild(el);
    });
  } catch (err) {
    dom.searchResultsList.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>Error searching songs. Check server connection.</p>
      </div>
    `;
  }
}

async function loadSong(songId, cachedMeta = null) {
  showToast("Fetching audio stream & synced lyrics...");

  // Update active song card with preliminary info
  if (cachedMeta) {
    dom.activeSongCard.style.display = "flex";
    dom.activeSongArt.src = cachedMeta.image;
    dom.activeSongTitle.textContent = cachedMeta.title;
    dom.activeSongArtist.textContent = (cachedMeta.artists?.primary || []).map(a => a.name).join(", ") || cachedMeta.subtitle || "";
    dom.activeSongDuration.textContent = formatTime(cachedMeta.duration);
  }

  try {
    // 1. Fetch Audio Details (DES-decrypted stream)
    const songRes = await fetch(`/api/song/${encodeURIComponent(songId)}`);
    const songData = await songRes.json();

    if (songData.error || !songData.streamUrl) {
      showToast(`Error: ${songData.error || "No audio stream available"}`);
      return;
    }

    state.currentSong = songData;
    state.audioUrl = songData.proxyUrl || songData.streamUrl;

    // Set Audio Player Source
    dom.nativeAudio.src = state.audioUrl;
    dom.nativeAudio.load();

    // 2. Fetch Synced Lyrics (JioSaavn + LRCLIB fallback)
    const lyricsRes = await fetch(`/api/lyrics/${encodeURIComponent(songId)}/synced`);
    const lyricsData = await lyricsRes.json();

    let loadedLines = [];
    if (lyricsData.lines && lyricsData.lines.length) {
      loadedLines = lyricsData.lines;
      dom.activeLyricsSource.innerHTML = `<i class="fa-solid fa-check"></i> Synced (${lyricsData.source.toUpperCase()})`;
    } else if (lyricsData.lyrics) {
      // If plain lyrics without timestamps, generate estimated spacing based on duration
      loadedLines = generateEstimatedTimestamps(lyricsData.lyrics, songData.duration || 180);
      dom.activeLyricsSource.innerHTML = `<i class="fa-solid fa-align-left"></i> Plain text`;
    } else {
      loadedLines = [
        { timeMs: 0, text: `♪ ${songData.title} ♪` },
        { timeMs: 4000, text: (songData.artists?.primary || []).map(a => a.name).join(", ") },
      ];
      dom.activeLyricsSource.innerHTML = `<i class="fa-solid fa-music"></i> Instrumental`;
    }

    setLyrics(loadedLines, lyricsData.lrc || "");

    // Update UI highlights
    document.querySelectorAll(".song-item").forEach((el) => {
      el.classList.toggle("selected", el.dataset.id === songId);
    });

    showToast(`Loaded "${songData.title}" with ${loadedLines.length} lyric lines!`);

    // Switch to lyrics tab
    document.querySelector('[data-tab="tabLyrics"]').click();

    // Auto-play preview
    dom.nativeAudio.play().catch(() => { });
  } catch (err) {
    console.error("Load song error:", err);
    showToast("Failed to load song audio & lyrics");
  }
}

function generateEstimatedTimestamps(plainLyrics, durationSec) {
  const rawLines = plainLyrics
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("[") && !l.startsWith("Chorus") && !l.startsWith("Verse"));

  if (!rawLines.length) return [];
  const intervalMs = Math.floor(((durationSec - 10) * 1000) / rawLines.length);

  return rawLines.map((text, i) => ({
    timeMs: 8000 + i * intervalMs,
    text,
  }));
}

/* ------------------------------------------------------------------ */
/*  2. Synced Lyrics Timeline & Editor                                */
/* ------------------------------------------------------------------ */
function setLyrics(lines, rawLrcString = "") {
  state.lyrics = lines;
  dom.lyricsCountBadge.textContent = lines.length;

  // Build Raw LRC string if not provided
  if (!rawLrcString) {
    rawLrcString = lines.map((l) => `${formatLrcTimestamp(l.timeMs)} ${l.text}`).join("\n");
  }
  dom.rawLrcText.value = rawLrcString;

  renderLyricsTimeline();
  updateStageLyrics(0);
}

function renderLyricsTimeline() {
  if (!state.lyrics.length) {
    dom.lyricsTimeline.innerHTML = `
      <div class="empty-lyrics">
        <i class="fa-regular fa-comment-dots"></i>
        <p>No lyric lines. Click "+ Add Line" or paste LRC text.</p>
      </div>
    `;
    return;
  }

  dom.lyricsTimeline.innerHTML = "";

  state.lyrics.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = "timeline-line";
    row.dataset.index = index;

    const timeStr = formatTime(line.timeMs / 1000);

    row.innerHTML = `
      <span class="timeline-time">${timeStr}</span>
      <input type="text" class="timeline-text" value="${escapeHtml(line.text)}">
      <div class="timeline-actions">
        <button class="btn-del-line" title="Delete Line"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    `;

    // Click line to jump audio
    row.addEventListener("click", (e) => {
      if (e.target.closest(".timeline-actions") || e.target.classList.contains("timeline-text")) return;
      seekAudio(line.timeMs / 1000);
    });

    // Edit text live
    const textInput = row.querySelector(".timeline-text");
    textInput.addEventListener("input", (e) => {
      state.lyrics[index].text = e.target.value;
      updateStageLyrics(dom.nativeAudio.currentTime * 1000);
    });

    // Delete line
    const delBtn = row.querySelector(".btn-del-line");
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.lyrics.splice(index, 1);
      setLyrics(state.lyrics);
    });

    dom.lyricsTimeline.appendChild(row);
  });
}

function addLyricLine() {
  const curTimeMs = Math.floor(dom.nativeAudio.currentTime * 1000);
  const newLine = { timeMs: curTimeMs, text: "New lyric line" };
  state.lyrics.push(newLine);
  state.lyrics.sort((a, b) => a.timeMs - b.timeMs);
  setLyrics(state.lyrics);
}

/* ------------------------------------------------------------------ */
/*  3. Live 16:9 Canvas Synchronization & Typography Simulation       */
/* ------------------------------------------------------------------ */
function updateStageLyrics(currentMs) {
  if (!state.lyrics || !state.lyrics.length) {
    dom.stageLyricText.textContent = state.currentSong
      ? state.currentSong.title
      : "Select a song to start";
    dom.stageLyricUpcoming.style.display = "none";
    return;
  }

  // Apply user-configured delay offset (-3.0s to +3.0s)
  const targetMs = currentMs - (state.lyricDelay * 1000);

  // Find the active line (latest line whose timeMs <= targetMs)
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

    // Highlight timeline row without auto-scrolling
    document.querySelectorAll(".timeline-line").forEach((el, idx) => {
      const isActive = idx === activeIdx;
      el.classList.toggle("active", isActive);
    });

    // Trigger in-going Spark animation on the active line
    if (activeIdx >= 0) {
      const activeLine = state.lyrics[activeIdx];
      dom.stageLyricText.textContent = activeLine.text || "♪";

      // Apply chosen animation class
      dom.stageLyricActive.className = "stage-lyric-active";
      void dom.stageLyricActive.offsetWidth; // Force CSS reflow to retrigger animation
      dom.stageLyricActive.classList.add(`lyric-anim-${state.animation}`);

      // Handle Duo Line (upcoming line)
      if (state.linesMode === "duo" && activeIdx + 1 < state.lyrics.length) {
        const nextLine = state.lyrics[activeIdx + 1];
        dom.stageLyricUpcoming.style.display = "block";
        dom.stageLyricUpcomingText.textContent = nextLine.text || "";
      } else {
        dom.stageLyricUpcoming.style.display = "none";
      }
    } else {
      dom.stageLyricText.textContent = "♪";
      dom.stageLyricUpcoming.style.display = "none";
    }
  }
}

/* ------------------------------------------------------------------ */
/*  4. Audio Player Controller                                        */
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

function seekAudio(seconds) {
  if (dom.nativeAudio.duration) {
    dom.nativeAudio.currentTime = Math.max(0, Math.min(dom.nativeAudio.duration, seconds));
  }
}

dom.btnPlayPause.addEventListener("click", togglePlayPause);
dom.stagePlayOverlay.addEventListener("click", togglePlayPause);

dom.nativeAudio.addEventListener("play", () => {
  dom.playIcon.className = "fa-solid fa-pause";
  dom.stagePlayOverlay.style.display = "none";
  initAudioEngine();
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  if (state.audio3dEnabled) {
    startAudio3dLoop();
  }
});

dom.nativeAudio.addEventListener("pause", () => {
  dom.playIcon.className = "fa-solid fa-play";
  dom.stagePlayOverlay.style.display = "flex";
});

dom.nativeAudio.addEventListener("timeupdate", () => {
  const cur = dom.nativeAudio.currentTime;
  const dur = dom.nativeAudio.duration || 1;
  const pct = (cur / dur) * 100;

  dom.currentTimecode.textContent = formatTime(cur);
  dom.progressBarFill.style.width = `${pct}%`;

  updateStageLyrics(cur * 1000);
});

dom.nativeAudio.addEventListener("loadedmetadata", () => {
  dom.totalDurationTimecode.textContent = formatTime(dom.nativeAudio.duration);
});

dom.progressBarContainer.addEventListener("click", (e) => {
  const rect = dom.progressBarContainer.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = clickX / rect.width;
  if (dom.nativeAudio.duration) {
    seekAudio(pct * dom.nativeAudio.duration);
  }
});

dom.volumeSlider.addEventListener("input", (e) => {
  dom.nativeAudio.volume = Number(e.target.value);
});

/* ------------------------------------------------------------------ */
/*  5. Background Management & Gallery                                */
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
  dom.bgGalleryGrid.innerHTML = "";

  state.backgrounds.forEach((bg) => {
    const thumb = document.createElement("div");
    thumb.className = `bg-thumb-item ${bg.filename === state.selectedBackground ? "active" : ""}`;
    thumb.innerHTML = `<img src="${bg.url}" alt="${bg.filename}" loading="lazy">`;

    thumb.addEventListener("click", () => {
      selectBackground(bg.filename);
    });

    dom.bgGalleryGrid.appendChild(thumb);
  });
}

function selectBackground(filename) {
  state.selectedBackground = filename;
  const bgObj = state.backgrounds.find((b) => b.filename === filename);
  const url = bgObj ? bgObj.url : `/assets/background/${encodeURIComponent(filename)}`;

  // Apply to stage canvas background layer (fill whole screen)
  dom.stageBgLayer.style.backgroundImage = `url("${url}")`;

  // Update active border on thumbnail
  document.querySelectorAll(".bg-thumb-item").forEach((el) => {
    const img = el.querySelector("img");
    const isActive = img && img.getAttribute("src").includes(filename);
    el.classList.toggle("active", isActive);
  });
}

// Custom background file upload handler
dom.bgUploadInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      showToast("Uploading custom background...");
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
      showToast("Upload failed");
    }
  };
  reader.readAsDataURL(file);
});

/* ------------------------------------------------------------------ */
/*  6. Visual Styling Controls Real-Time Sync                         */
/* ------------------------------------------------------------------ */
function applyVisualStyles() {
  // 1. Darkness Overlay (Opacity)
  dom.stageDarkOverlay.style.opacity = state.bgDarkness;

  // 2. Background Blur
  dom.stageBgLayer.style.filter = state.bgBlur > 0 ? `blur(${state.bgBlur}px)` : "none";

  // 3. Background Motion
  dom.stageBgLayer.classList.remove("motion-zoom", "motion-pulse");
  if (state.bgMotion === "zoom") dom.stageBgLayer.classList.add("motion-zoom");
  if (state.bgMotion === "pulse") dom.stageBgLayer.classList.add("motion-pulse");

  // 4. Typography (Font Family, Weight, Color, Stroke, Shadow)
  dom.stageLyricText.style.fontFamily = `'${state.fontFamily}', sans-serif`;
  dom.stageLyricText.style.fontWeight = state.fontWeight;
  dom.stageLyricText.style.color = state.textColor;

  const effectiveStrokeWidth = state.shadowSpread > 0 ? state.shadowSpread : state.outlineWidth;
  const effectiveStrokeColor = state.shadowSpread > 0 && state.outlineWidth === 0 ? "rgba(0,0,0,0.85)" : state.outlineColor;
  dom.stageLyricText.style.webkitTextStroke = effectiveStrokeWidth > 0
    ? `${effectiveStrokeWidth}px ${effectiveStrokeColor}`
    : "0px transparent";

  // Proportional font-size on canvas
  const canvasWidth = (document.fullscreenElement || document.webkitFullscreenElement)
    ? window.innerWidth
    : (dom.stageCanvas.offsetWidth || 800);
  const scaledSize = Math.round((state.fontSize / 1920) * canvasWidth);
  dom.stageLyricText.style.fontSize = `${scaledSize}px`;

  // Shadow & Glow (Depth + Blur/Softness)
  if (state.shadowDepth > 0 || state.shadowBlur > 0) {
    dom.stageLyricText.style.textShadow = `0 ${state.shadowDepth}px ${state.shadowBlur}px rgba(0,0,0,0.9)`;
  } else {
    dom.stageLyricText.style.textShadow = "none";
  }

  // Duo Line font size & stroke
  dom.stageLyricUpcomingText.style.fontFamily = `'${state.fontFamily}', sans-serif`;
  dom.stageLyricUpcomingText.style.fontSize = `${Math.round(scaledSize * 0.65)}px`;
  dom.stageLyricUpcomingText.style.webkitTextStroke = effectiveStrokeWidth > 1
    ? `${effectiveStrokeWidth - 1}px ${effectiveStrokeColor}`
    : "0px transparent";
  if (state.shadowDepth > 0 || state.shadowBlur > 0) {
    dom.stageLyricUpcomingText.style.textShadow = `0 ${Math.round(state.shadowDepth * 0.7)}px ${Math.round(state.shadowBlur * 0.7)}px rgba(0,0,0,0.7)`;
  } else {
    dom.stageLyricUpcomingText.style.textShadow = "none";
  }
}

// Background Darkness Slider
dom.sliderBgDarkness.addEventListener("input", (e) => {
  const val = Number(e.target.value);
  state.bgDarkness = val / 100;
  dom.valBgDarkness.textContent = `${val}%`;
  applyVisualStyles();
});

// Background Blur Slider
dom.sliderBgBlur.addEventListener("input", (e) => {
  const val = Number(e.target.value);
  state.bgBlur = val;
  dom.valBgBlur.textContent = `${val}px`;
  applyVisualStyles();
});

// Motion Pills
dom.motionPills.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill) return;
  dom.motionPills.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
  pill.classList.add("active");
  state.bgMotion = pill.getAttribute("data-motion");
  applyVisualStyles();
});

// Font Category Filtering
if (dom.fontCategoryPills) {
  dom.fontCategoryPills.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    dom.fontCategoryPills.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    const cat = pill.getAttribute("data-cat");

    const optgroups = dom.selectFontFamily.querySelectorAll("optgroup");
    let firstMatch = null;

    optgroups.forEach((og) => {
      const groupCat = og.getAttribute("data-group");
      const match = cat === "all" || groupCat === cat;
      og.style.display = match ? "" : "none";
      og.disabled = !match;
      og.hidden = !match;
      if (match && !firstMatch) firstMatch = og.querySelector("option");
    });

    if (firstMatch && cat !== "all") {
      dom.selectFontFamily.value = firstMatch.value;
      state.fontFamily = firstMatch.value;
      applyVisualStyles();
      showToast(`Selected ${firstMatch.value}`);
    }
  });
}

// Font Family Select
dom.selectFontFamily.addEventListener("change", (e) => {
  state.fontFamily = e.target.value;
  applyVisualStyles();
});

/* ------------------------------------------------------------------ */
/*  Fullscreen Controller                                              */
/* ------------------------------------------------------------------ */
function isFullscreenActive() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

async function enterFullscreen() {
  try {
    const el = dom.stageCanvas;
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
    } else if (el.msRequestFullscreen) {
      await el.msRequestFullscreen();
    }
  } catch (err) {
    console.warn("Native fullscreen request denied, using CSS fullscreen:", err);
    dom.stageCanvas.classList.toggle("is-fullscreen");
    applyVisualStyles();
  }
}

async function exitFullscreen() {
  try {
    if (isFullscreenActive()) {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      }
    } else {
      dom.stageCanvas.classList.remove("is-fullscreen");
      applyVisualStyles();
    }
  } catch (err) {
    console.warn("Exit fullscreen error:", err);
    dom.stageCanvas.classList.remove("is-fullscreen");
    applyVisualStyles();
  }
}

function toggleFullscreen() {
  if (isFullscreenActive() || dom.stageCanvas.classList.contains("is-fullscreen")) {
    exitFullscreen();
  } else {
    enterFullscreen();
  }
}

function handleFullscreenChange() {
  const active = isFullscreenActive();
  dom.stageCanvas.classList.toggle("is-fullscreen", active);

  if (dom.btnToggleFullPreview) {
    const icon = dom.btnToggleFullPreview.querySelector("i");
    if (icon) {
      icon.className = active ? "fa-solid fa-compress" : "fa-solid fa-expand";
    }
    dom.btnToggleFullPreview.title = active ? "Exit Fullscreen" : "Fullscreen Preview";
  }

  // Trigger rescale after transition
  setTimeout(applyVisualStyles, 100);
}

document.addEventListener("fullscreenchange", handleFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

if (dom.btnToggleFullPreview) {
  dom.btnToggleFullPreview.addEventListener("click", toggleFullscreen);
}
if (dom.btnExitFullscreen) {
  dom.btnExitFullscreen.addEventListener("click", exitFullscreen);
}
if (dom.stageCanvas) {
  dom.stageCanvas.addEventListener("dblclick", (e) => {
    if (!e.target.closest("#stagePlayOverlay") && !e.target.closest("#btnExitFullscreen")) {
      toggleFullscreen();
    }
  });
}

// Keyboard Shortcuts (F = fullscreen, Space = play/pause)
window.addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  if (e.key === " " || e.key === "Spacebar") {
    e.preventDefault();
    togglePlayPause();
  } else if (e.key === "f" || e.key === "F") {
    e.preventDefault();
    toggleFullscreen();
  } else if (e.key === "Escape" && dom.stageCanvas.classList.contains("is-fullscreen")) {
    exitFullscreen();
  }
});

// Window resize listener to keep typography proportional
window.addEventListener("resize", () => {
  applyVisualStyles();
});

// Font Size Slider (150px to 170px)
dom.sliderFontSize.addEventListener("input", (e) => {
  state.fontSize = Math.min(170, Math.max(150, Number(e.target.value) || 150));
  dom.valFontSize.textContent = `${state.fontSize}px`;
  applyVisualStyles();
});

// Font Weight Select
dom.selectFontWeight.addEventListener("change", (e) => {
  state.fontWeight = e.target.value;
  dom.valFontWeight.textContent = `${state.fontWeight}`;
  applyVisualStyles();
});

// Color Pickers
dom.pickerTextColor.addEventListener("input", (e) => {
  state.textColor = e.target.value;
  dom.labelTextColor.textContent = state.textColor.toUpperCase();
  applyVisualStyles();
});

dom.pickerOutlineColor.addEventListener("input", (e) => {
  state.outlineColor = e.target.value;
  dom.labelOutlineColor.textContent = state.outlineColor.toUpperCase();
  applyVisualStyles();
});

// Outline Stroke Width Slider (default 0)
dom.sliderOutlineWidth.addEventListener("input", (e) => {
  state.outlineWidth = Number(e.target.value);
  dom.valOutlineWidth.textContent = `${state.outlineWidth}px`;
  applyVisualStyles();
});

// Shadow Depth Slider
if (dom.sliderShadowDepth) {
  dom.sliderShadowDepth.addEventListener("input", (e) => {
    state.shadowDepth = Number(e.target.value);
    if (dom.valShadowDepth) dom.valShadowDepth.textContent = `${state.shadowDepth}px`;
    applyVisualStyles();
  });
}
if (dom.btnResetShadowDepth) {
  dom.btnResetShadowDepth.addEventListener("click", () => {
    state.shadowDepth = 3;
    if (dom.sliderShadowDepth) dom.sliderShadowDepth.value = "3";
    if (dom.valShadowDepth) dom.valShadowDepth.textContent = "3px";
    applyVisualStyles();
    showToast("Shadow depth reset to 3px");
  });
}

// Shadow Blur Slider
if (dom.sliderShadowBlur) {
  dom.sliderShadowBlur.addEventListener("input", (e) => {
    state.shadowBlur = Number(e.target.value);
    if (dom.valShadowBlur) dom.valShadowBlur.textContent = `${state.shadowBlur}px`;
    applyVisualStyles();
  });
}
if (dom.btnResetShadowBlur) {
  dom.btnResetShadowBlur.addEventListener("click", () => {
    state.shadowBlur = 21;
    if (dom.sliderShadowBlur) dom.sliderShadowBlur.value = "21";
    if (dom.valShadowBlur) dom.valShadowBlur.textContent = "21px";
    applyVisualStyles();
    showToast("Shadow blur reset to 21px");
  });
}

// Shadow Spread Slider
if (dom.sliderShadowSpread) {
  dom.sliderShadowSpread.addEventListener("input", (e) => {
    state.shadowSpread = Number(e.target.value);
    if (dom.valShadowSpread) dom.valShadowSpread.textContent = `${state.shadowSpread}px`;
    applyVisualStyles();
  });
}
if (dom.btnResetShadowSpread) {
  dom.btnResetShadowSpread.addEventListener("click", () => {
    state.shadowSpread = 0;
    if (dom.sliderShadowSpread) dom.sliderShadowSpread.value = "0";
    if (dom.valShadowSpread) dom.valShadowSpread.textContent = "0px";
    applyVisualStyles();
    showToast("Shadow spread reset to 0px");
  });
}

// Lyric Sync Delay Slider (-3.0s to +3.0s)
if (dom.sliderLyricDelay) {
  dom.sliderLyricDelay.addEventListener("input", (e) => {
    state.lyricDelay = parseFloat(e.target.value);
    const sign = state.lyricDelay > 0 ? "+" : "";
    dom.valLyricDelay.textContent = `${sign}${state.lyricDelay.toFixed(1)}s`;
    updateStageLyrics(dom.nativeAudio.currentTime * 1000);
  });
}

if (dom.btnResetDelay) {
  dom.btnResetDelay.addEventListener("click", () => {
    state.lyricDelay = -0.3;
    dom.sliderLyricDelay.value = "-0.3";
    dom.valLyricDelay.textContent = "-0.3s";
    updateStageLyrics(dom.nativeAudio.currentTime * 1000);
    showToast("Lyric delay reset to -0.3s");
  });
}

// Animation Descriptions
const animDescriptions = {
  fade: "Crossfade: Cinematic smooth opacity crossfade (Default)",
  bubbles: "Bubbles: Transparent floating bubbles gently drifting with smooth lyric fade",
  sparkles: "Sparkles: Radiant ambient sparkles shining around glowing lyrics",
  snow: "Snow: Soft ambient snowfall drifting gracefully",
  rain: "Rain: Gentle transparent raindrops falling smoothly",
  pop: "Pop: Smoothly scales from 92% with subtle fade",
  slide: "Slide Up: Rises gracefully into the active position",
  bounce: "Bounce: Energetic elastic overshoot and settle",
  zoom: "Zoom In: Dynamic punch scaling in from 130%",
  glitch: "Glitch: Cyberpunk digital jitter and skew flickers",
  typewriter: "Typewriter: Fast character clip progression",
  blur: "Blur In: Snaps into sharp optical focus",
  glow: "Rise Glow: Radiant neon aura expansion",
  flip: "Flip In: 3D perspective fold-down rotation",
  swing: "Swing: Pendulum oscillation that gently settles",
};

// Ambient Falling Particle Generator (Bubbles, Sparkles, Snow, Rain)
function updateAmbientParticles() {
  if (!dom.stageParticlesLayer) return;
  dom.stageParticlesLayer.innerHTML = "";
  const anim = state.animation;
  if (!["bubbles", "sparkles", "snow", "rain"].includes(anim)) return;

  const count = anim === "bubbles" ? 22 : anim === "sparkles" ? 26 : anim === "snow" ? 35 : 45;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    const left = Math.random() * 96 + 2;
    const dur = anim === "bubbles" ? (4 + Math.random() * 5)
              : anim === "sparkles" ? (3 + Math.random() * 4)
              : anim === "snow" ? (4.5 + Math.random() * 6)
              : (0.7 + Math.random() * 0.8);
    const delay = Math.random() * dur;

    if (anim === "bubbles") {
      el.className = "ambient-particle-bubble";
      const size = Math.floor(10 + Math.random() * 26);
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
    } else if (anim === "sparkles") {
      el.className = "ambient-particle-sparkle";
      const size = Math.floor(8 + Math.random() * 12);
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
    } else if (anim === "snow") {
      el.className = "ambient-particle-snow";
      const size = Math.floor(4 + Math.random() * 9);
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
    } else if (anim === "rain") {
      el.className = "ambient-particle-rain";
      const h = Math.floor(14 + Math.random() * 18);
      el.style.height = `${h}px`;
    }

    el.style.left = `${left}%`;
    el.style.animationDuration = `${dur}s`;
    el.style.animationDelay = `-${delay}s`;
    frag.appendChild(el);
  }

  dom.stageParticlesLayer.appendChild(frag);
}

// 3D Audio Sound Descriptions
const sound3dHints = {
  orbit: "8D Orbit: Rotates 360° continuously around your head",
  wide: "Wide 360: Psychoacoustic expansion with wide stereo field",
  concert: "Concert Hall: Live arena acoustics & spatial reverb depth",
  slow: "Slow Flow: Hypnotic, deep-panning cinematic sweep",
  cyber: "Cyber Bass: Pulsating spatial orbit with sub-bass resonance",
};

// Animation Preset Pills
dom.animPills.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill) return;
  dom.animPills.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
  pill.classList.add("active");
  state.animation = pill.getAttribute("data-anim");
  if (dom.animHint && animDescriptions[state.animation]) {
    dom.animHint.textContent = animDescriptions[state.animation];
  }
  // Trigger preview animation on active line
  dom.stageLyricActive.className = "stage-lyric-active";
  void dom.stageLyricActive.offsetWidth;
  dom.stageLyricActive.classList.add(`lyric-anim-${state.animation}`);
  updateAmbientParticles();
});

// Lines Mode Pills (Single vs Duo)
dom.linesModePills.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill) return;
  dom.linesModePills.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
  pill.classList.add("active");
  state.linesMode = pill.getAttribute("data-lines");
  updateStageLyrics(dom.nativeAudio.currentTime * 1000);
});

// FPS Pills
dom.fpsPills.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill) return;
  dom.fpsPills.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
  pill.classList.add("active");
  state.fps = Number(pill.getAttribute("data-fps"));
});

/* ------------------------------------------------------------------ */
/*  6b. 3D Spatial Audio & Canvas Visualizer Engine                  */
/* ------------------------------------------------------------------ */
let audioCtx = null;
let audioSourceNode = null;
let pannerNode = null;
let biquadFilter = null;
let analyserNode = null;
let delayNode = null;
let feedbackGain = null;
let dryGain = null;
let wetGain = null;
let animFrameId = null;
let orbitAngle = 0;
let visualizerRunning = false;

function initAudioEngine() {
  if (audioCtx) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioCtx = new AudioContextClass();

    audioSourceNode = audioCtx.createMediaElementSource(dom.nativeAudio);

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 128;
    analyserNode.smoothingTimeConstant = state.audio3dSmooth;

    if (audioCtx.createStereoPanner) {
      pannerNode = audioCtx.createStereoPanner();
    }

    biquadFilter = audioCtx.createBiquadFilter();
    biquadFilter.type = "lowpass";
    biquadFilter.frequency.value = 22000;

    // Spatial echo/reverb branch for Concert Hall & 3D Depth
    delayNode = audioCtx.createDelay();
    delayNode.delayTime.value = 0.085;
    feedbackGain = audioCtx.createGain();
    feedbackGain.gain.value = 0.35;
    wetGain = audioCtx.createGain();
    wetGain.gain.value = 0.0;
    dryGain = audioCtx.createGain();
    dryGain.gain.value = 1.0;

    // Connect Reverb loop
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);
    delayNode.connect(wetGain);

    audioSourceNode.connect(dryGain);
    audioSourceNode.connect(delayNode);

    if (pannerNode) {
      dryGain.connect(pannerNode);
      wetGain.connect(pannerNode);
      pannerNode.connect(biquadFilter);
    } else {
      dryGain.connect(biquadFilter);
      wetGain.connect(biquadFilter);
    }

    biquadFilter.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
  } catch (err) {
    console.warn("AudioContext setup notice:", err);
  }
}

function updateAudio3dRouting() {
  if (!state.audio3dEnabled) {
    if (pannerNode) pannerNode.pan.value = 0;
    if (biquadFilter) biquadFilter.frequency.value = 22000;
    if (wetGain) wetGain.gain.value = 0;
    if (dom.stageAudio3dWrap) dom.stageAudio3dWrap.style.display = "none";
    return;
  }

  if (dom.stageAudio3dWrap) {
    dom.stageAudio3dWrap.style.display = "block";
  }

  if (wetGain) {
    if (state.audio3dSoundStyle === "concert") {
      wetGain.gain.value = 0.45;
    } else if (state.audio3dSoundStyle === "wide") {
      wetGain.gain.value = 0.22;
    } else {
      wetGain.gain.value = 0.12;
    }
  }
}

// 3D Audio Visualizer Animation Loop
function startAudio3dLoop() {
  if (visualizerRunning) return;
  visualizerRunning = true;

  function renderVisualizer() {
    animFrameId = requestAnimationFrame(renderVisualizer);

    if (!state.audio3dEnabled || !dom.stageAudio3dCanvas) return;

    const canvas = dom.stageAudio3dCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width;
    const height = rect.height;

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Audio Panning update if audio is playing
    const isPlaying = !dom.nativeAudio.paused && !dom.nativeAudio.ended && dom.nativeAudio.currentTime > 0;
    if (isPlaying) {
      orbitAngle += 0.02 * state.audio3dSpeed;
      const panVal = Math.sin(orbitAngle);

      if (state.audio3dSoundStyle === "orbit") {
        if (pannerNode) pannerNode.pan.value = panVal * 0.92;
        if (biquadFilter) biquadFilter.frequency.value = 14000 + Math.cos(orbitAngle) * 6000;
      } else if (state.audio3dSoundStyle === "slow") {
        if (pannerNode) pannerNode.pan.value = Math.sin(orbitAngle * 0.4) * 0.85;
        if (biquadFilter) biquadFilter.frequency.value = 18000;
      } else if (state.audio3dSoundStyle === "wide") {
        if (pannerNode) pannerNode.pan.value = Math.sin(orbitAngle * 0.25) * 0.25;
        if (biquadFilter) biquadFilter.frequency.value = 22000;
      } else if (state.audio3dSoundStyle === "concert") {
        if (pannerNode) pannerNode.pan.value = Math.sin(orbitAngle * 0.5) * 0.35;
        if (biquadFilter) biquadFilter.frequency.value = 20000;
      } else if (state.audio3dSoundStyle === "cyber") {
        const cyberPan = Math.sign(Math.sin(orbitAngle * 1.5)) * Math.pow(Math.abs(Math.sin(orbitAngle * 1.5)), 0.6);
        if (pannerNode) pannerNode.pan.value = cyberPan * 0.88;
        if (biquadFilter) biquadFilter.frequency.value = 16000;
      }
    }

    // Get frequencies from AnalyserNode or fallback wave
    const bufferLength = 64;
    const data = new Uint8Array(bufferLength);
    if (analyserNode && isPlaying) {
      analyserNode.getByteFrequencyData(data);
    } else if (isPlaying) {
      const t = Date.now() * 0.004;
      for (let i = 0; i < bufferLength; i++) {
        data[i] = 40 + Math.floor(Math.sin(t + i * 0.2) * 35 + Math.cos(t * 0.8 + i * 0.1) * 20);
      }
    }

    // Colors
    let colorStart = "#00f0ff";
    let colorEnd = "#3b82f6";
    if (state.audio3dColor === "purple") {
      colorStart = "#c084fc";
      colorEnd = "#ec4899";
    } else if (state.audio3dColor === "fire") {
      colorStart = "#fbbf24";
      colorEnd = "#ef4444";
    } else if (state.audio3dColor === "rainbow") {
      const hue = (Date.now() * 0.05) % 360;
      colorStart = `hsl(${hue}, 100%, 65%)`;
      colorEnd = `hsl(${(hue + 90) % 360}, 100%, 55%)`;
    } else if (state.audio3dColor === "white") {
      colorStart = "#ffffff";
      colorEnd = "#94a3b8";
    }

    const sens = state.audio3dIntensity;

    if (state.audio3dVisualizer === "bars") {
      const barCount = 42;
      const barWidth = width / barCount - 3;
      for (let i = 0; i < barCount; i++) {
        const val = (data[i % bufferLength] || 0) / 255;
        const barHeight = Math.max(3, val * height * 0.85 * sens);
        const x = i * (barWidth + 3);
        const y = height - barHeight;

        const grad = ctx.createLinearGradient(x, y, x, height);
        grad.addColorStop(0, colorStart);
        grad.addColorStop(1, colorEnd);

        ctx.fillStyle = grad;
        ctx.shadowColor = colorStart;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, Math.max(1, barWidth), barHeight, [3, 3, 0, 0]);
        } else {
          ctx.rect(x, y, Math.max(1, barWidth), barHeight);
        }
        ctx.fill();
      }
    } else if (state.audio3dVisualizer === "wave") {
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let i = 0; i < bufferLength; i++) {
        const x = (i / (bufferLength - 1)) * width;
        const val = (data[i] || 0) / 255;
        const y = height - (val * height * 0.8 * sens) - 6;
        if (i === 0) ctx.lineTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, colorStart);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.shadowColor = colorStart;
      ctx.shadowBlur = 12;
      ctx.fill();

      // Top edge line
      ctx.beginPath();
      for (let i = 0; i < bufferLength; i++) {
        const x = (i / (bufferLength - 1)) * width;
        const val = (data[i] || 0) / 255;
        const y = height - (val * height * 0.8 * sens) - 6;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colorStart;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (state.audio3dVisualizer === "mirror") {
      const half = Math.floor(bufferLength / 2);
      const barW = (width / 2) / half - 2;
      const centerX = width / 2;
      for (let i = 0; i < half; i++) {
        const val = (data[i] || 0) / 255;
        const h = Math.max(3, val * height * 0.85 * sens);
        const y = height - h;

        ctx.fillStyle = colorStart;
        ctx.shadowColor = colorStart;
        ctx.shadowBlur = 6;

        ctx.fillRect(centerX + i * (barW + 2), y, Math.max(1, barW), h);
        ctx.fillRect(centerX - (i + 1) * (barW + 2), y, Math.max(1, barW), h);
      }
    } else if (state.audio3dVisualizer === "circle") {
      const cx = width / 2;
      const cy = height / 2 + 10;
      const baseR = Math.min(width, height) * 0.24;
      const count = 36;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const val = (data[i % bufferLength] || 0) / 255;
        const r = baseR + val * baseR * 1.5 * sens;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = colorStart;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = colorStart;
      ctx.shadowBlur = 10;
      ctx.stroke();
    } else if (state.audio3dVisualizer === "dots") {
      const cols = 32;
      const colW = width / cols;
      for (let i = 0; i < cols; i++) {
        const val = (data[i % bufferLength] || 0) / 255;
        const dotY = height - (val * height * 0.8 * sens) - 8;
        const dotX = i * colW + colW / 2;

        ctx.fillStyle = colorStart;
        ctx.shadowColor = colorStart;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  renderVisualizer();
}

// 3D Audio Event Listeners
if (dom.toggle3DAudio) {
  dom.toggle3DAudio.addEventListener("change", (e) => {
    state.audio3dEnabled = e.target.checked;
    dom.audio3dOptions.classList.toggle("visible", state.audio3dEnabled);
    if (state.audio3dEnabled) {
      initAudioEngine();
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      startAudio3dLoop();
      showToast("3D Audio Mode Active! Use headphones for spatial 360° effect.");
    }
    updateAudio3dRouting();
  });
}

if (dom.audio3dSoundPills) {
  dom.audio3dSoundPills.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    dom.audio3dSoundPills.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    state.audio3dSoundStyle = pill.getAttribute("data-sound3d");
    if (dom.audio3dHint && sound3dHints[state.audio3dSoundStyle]) {
      dom.audio3dHint.textContent = sound3dHints[state.audio3dSoundStyle];
    }
    updateAudio3dRouting();
  });
}

if (dom.slider3DSpeed) {
  dom.slider3DSpeed.addEventListener("input", (e) => {
    state.audio3dSpeed = parseFloat(e.target.value);
    dom.val3DSpeed.textContent = `${state.audio3dSpeed.toFixed(1)}x`;
  });
}

if (dom.audio3dStylePills) {
  dom.audio3dStylePills.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    dom.audio3dStylePills.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    state.audio3dVisualizer = pill.getAttribute("data-3dstyle");
  });
}

if (dom.audio3dColorPills) {
  dom.audio3dColorPills.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    dom.audio3dColorPills.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    state.audio3dColor = pill.getAttribute("data-3dcolor");
  });
}

if (dom.slider3DIntensity) {
  dom.slider3DIntensity.addEventListener("input", (e) => {
    state.audio3dIntensity = parseFloat(e.target.value);
    dom.val3DIntensity.textContent = `${state.audio3dIntensity.toFixed(1)}x`;
  });
}

if (dom.slider3DSmooth) {
  dom.slider3DSmooth.addEventListener("input", (e) => {
    state.audio3dSmooth = Number(e.target.value) / 100;
    dom.val3DSmooth.textContent = `${e.target.value}%`;
    if (analyserNode) analyserNode.smoothingTimeConstant = state.audio3dSmooth;
  });
}

/* ------------------------------------------------------------------ */
/*  7. Video Rendering Pipeline (FFmpeg Execution)                    */
/* ------------------------------------------------------------------ */
async function startVideoRender() {
  if (!state.currentSong) {
    showToast("Please search and select a song track first!");
    return;
  }

  if (!state.lyrics.length) {
    showToast("No lyrics found. Add or load lyrics first!");
    return;
  }

  // Open progress modal
  dom.renderModal.style.display = "flex";
  dom.renderInProgressView.style.display = "block";
  dom.renderSuccessView.style.display = "none";
  dom.renderFailView.style.display = "none";
  dom.renderStatusTitle.textContent = "Initializing NVIDIA NVENC GPU Engine...";
  dom.renderStatusSub.textContent = "Hardware encoding 1080p MP4 with RTX 2050 NVENC acceleration & synced typography.";
  dom.renderProgressFill.style.width = "5%";
  dom.renderPercentLabel.textContent = "5%";

  // Pause audio preview to free resources
  dom.nativeAudio.pause();

  const payload = {
    songId: state.currentSong.id,
    audioUrl: state.audioUrl,
    background: state.selectedBackground,
    lyrics: state.lyrics,
    options: {
      aspectRatio: "16:9",
      fps: state.fps,
      bgDarkness: state.bgDarkness,
      bgBlur: state.bgBlur,
      bgMotion: state.bgMotion,
      fontFamily: state.fontFamily,
      fontSize: Math.min(170, Math.max(150, state.fontSize || 150)),
      fontWeight: state.fontWeight,
      fontColor: state.textColor,
      outlineColor: state.outlineColor,
      outlineWidth: state.shadowSpread > 0 ? state.shadowSpread : state.outlineWidth,
      shadowColor: state.shadowColor,
      shadowDepth: state.shadowDepth,
      shadowBlur: state.shadowBlur,
      shadowSpread: state.shadowSpread,
      animation: state.animation,
      linesMode: state.linesMode,
      lyricDelay: state.lyricDelay,
      audio3dEnabled: state.audio3dEnabled,
      audio3dSoundStyle: state.audio3dSoundStyle,
      audio3dSpeed: state.audio3dSpeed,
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
      dom.renderStatusTitle.textContent = job.message || "Encoding video...";

      if (job.status === "completed") {
        clearInterval(state.pollTimer);
        dom.renderInProgressView.style.display = "none";
        dom.renderSuccessView.style.display = "block";

        dom.btnDownloadVideo.href = job.outputUrl;
        dom.renderedVideoPlayer.src = job.outputUrl;
        dom.renderedVideoPlayer.load();

        showToast("🎉 Video ready for download!");
      } else if (job.status === "failed") {
        clearInterval(state.pollTimer);
        dom.renderInProgressView.style.display = "none";
        dom.renderFailView.style.display = "block";
        dom.renderFailMsg.textContent = job.error || "FFmpeg encountered an error.";
      }
    } catch (err) {
      console.warn("Poll status check error:", err);
    }
  }, 900);
}

// Render Actions
dom.btnGenerateVideoTop.addEventListener("click", startVideoRender);
dom.btnGenerateVideoMain.addEventListener("click", startVideoRender);

dom.btnCloseModal.addEventListener("click", () => {
  dom.renderModal.style.display = "none";
  dom.renderedVideoPlayer.pause();
});

dom.btnDismissSuccess.addEventListener("click", () => {
  dom.renderModal.style.display = "none";
  dom.renderedVideoPlayer.pause();
});

dom.btnRetryRender.addEventListener("click", () => {
  dom.renderModal.style.display = "none";
});

/* ------------------------------------------------------------------ */
/*  8. Additional Toolbar Features & Setup                            */
/* ------------------------------------------------------------------ */
dom.btnAddLine.addEventListener("click", addLyricLine);

dom.btnToggleLrcRaw.addEventListener("click", () => {
  const isHidden = dom.rawLrcContainer.style.display === "none";
  dom.rawLrcContainer.style.display = isHidden ? "flex" : "none";
  dom.btnToggleLrcRaw.classList.toggle("active", isHidden);
});

dom.btnApplyRawLrc.addEventListener("click", () => {
  const text = dom.rawLrcText.value;
  const parsed = parseLrcClient(text);
  if (parsed.length) {
    setLyrics(parsed, text);
    showToast(`Applied ${parsed.length} lines from LRC!`);
  } else {
    showToast("No valid timestamped lines found in LRC");
  }
});

function parseLrcClient(lrc) {
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
    for (const t of stamps) out.push({ timeMs: t, text });
  }
  return out.sort((a, b) => a.timeMs - b.timeMs);
}

// Quick Demo Track loader button
dom.btnQuickDemo.addEventListener("click", async () => {
  dom.searchInput.value = "Millionaire";
  await searchSongs("Millionaire");
  const first = dom.searchResultsList.querySelector(".song-item");
  if (first) first.click();
});

// Search on Enter & Button
dom.btnSearch.addEventListener("click", () => searchSongs(dom.searchInput.value.trim()));
dom.searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchSongs(dom.searchInput.value.trim());
});

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

/* ------------------------------------------------------------------ */
/*  Init                                                              */
/* ------------------------------------------------------------------ */
window.addEventListener("DOMContentLoaded", async () => {
  await loadBackgrounds();
  applyVisualStyles();
  updateAmbientParticles();
  // Auto search initial popular query
  searchSongs("Millionaire");
});
