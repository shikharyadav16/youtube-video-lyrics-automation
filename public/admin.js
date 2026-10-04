/**
 * Spark Admin Automation Controller
 * Apple-style minimal UI logic.
 * Zero icons. Zero emojis. Pure clean typography.
 */

// Application State
const state = {
  activeJobId: null,
  pollTimer: null,
  songs: [],
  youtubeConnected: false,
};

// DOM Cache
const dom = {
  engineStatusBadge: document.getElementById("engineStatusBadge"),
  engineStatusDot: document.getElementById("engineStatusDot"),
  engineStatusText: document.getElementById("engineStatusText"),
  ytStatusDot: document.getElementById("ytStatusDot"),
  ytStatusText: document.getElementById("ytStatusText"),
  ytConnectBtn: document.getElementById("ytConnectBtn"),
  
  songInputForm: document.getElementById("songInputForm"),
  songInput: document.getElementById("songInput"),
  btnSave: document.getElementById("btnSave"),
  
  selectBg: document.getElementById("selectBg"),
  selectTitleFont: document.getElementById("selectTitleFont"),
  selectSingerFont: document.getElementById("selectSingerFont"),
  selectSongFont: document.getElementById("selectSongFont"),
  inputFontSize: document.getElementById("inputFontSize"),
  
  responseBanner: document.getElementById("responseBanner"),
  
  trackerCard: document.getElementById("trackerCard"),
  trackerJobId: document.getElementById("trackerJobId"),
  step1: document.getElementById("step1"),
  step2: document.getElementById("step2"),
  step3: document.getElementById("step3"),
  step4: document.getElementById("step4"),
  step5: document.getElementById("step5"),
  step6: document.getElementById("step6"),
  
  progressPercent: document.getElementById("progressPercent"),
  progressFill: document.getElementById("progressFill"),
  progressStatusMsg: document.getElementById("progressStatusMsg"),
  
  activeResultBox: document.getElementById("activeResultBox"),
  resultThumb: document.getElementById("resultThumb"),
  resultThumbBadge: document.getElementById("resultThumbBadge"),
  resultTitle: document.getElementById("resultTitle"),
  resultMeta: document.getElementById("resultMeta"),
  resultCleanStatus: document.getElementById("resultCleanStatus"),
  resultVideoDownload: document.getElementById("resultVideoDownload"),
  resultYtLink: document.getElementById("resultYtLink"),
  
  libraryStats: document.getElementById("libraryStats"),
  tableSearchInput: document.getElementById("tableSearchInput"),
  songsTableBody: document.getElementById("songsTableBody"),
  btnRefreshLibrary: document.getElementById("btnRefreshLibrary"),

  queueWaitingBanner: document.getElementById("queueWaitingBanner"),
  queuePosTag: document.getElementById("queuePosTag"),
  queueActiveHint: document.getElementById("queueActiveHint"),
  queueWaitingMsg: document.getElementById("queueWaitingMsg"),

  queueCard: document.getElementById("queueCard"),
  queueLengthBadge: document.getElementById("queueLengthBadge"),
  queueActiveBox: document.getElementById("queueActiveBox"),
  queueActiveTitle: document.getElementById("queueActiveTitle"),
  queueActiveArtist: document.getElementById("queueActiveArtist"),
  queueActiveStatus: document.getElementById("queueActiveStatus"),
  queueWaitingSection: document.getElementById("queueWaitingSection"),
  queueItemsList: document.getElementById("queueItemsList"),

  failedSongsCard: document.getElementById("failedSongsCard"),
  failedCountBadge: document.getElementById("failedCountBadge"),
  failedTableBody: document.getElementById("failedTableBody"),
  btnRefreshFailed: document.getElementById("btnRefreshFailed"),
  btnClearAllFailed: document.getElementById("btnClearAllFailed"),
};

// Notification Banner Helper
function showBanner(type, message) {
  dom.responseBanner.className = `response-banner show ${type}`;
  dom.responseBanner.textContent = message;
}

function clearBanner() {
  dom.responseBanner.className = "response-banner";
  dom.responseBanner.textContent = "";
}

// Check Engine & System Status (NVENC GPU vs CPU)
async function checkSystemEngineStatus() {
  try {
    const res = await fetch("/api/system/status");
    if (!res.ok) return;
    const data = await res.json();
    window.__serverEngine = data.encoder;
    window.__serverSystem = data.system;

    const dot = dom.engineStatusDot || document.getElementById("engineStatusDot");
    const text = dom.engineStatusText || document.getElementById("engineStatusText");
    const badge = dom.engineStatusBadge || document.getElementById("engineStatusBadge");

    if (dot && text) {
      if (data.encoder.hasNvenc) {
        dot.className = "status-dot nvenc";
        text.textContent = "RTX 2050 NVENC";
        if (badge) badge.title = `NVIDIA NVENC Hardware Accelerated (60 FPS) • ${data.system.cpuCores} vCPU`;
      } else {
        dot.className = "status-dot cpu";
        const preset = data.encoder.cpuPreset || "veryfast";
        text.textContent = `CPU libx264 (${preset})`;
        if (badge) badge.title = `Ubuntu / CPU Tier • Preset: ${preset} • Threads: ${data.encoder.cpuThreads} • ${data.system.cpuCores} vCPU`;
      }
    }
  } catch (err) {
    console.warn("System engine status check error:", err);
  }
}

// Check YouTube Auth Status
async function checkYouTubeStatus() {
  try {
    const res = await fetch("/api/youtube/status");
    const data = await res.json();
    state.youtubeConnected = !!data.authenticated;

    if (state.youtubeConnected) {
      dom.ytStatusDot.className = "status-dot connected";
      dom.ytStatusText.textContent = "YouTube Connected";
      dom.ytConnectBtn.style.display = "none";
    } else {
      dom.ytStatusDot.className = "status-dot disconnected";
      dom.ytStatusText.textContent = "YouTube Not Connected";
      dom.ytConnectBtn.style.display = "inline";
    }
  } catch (err) {
    console.warn("YouTube status check error:", err);
  }
}

// Process Song Form Submission
dom.songInputForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = dom.songInput.value.trim();
  if (!query) return;

  clearBanner();
  dom.btnSave.disabled = true;
  dom.btnSave.textContent = "Checking...";

  try {
    const payload = {
      query,
      background: dom.selectBg ? dom.selectBg.value : "auto",
      titleFont: dom.selectTitleFont ? dom.selectTitleFont.value : "auto",
      singerFont: dom.selectSingerFont ? dom.selectSingerFont.value : "auto",
      songFont: dom.selectSongFont ? dom.selectSongFont.value : "auto",
      fontSize: dom.inputFontSize ? Number(dom.inputFontSize.value) || 150 : 150,
      titleFontSize: document.getElementById("numTitleFontSize")
        ? Number(document.getElementById("numTitleFontSize").value) || 280
        : 280,
      singerFontSize: document.getElementById("numSingerFontSize")
        ? Number(document.getElementById("numSingerFontSize").value) || 132
        : 132,
      thumbnailGap: document.getElementById("numThumbGap")
        ? Number(document.getElementById("numThumbGap").value) || 42
        : 42,
      thumbnailGlowDepth: document.getElementById("numThumbGlowDepth")
        ? Number(document.getElementById("numThumbGlowDepth").value) || 2
        : 2,
    };

    const res = await fetch("/api/admin/process-song", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    dom.btnSave.disabled = false;
    dom.btnSave.textContent = "Save & Automate";

    if (!res.ok) {
      showBanner("not_found", data.error || "Request failed");
      return;
    }

    // Handle exact statuses per user requirements:
    // 1. Song is not found
    if (data.status === "not_found") {
      showBanner("not_found", data.message || "Song is not found");
      return;
    }

    // 2. Song already present in database
    if (data.status === "already_present") {
      showBanner("already_present", data.message || "Song already present in database");
      return;
    }

    // 3. Synced lyrics not found for this song
    if (data.status === "lyrics_not_found") {
      showBanner("lyrics_not_found", data.message || "Lyrics is not present");
      await loadFailedSongs();
      return;
    }

    // 4. Added to Queue (another video currently processing)
    if (data.status === "queued") {
      showBanner("started", data.message || `Song "${data.song?.title || query}" added to queue (Position #${data.queuePosition || 1})`);
      startActiveTracker(data.jobId, data.song, true, data.queuePosition);
      await loadQueue();
      return;
    }

    // 5. Started automation pipeline immediately
    if (data.status === "started") {
      showBanner("started", data.message || `Started automation for "${data.song?.title || query}"`);
      startActiveTracker(data.jobId, data.song, false, 0);
      await loadQueue();
      return;
    }
  } catch (err) {
    dom.btnSave.disabled = false;
    dom.btnSave.textContent = "Save & Automate";
    showBanner("not_found", "Network or server connection error.");
  }
});

// Start Active Automation Tracker
function startActiveTracker(jobId, song, isQueued = false, queuePosition = 1) {
  state.activeJobId = jobId;
  dom.trackerCard.classList.add("active");
  dom.trackerJobId.textContent = jobId;
  dom.activeResultBox.classList.remove("show");

  // Step 1, 2, 3 verified
  dom.step1.className = "pipeline-step-item completed";
  dom.step2.className = "pipeline-step-item completed";
  dom.step3.className = "pipeline-step-item completed";

  if (isQueued) {
    if (dom.queueWaitingBanner) {
      dom.queueWaitingBanner.style.display = "block";
      if (dom.queuePosTag) dom.queuePosTag.textContent = `Queued: Position #${queuePosition || 1}`;
      if (dom.queueWaitingMsg) {
        dom.queueWaitingMsg.textContent = "This song is waiting in queue. Video generation runs strictly one-by-one. It will start automatically when current video completes.";
      }
    }
    dom.step4.className = "pipeline-step-item";
    dom.step5.className = "pipeline-step-item";
    dom.step6.className = "pipeline-step-item";

    dom.progressPercent.textContent = "Queued";
    dom.progressFill.style.width = "5%";
    dom.progressStatusMsg.textContent = `Waiting in queue (Position #${queuePosition || 1}). Will start automatically...`;
  } else {
    if (dom.queueWaitingBanner) dom.queueWaitingBanner.style.display = "none";
    dom.step4.className = "pipeline-step-item active";
    dom.step5.className = "pipeline-step-item";
    dom.step6.className = "pipeline-step-item";

    dom.progressPercent.textContent = "15%";
    dom.progressFill.style.width = "15%";
    dom.progressStatusMsg.textContent = "Generating 1080p custom thumbnail & buffering audio...";
  }

  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => pollJobStatus(jobId, song), 1200);
}

// Poll Active Job Status
async function pollJobStatus(jobId, song) {
  try {
    const res = await fetch(`/api/render/status/${jobId}`);
    if (!res.ok) return;
    const job = await res.json();

    // If job is still queued waiting for its turn
    if (job.status === "queued") {
      if (dom.queueWaitingBanner) {
        dom.queueWaitingBanner.style.display = "block";
        if (dom.queuePosTag) dom.queuePosTag.textContent = `Queued: Position #${job.queuePosition || 1}`;
        if (dom.queueWaitingMsg) {
          dom.queueWaitingMsg.textContent = job.message || "Waiting in queue. Video generation runs strictly one-by-one.";
        }
      }
      dom.progressPercent.textContent = "Queued";
      dom.progressFill.style.width = "5%";
      dom.progressStatusMsg.textContent = job.message || "Waiting in queue...";
      loadQueue();
      return;
    }

    // When no longer queued, hide waiting banner
    if (dom.queueWaitingBanner) {
      dom.queueWaitingBanner.style.display = "none";
    }

    const pct = Math.max(15, job.percent || 15);
    dom.progressPercent.textContent = `${pct}%`;
    dom.progressFill.style.width = `${pct}%`;
    dom.progressStatusMsg.textContent = job.message || "Processing...";

    // 1. Immediately display thumbnail upon creation
    if (job.thumbUrl) {
      dom.activeResultBox.classList.add("show");
      dom.resultThumb.src = job.thumbUrl;
      dom.resultTitle.textContent = job.songTitle || song?.title || "Custom Thumbnail Generated";

      // If rendering is in progress, mark Step 4 completed and Step 5 active
      if (job.status !== "completed" && job.status !== "failed") {
        dom.step4.className = "pipeline-step-item completed";
        dom.step5.className = "pipeline-step-item active";
        if (dom.resultThumbBadge) {
          dom.resultThumbBadge.textContent = "Thumbnail Ready (1080p)";
          dom.resultThumbBadge.className = "thumb-status-badge";
        }
        dom.resultMeta.textContent = `${job.singer || song?.singer || ""} | 1080p Custom Thumbnail Ready • ${job.message || "Rendering 60fps video..."}`;
        if (dom.resultCleanStatus) dom.resultCleanStatus.style.display = "none";
        dom.resultVideoDownload.style.display = "none";
        dom.resultYtLink.style.display = "none";
      }
    }

    // Step state tracking for render/upload
    if (pct >= 30 && job.status !== "completed") {
      dom.step4.className = "pipeline-step-item completed";
      dom.step5.className = "pipeline-step-item active";
    }

    if (pct >= 95 && job.status !== "completed") {
      dom.step5.className = "pipeline-step-item completed";
      dom.step6.className = "pipeline-step-item active";
    }

    if (job.status === "completed") {
      clearInterval(state.pollTimer);
      dom.step4.className = "pipeline-step-item completed";
      dom.step5.className = "pipeline-step-item completed";
      dom.step6.className = "pipeline-step-item completed";

      dom.progressPercent.textContent = "100%";
      dom.progressFill.style.width = "100%";
      dom.progressStatusMsg.textContent = job.message || "Automation pipeline completed successfully!";

      // Show result preview box
      dom.activeResultBox.classList.add("show");
      dom.resultTitle.textContent = job.songTitle || song?.title || "Video Generated";

      if (job.thumbUrl) {
        dom.resultThumb.src = job.thumbUrl;
      }

      const engineLabel = (job.encoderMode === "nvenc" || window.__serverEngine?.hasNvenc)
        ? "60 FPS NVENC (GPU)"
        : `CPU libx264 (${window.__serverEngine?.cpuPreset || "veryfast"})`;

      if (job.youtubeUploaded) {
        if (dom.resultThumbBadge) {
          dom.resultThumbBadge.textContent = "Live on YouTube";
          dom.resultThumbBadge.className = "thumb-status-badge live";
        }
        dom.resultMeta.textContent = `${job.singer || song?.singer || ""} | ${engineLabel} | YouTube Upload Complete`;
        if (dom.resultCleanStatus) {
          dom.resultCleanStatus.style.display = "block";
          dom.resultCleanStatus.textContent = "Output video & thumbnail cleaned up after successful YouTube upload.";
        }
        dom.resultVideoDownload.style.display = "none";
        if (job.youtubeUrl) {
          dom.resultYtLink.href = job.youtubeUrl;
          dom.resultYtLink.style.display = "inline-flex";
          dom.resultYtLink.textContent = "Watch on YouTube";
        }
      } else {
        if (dom.resultThumbBadge) {
          dom.resultThumbBadge.textContent = "Render Complete";
          dom.resultThumbBadge.className = "thumb-status-badge";
        }
        dom.resultMeta.textContent = `${job.singer || song?.singer || ""} | ${engineLabel}`;
        if (dom.resultCleanStatus) dom.resultCleanStatus.style.display = "none";
        if (job.outputUrl) {
          dom.resultVideoDownload.href = job.outputUrl;
          dom.resultVideoDownload.style.display = "inline-flex";
        }
      }

      // Refresh database table, queue, and failed songs
      await loadLibrary();
      await loadQueue();
      await loadFailedSongs();
    } else if (job.status === "failed") {
      clearInterval(state.pollTimer);
      dom.progressStatusMsg.textContent = `Error: ${job.error || "Rendering failed"}`;
      showBanner("not_found", `Error during pipeline: ${job.error || "Process failed"}`);
      await loadFailedSongs();
      await loadQueue();
    }
  } catch (err) {
    console.warn("Poll status check error:", err);
  }
}

// Load Processed Songs Library from MongoDB
async function loadLibrary() {
  try {
    const [songsRes, statsRes] = await Promise.all([
      fetch("/api/admin/songs"),
      fetch("/api/admin/stats"),
    ]);

    const songsData = await songsRes.json();
    const statsData = await statsRes.json();

    state.songs = songsData.songs || [];
    renderLibraryTable(state.songs);

    const total = statsData.totalSongs || state.songs.length || 0;
    const ytCount = statsData.youtubeUploaded || 0;
    dom.libraryStats.textContent = `Total Saved: ${total} | YouTube Uploaded: ${ytCount}`;
  } catch (err) {
    console.warn("Failed to load library:", err);
  }
}

// Render Library Table
function renderLibraryTable(songs) {
  dom.songsTableBody.innerHTML = "";

  if (!songs.length) {
    dom.songsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty-row">
          No songs processed yet. Enter a song name above to start the automated pipeline.
        </td>
      </tr>
    `;
    return;
  }

  songs.forEach((s) => {
    const tr = document.createElement("tr");

    const createdDate = s.createdAt
      ? new Date(s.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Recently";

    const ytBadge = s.youtubeUploaded && s.youtubeUrl
      ? `<a href="${s.youtubeUrl}" target="_blank" class="table-action-link">Watch on YouTube</a>`
      : `<span class="badge-pill yt-no">Not Uploaded</span>`;

    const downloadLink = s.videoUrl
      ? `<a href="${s.videoUrl}" download class="table-action-link">Download MP4</a>`
      : `<span style="color: var(--text-tertiary);">&mdash;</span>`;

    const thumbHtml = s.thumbUrl
      ? `<img src="${s.thumbUrl}" alt="Thumbnail" class="table-thumb">`
      : `<div style="width: 100px; height: 56px; background: var(--bg-subtle); border-radius: var(--radius-sm);"></div>`;

    tr.innerHTML = `
      <td>${thumbHtml}</td>
      <td>
        <div class="table-song-title">${escapeHtml(s.title || "Untitled")}</div>
        <div class="table-song-singer">${escapeHtml(s.singer || "Unknown Artist")}</div>
      </td>
      <td>
        <span style="font-size: 13px; color: var(--text-secondary);">
          ${escapeHtml(s.fontFamily || "Montserrat")} &bull; ${escapeHtml(s.animation || "pop")} &bull; 60 FPS
        </span>
      </td>
      <td>${ytBadge}</td>
      <td>${downloadLink}</td>
      <td>
        <button class="btn-secondary btn-danger" data-id="${s.songId}" style="height: 32px; padding: 0 10px; font-size: 12px;">Delete</button>
      </td>
    `;

    // Attach delete action
    const btnDel = tr.querySelector(".btn-danger");
    btnDel.addEventListener("click", () => deleteSong(s.songId, s.title));

    dom.songsTableBody.appendChild(tr);
  });
}

// Delete Song from MongoDB
async function deleteSong(songId, title) {
  if (!confirm(`Delete "${title}" from the database?`)) return;

  try {
    const res = await fetch(`/api/admin/song/${songId}`, { method: "DELETE" });
    if (res.ok) {
      await loadLibrary();
    }
  } catch (err) {
    alert("Failed to delete song record.");
  }
}

// Filter Table on Search Input
dom.tableSearchInput.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderLibraryTable(state.songs);
    return;
  }
  const filtered = state.songs.filter((s) => {
    const t = (s.title || "").toLowerCase();
    const singer = (s.singer || "").toLowerCase();
    const font = (s.fontFamily || "").toLowerCase();
    return t.includes(query) || singer.includes(query) || font.includes(query);
  });
  renderLibraryTable(filtered);
});

// Refresh Library Button
dom.btnRefreshLibrary.addEventListener("click", loadLibrary);

// Load and Render Queue Status
async function loadQueue() {
  try {
    const res = await fetch("/api/admin/queue");
    if (!res.ok) return;
    const data = await res.json();

    const isBusy = Boolean(data.isProcessing);
    const waitingItems = data.queue || [];
    const hasQueueActivity = isBusy || waitingItems.length > 0;

    if (!dom.queueCard) return;

    if (!hasQueueActivity) {
      dom.queueCard.style.display = "none";
      return;
    }

    dom.queueCard.style.display = "block";

    if (dom.queueLengthBadge) {
      dom.queueLengthBadge.textContent = `${waitingItems.length} in line`;
    }

    // Active Job
    if (data.activeJob && dom.queueActiveBox) {
      dom.queueActiveBox.style.display = "block";
      if (dom.queueActiveTitle) dom.queueActiveTitle.textContent = data.activeJob.songTitle || "Processing Song";
      if (dom.queueActiveArtist) dom.queueActiveArtist.textContent = data.activeJob.singer || "";
      if (dom.queueActiveStatus) dom.queueActiveStatus.textContent = data.activeJob.message || "Encoding Video...";
    } else if (dom.queueActiveBox) {
      dom.queueActiveBox.style.display = "none";
    }

    // Waiting in Queue Section
    if (waitingItems.length > 0 && dom.queueWaitingSection && dom.queueItemsList) {
      dom.queueWaitingSection.style.display = "block";
      dom.queueItemsList.innerHTML = waitingItems
        .map(
          (item) => `
          <div class="queue-item-row">
            <div class="queue-item-left">
              <span class="queue-item-pos">#${item.queuePosition}</span>
              <div>
                <span class="queue-item-title">${escapeHtml(item.songTitle)}</span>
                <span class="queue-item-artist">${escapeHtml(item.singer || "")}</span>
              </div>
            </div>
            <span class="queue-item-wait-pill">Waiting in Queue</span>
          </div>
        `
        )
        .join("");
    } else if (dom.queueWaitingSection) {
      dom.queueWaitingSection.style.display = "none";
    }
  } catch (err) {
    console.warn("Failed to load queue:", err);
  }
}

// Load and Render Failed Songs List
async function loadFailedSongs() {
  try {
    const res = await fetch("/api/admin/failed-songs");
    if (!res.ok) return;
    const data = await res.json();
    const list = data.failedSongs || [];

    if (dom.failedCountBadge) {
      dom.failedCountBadge.textContent = `${list.length} Failed`;
    }

    if (dom.btnClearAllFailed) {
      dom.btnClearAllFailed.style.display = list.length > 0 ? "inline-block" : "none";
    }

    if (!dom.failedTableBody) return;

    if (!list.length) {
      dom.failedTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty-row">
            No failed songs recorded. All automation jobs completed successfully.
          </td>
        </tr>
      `;
      return;
    }

    dom.failedTableBody.innerHTML = list
      .map((item) => {
        const timeStr = item.failedAt
          ? new Date(item.failedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })
          : "—";

        const stepName = item.step ? item.step.replace(/_/g, " ") : "pipeline";
        const queryVal = item.query || item.title || "";

        return `
          <tr>
            <td>
              <div class="song-title-cell">${escapeHtml(item.title || item.query || "Unknown Song")}</div>
              <div class="song-singer-cell">${escapeHtml(item.singer || "Unknown Artist")}</div>
            </td>
            <td>
              <span class="failed-reason-pill" title="${escapeHtml(item.reason || "Unknown error")}">
                ${escapeHtml(item.reason || "Process failed")}
              </span>
            </td>
            <td>
              <span class="failed-step-tag">${escapeHtml(stepName)}</span>
            </td>
            <td>
              <span class="song-date-cell">${timeStr}</span>
            </td>
            <td style="text-align: right;">
              <button
                type="button"
                class="btn-retry-micro"
                data-id="${item._id}"
                data-query="${escapeHtml(queryVal)}"
                title="Retry processing this song"
              >
                Retry
              </button>
              <button
                type="button"
                class="btn-dismiss-micro"
                data-id="${item._id}"
                title="Dismiss and remove from failed list"
              >
                Dismiss
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    // Attach retry and dismiss listeners
    dom.failedTableBody.querySelectorAll(".btn-retry-micro").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const query = btn.dataset.query;
        if (!query) return;

        btn.disabled = true;
        btn.textContent = "Retrying...";

        try {
          await fetch(`/api/admin/failed-songs/retry/${id}`, { method: "POST" });
        } catch {}

        dom.songInput.value = query;
        dom.songInput.scrollIntoView({ behavior: "smooth" });
        dom.songInputForm.dispatchEvent(new Event("submit"));
        await loadFailedSongs();
      });
    });

    dom.failedTableBody.querySelectorAll(".btn-dismiss-micro").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        try {
          await fetch(`/api/admin/failed-songs/${id}`, { method: "DELETE" });
          await loadFailedSongs();
        } catch (err) {
          console.error("Failed to dismiss error:", err);
        }
      });
    });
  } catch (err) {
    console.warn("Failed to load failed songs:", err);
  }
}

// Clear All Failed Songs
if (dom.btnClearAllFailed) {
  dom.btnClearAllFailed.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to clear all recorded failed songs?")) return;
    try {
      await fetch("/api/admin/failed-songs", { method: "DELETE" });
      await loadFailedSongs();
    } catch (err) {
      console.error("Failed to clear failed songs:", err);
    }
  });
}

// Refresh Failed Songs Button
if (dom.btnRefreshFailed) {
  dom.btnRefreshFailed.addEventListener("click", loadFailedSongs);
}

// Escape HTML utility
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

// Dynamic Background Picker Setup
async function setupBackgroundPicker() {
  const bgThumbnailsRow = document.getElementById("bgThumbnailsRow");
  const selectBg = document.getElementById("selectBg");
  const selectedBgName = document.getElementById("selectedBgName");

  if (!bgThumbnailsRow || !selectBg) return;

  try {
    const res = await fetch("/api/backgrounds");
    if (res.ok) {
      const data = await res.json();
      const list = data.backgrounds || [];
      list.sort((a, b) =>
        a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: "base" })
      );

      window.__availableBackgrounds = list;

      // Keep only auto card, remove previous dynamic cards
      const autoCard = bgThumbnailsRow.querySelector('[data-bg="auto"]');
      bgThumbnailsRow.innerHTML = "";
      if (autoCard) {
        bgThumbnailsRow.appendChild(autoCard);
      } else {
        const newAuto = document.createElement("div");
        newAuto.className = "bg-thumb-card active";
        newAuto.dataset.bg = "auto";
        newAuto.tabIndex = 0;
        newAuto.setAttribute("role", "button");
        newAuto.setAttribute("aria-pressed", "true");
        newAuto.title = "Auto (Random Background)";
        newAuto.innerHTML = `
          <div class="bg-thumb-auto"><span>Auto</span></div>
          <div class="bg-thumb-name">Auto (Random)</div>
        `;
        bgThumbnailsRow.appendChild(newAuto);
      }

      // Reset options in selectBg (keep auto as default)
      selectBg.innerHTML = '<option value="auto" selected>Auto (Random Background)</option>';

      list.forEach((item) => {
        // Native option
        const opt = document.createElement("option");
        opt.value = item.filename;
        opt.textContent = item.filename;
        selectBg.appendChild(opt);

        // Visual thumbnail card
        const card = document.createElement("div");
        card.className = "bg-thumb-card";
        card.dataset.bg = item.filename;
        card.dataset.url = item.url;
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-pressed", "false");
        card.title = item.filename;

        const img = document.createElement("img");
        img.src = item.url;
        img.className = "bg-thumb-img";
        img.alt = item.filename;
        img.loading = "lazy";

        const nameDiv = document.createElement("div");
        nameDiv.className = "bg-thumb-name";
        nameDiv.textContent = item.filename;

        card.appendChild(img);
        card.appendChild(nameDiv);
        bgThumbnailsRow.appendChild(card);
      });
    }
  } catch (err) {
    console.warn("Failed to load /api/backgrounds:", err);
  }

  // Attach activation listeners to cards
  const cards = bgThumbnailsRow.querySelectorAll(".bg-thumb-card");
  cards.forEach((card) => {
    function activateCard() {
      cards.forEach((c) => {
        c.classList.remove("active");
        c.setAttribute("aria-pressed", "false");
      });
      card.classList.add("active");
      card.setAttribute("aria-pressed", "true");

      const bgVal = card.dataset.bg;
      if (selectBg) {
        selectBg.value = bgVal;
        selectBg.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const nameText = card.querySelector(".bg-thumb-name")?.textContent || bgVal;
      if (selectedBgName) selectedBgName.textContent = nameText;

      if (window.triggerThumbnailCanvasRedraw) {
        window.triggerThumbnailCanvasRedraw();
      }
    }

    card.addEventListener("click", activateCard);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activateCard();
      }
    });
  });
}

// Live Thumbnail Verification & Fine-Tuning Composer
function initThumbnailLiveComposer() {
  const canvas = document.getElementById("thumbPreviewCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Controls
  const sliderTitleFontSize = document.getElementById("sliderTitleFontSize");
  const numTitleFontSize = document.getElementById("numTitleFontSize");
  const btnAutoTitleSize = document.getElementById("btnAutoTitleSize");

  const sliderSingerFontSize = document.getElementById("sliderSingerFontSize");
  const numSingerFontSize = document.getElementById("numSingerFontSize");
  const btnAutoSingerSize = document.getElementById("btnAutoSingerSize");

  const sliderThumbGap = document.getElementById("sliderThumbGap");
  const numThumbGap = document.getElementById("numThumbGap");
  const btnResetGap = document.getElementById("btnResetGap");

  const sliderThumbGlowDepth = document.getElementById("sliderThumbGlowDepth");
  const numThumbGlowDepth = document.getElementById("numThumbGlowDepth");
  const btnResetGlowDepth = document.getElementById("btnResetGlowDepth");

  const btnResetThumbTuning = document.getElementById("btnResetThumbTuning");

  const previewTitleInput = document.getElementById("previewTitleInput");
  const previewSingerInput = document.getElementById("previewSingerInput");

  // Background image cache
  let cachedBgImage = null;
  let cachedBgUrl = "";

  function getActiveBgUrl() {
    const activeCard = document.querySelector(".bg-thumb-card.active");
    if (activeCard && activeCard.dataset.url && activeCard.dataset.bg !== "auto") {
      return activeCard.dataset.url;
    }
    const selectBgVal = dom.selectBg ? dom.selectBg.value : "auto";
    if (selectBgVal && selectBgVal !== "auto" && window.__availableBackgrounds) {
      const found = window.__availableBackgrounds.find((b) => b.filename === selectBgVal);
      if (found) return found.url;
    }
    if (window.__availableBackgrounds && window.__availableBackgrounds.length > 0) {
      return window.__availableBackgrounds[0].url;
    }
    return "/assets/background/1.png";
  }

  function loadBgImage(url) {
    if (cachedBgUrl === url && cachedBgImage && cachedBgImage.complete) {
      return Promise.resolve(cachedBgImage);
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        cachedBgImage = img;
        cachedBgUrl = url;
        resolve(img);
      };
      img.onerror = () => {
        console.warn("Failed to load thumbnail preview background:", url);
        resolve(null);
      };
      img.src = url;
    });
  }

  // Text unit estimation matching backend automation.js
  function estimateTextUnits(text) {
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
    return units;
  }

  // Compute 1 or 2 lines for title
  function computeTitleLines(title, targetWidth = 1728) {
    const cleanTitle = (title || "").trim();
    if (!cleanTitle) return { lines: ["Song Title"], lineCount: 1 };
    const words = cleanTitle.split(/\s+/).filter(Boolean);

    if (words.length <= 3) {
      return { lines: [cleanTitle], lineCount: 1 };
    }

    // Wrap into 2 balanced lines
    let bestSplit = 1;
    let minMaxUnits = Infinity;
    for (let i = 1; i < words.length; i++) {
      const l1 = words.slice(0, i).join(" ");
      const l2 = words.slice(i).join(" ");
      const u1 = estimateTextUnits(l1);
      const u2 = estimateTextUnits(l2);
      const maxU = Math.max(u1, u2);
      if (maxU < minMaxUnits) {
        minMaxUnits = maxU;
        bestSplit = i;
      }
    }
    return {
      lines: [
        words.slice(0, bestSplit).join(" "),
        words.slice(bestSplit).join(" "),
      ],
      lineCount: 2,
    };
  }

  // Auto-fit calculations
  function computeAutoTitleSize(title) {
    const clean = (title || "").trim();
    if (!clean) return 280;
    const nominal = 280;
    const targetWidth = 1728; // 90% of 1920
    const words = clean.split(/\s+/).filter(Boolean);
    const units1 = estimateTextUnits(clean);

    if (units1 * nominal <= targetWidth && words.length <= 3) {
      return nominal;
    }
    const singleLineFit = Math.floor(targetWidth / Math.max(1, units1));
    if (words.length <= 4 && singleLineFit >= 220) {
      return Math.min(nominal, singleLineFit);
    }
    if (words.length >= 2) {
      const { lines } = computeTitleLines(clean, targetWidth);
      const maxUnits = Math.max(estimateTextUnits(lines[0]), estimateTextUnits(lines[1]));
      let size = nominal;
      if (maxUnits * nominal > targetWidth) {
        size = Math.floor(targetWidth / Math.max(1, maxUnits));
      }
      return Math.max(80, Math.min(360, size));
    }
    return Math.max(80, Math.min(360, singleLineFit));
  }

  function computeAutoSingerSize(singer) {
    const clean = (singer || "").trim();
    if (!clean) return 132;
    const nominal = 132;
    const targetWidth = 1440; // 75% of 1920
    const units = estimateTextUnits(clean);
    let size = nominal;
    if (units * nominal > targetWidth) {
      size = Math.floor(targetWidth / Math.max(1, units));
    }
    return Math.max(40, Math.min(220, size));
  }

  // Main Render Routine
  async function renderThumbnailCanvas() {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const bgUrl = getActiveBgUrl();
    const bgImg = await loadBgImage(bgUrl);

    // Clear canvas
    ctx.clearRect(0, 0, 1920, 1080);

    // 1. Draw Background (Cover Fit)
    if (bgImg && bgImg.naturalWidth) {
      const scale = Math.max(1920 / bgImg.naturalWidth, 1080 / bgImg.naturalHeight);
      const w = bgImg.naturalWidth * scale;
      const h = bgImg.naturalHeight * scale;
      const x = (1920 - w) / 2;
      const y = (1080 - h) / 2;
      ctx.drawImage(bgImg, x, y, w, h);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 1920, 1080);
      grad.addColorStop(0, "#1e1e24");
      grad.addColorStop(1, "#0d0d11");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1920, 1080);
    }

    // 2. Draw Darkness Overlay (22% black matches FFmpeg render)
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.fillRect(0, 0, 1920, 1080);

    // 3. Extract text, font family, sizes, and gap
    const titleRaw = (previewTitleInput?.value || dom.songInput?.value || "Tum Hi Ho").trim();
    const singerRaw = (previewSingerInput?.value || "Arijit Singh").trim();

    let titleFontName = dom.selectTitleFont ? dom.selectTitleFont.value : "Edo";
    if (!titleFontName || titleFontName === "auto") titleFontName = "Edo";

    let singerFontName = dom.selectSingerFont ? dom.selectSingerFont.value : "Edo";
    if (!singerFontName || singerFontName === "auto") singerFontName = "Edo";

    const titleSize = Number(numTitleFontSize?.value) || 280;
    const singerSize = Number(numSingerFontSize?.value) || 132;
    const gap = Number(numThumbGap?.value) || 42;
    const glowDepth = Number(numThumbGlowDepth?.value !== undefined ? numThumbGlowDepth.value : 2);

    // 4. Compute Layout matching backend automation.js
    const titleLayout = computeTitleLines(titleRaw, 1728);
    const isTwoLines = titleLayout.lineCount > 1;

    const titleH = isTwoLines ? titleSize * 1.85 : titleSize * 0.9;
    const artistH = singerRaw ? singerSize * 0.9 : 0;
    const finalGap = singerRaw ? gap : 0;
    const totalH = titleH + finalGap + artistH;
    const blockTop = (1080 - totalH) / 2;
    const titleY = Math.round(blockTop + titleH / 2);
    const singerY = Math.round(blockTop + titleH + finalGap + artistH / 2);

    // 5. Draw Title (Edo brush style, centered, white with 0 outline and 2px subtle glow & shadow)
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = glowDepth;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = glowDepth;
    ctx.lineWidth = 0;
    ctx.font = `${titleSize}px "${titleFontName}", "Edo", sans-serif`;

    if (isTwoLines) {
      const halfSpacing = titleSize * 0.52;
      ctx.fillText(titleLayout.lines[0], 960, titleY - halfSpacing);
      ctx.fillText(titleLayout.lines[1], 960, titleY + halfSpacing);
    } else {
      ctx.fillText(titleLayout.lines[0], 960, titleY);
    }
    ctx.restore();

    // 6. Draw Singer (Centered, white with 0 outline and 2px subtle glow & shadow)
    if (singerRaw) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#FFFFFF";
      ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
      ctx.shadowBlur = glowDepth;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = glowDepth;
      ctx.lineWidth = 0;
      ctx.font = `${singerSize}px "${singerFontName}", "Edo", sans-serif`;
      ctx.fillText(singerRaw, 960, singerY);
      ctx.restore();
    }
  }

  window.triggerThumbnailCanvasRedraw = renderThumbnailCanvas;

  // 2-Way Sync Helpers
  function bindSync(slider, numInput, onChange) {
    if (!slider || !numInput) return;
    slider.addEventListener("input", () => {
      numInput.value = slider.value;
      if (onChange) onChange();
    });
    numInput.addEventListener("input", () => {
      slider.value = numInput.value;
      if (onChange) onChange();
    });
  }

  bindSync(sliderTitleFontSize, numTitleFontSize, renderThumbnailCanvas);
  bindSync(sliderSingerFontSize, numSingerFontSize, renderThumbnailCanvas);
  bindSync(sliderThumbGap, numThumbGap, renderThumbnailCanvas);
  bindSync(sliderThumbGlowDepth, numThumbGlowDepth, renderThumbnailCanvas);

  // Auto-fit Buttons
  if (btnAutoTitleSize) {
    btnAutoTitleSize.addEventListener("click", () => {
      const title = (previewTitleInput?.value || dom.songInput?.value || "Tum Hi Ho").trim();
      const fit = computeAutoTitleSize(title);
      sliderTitleFontSize.value = fit;
      numTitleFontSize.value = fit;
      renderThumbnailCanvas();
    });
  }

  if (btnAutoSingerSize) {
    btnAutoSingerSize.addEventListener("click", () => {
      const singer = (previewSingerInput?.value || "Arijit Singh").trim();
      const fit = computeAutoSingerSize(singer);
      sliderSingerFontSize.value = fit;
      numSingerFontSize.value = fit;
      renderThumbnailCanvas();
    });
  }

  if (btnResetGap) {
    btnResetGap.addEventListener("click", () => {
      sliderThumbGap.value = 42;
      numThumbGap.value = 42;
      renderThumbnailCanvas();
    });
  }

  if (btnResetGlowDepth) {
    btnResetGlowDepth.addEventListener("click", () => {
      if (sliderThumbGlowDepth) sliderThumbGlowDepth.value = 2;
      if (numThumbGlowDepth) numThumbGlowDepth.value = 2;
      renderThumbnailCanvas();
    });
  }

  if (btnResetThumbTuning) {
    btnResetThumbTuning.addEventListener("click", () => {
      if (sliderTitleFontSize) sliderTitleFontSize.value = 280;
      if (numTitleFontSize) numTitleFontSize.value = 280;
      if (sliderSingerFontSize) sliderSingerFontSize.value = 132;
      if (numSingerFontSize) numSingerFontSize.value = 132;
      if (sliderThumbGap) sliderThumbGap.value = 42;
      if (numThumbGap) numThumbGap.value = 42;
      if (sliderThumbGlowDepth) sliderThumbGlowDepth.value = 2;
      if (numThumbGlowDepth) numThumbGlowDepth.value = 2;
      renderThumbnailCanvas();
    });
  }

  // Sample Text Inputs
  if (previewTitleInput) {
    previewTitleInput.addEventListener("input", renderThumbnailCanvas);
  }
  if (previewSingerInput) {
    previewSingerInput.addEventListener("input", renderThumbnailCanvas);
  }

  // Auto-sync from main song search input
  if (dom.songInput) {
    dom.songInput.addEventListener("input", () => {
      const val = dom.songInput.value.trim();
      if (!val) return;
      if (val.includes(" - ")) {
        const parts = val.split(" - ");
        if (previewTitleInput) previewTitleInput.value = parts[0].trim();
        if (previewSingerInput && parts[1]) previewSingerInput.value = parts.slice(1).join(" - ").trim();
      } else if (val.toLowerCase().includes(" by ")) {
        const idx = val.toLowerCase().indexOf(" by ");
        if (previewTitleInput) previewTitleInput.value = val.slice(0, idx).trim();
        if (previewSingerInput) previewSingerInput.value = val.slice(idx + 4).trim();
      } else {
        if (previewTitleInput) previewTitleInput.value = val;
      }
      renderThumbnailCanvas();
    });
  }

  // Native Select change events
  if (dom.selectTitleFont) {
    dom.selectTitleFont.addEventListener("change", renderThumbnailCanvas);
  }
  if (dom.selectSingerFont) {
    dom.selectSingerFont.addEventListener("change", renderThumbnailCanvas);
  }
  if (dom.selectBg) {
    dom.selectBg.addEventListener("change", renderThumbnailCanvas);
  }

  // Initial render
  setTimeout(renderThumbnailCanvas, 150);
}

// Custom Font Dropdowns Setup
function setupCustomFontDropdowns() {
  const configs = [
    {
      wrapperId: "wrapTitleFont",
      triggerId: "triggerTitleFont",
      labelId: "labelTitleFont",
      listId: "listTitleFont",
      nativeSelectId: "selectTitleFont",
      previewId: "previewTitleFont",
      tagId: "tagTitleFont",
      defaultSample: "Spark Lyric Studio — Song Title",
    },
    {
      wrapperId: "wrapSingerFont",
      triggerId: "triggerSingerFont",
      labelId: "labelSingerFont",
      listId: "listSingerFont",
      nativeSelectId: "selectSingerFont",
      previewId: "previewSingerFont",
      tagId: "tagSingerFont",
      defaultSample: "Artist & Singer Name — 1080p",
    },
    {
      wrapperId: "wrapSongFont",
      triggerId: "triggerSongFont",
      labelId: "labelSongFont",
      listId: "listSongFont",
      nativeSelectId: "selectSongFont",
      previewId: "previewSongFont",
      tagId: "tagSongFont",
      defaultSample: "Synchronized animated lyrics on screen",
    },
  ];

  function closeAllDropdowns() {
    document.querySelectorAll(".custom-font-select-wrapper.open").forEach((w) => {
      w.classList.remove("open");
      const btn = w.querySelector(".font-select-trigger");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  configs.forEach((cfg) => {
    const wrapper = document.getElementById(cfg.wrapperId);
    const trigger = document.getElementById(cfg.triggerId);
    const label = document.getElementById(cfg.labelId);
    const list = document.getElementById(cfg.listId);
    const nativeSelect = document.getElementById(cfg.nativeSelectId);
    const preview = document.getElementById(cfg.previewId);
    const tag = document.getElementById(cfg.tagId);

    if (!wrapper || !trigger || !list) return;

    // Sync initial selected state
    const initialSelected = list.querySelector(".font-option-item.selected");
    if (initialSelected) {
      const val = initialSelected.dataset.value;
      const sampleEl = initialSelected.querySelector(".font-option-sample");
      const metaEl = initialSelected.querySelector(".font-option-meta");
      const fontName = sampleEl ? sampleEl.textContent : val;
      const fontFamilyStyle = sampleEl ? sampleEl.style.fontFamily : "inherit";

      if (label) {
        label.textContent = fontName;
        label.style.fontFamily = fontFamilyStyle;
      }
      if (nativeSelect) {
        nativeSelect.value = val;
      }
      if (tag && metaEl) {
        tag.textContent = metaEl.textContent;
      }
      if (preview) {
        preview.style.fontFamily = fontFamilyStyle;
        if (val === "auto") {
          preview.textContent = "Preview: Auto (Random Font)";
        } else {
          preview.textContent = `Preview: ${cfg.defaultSample} (${fontName})`;
        }
      }
    }

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = wrapper.classList.contains("open");
      closeAllDropdowns();
      if (!isOpen) {
        wrapper.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
      }
    });

    const items = list.querySelectorAll(".font-option-item");
    items.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        items.forEach((i) => i.classList.remove("selected"));
        item.classList.add("selected");

        const val = item.dataset.value;
        const sampleEl = item.querySelector(".font-option-sample");
        const metaEl = item.querySelector(".font-option-meta");
        const fontName = sampleEl ? sampleEl.textContent : val;
        const fontFamilyStyle = sampleEl ? sampleEl.style.fontFamily : "inherit";

        if (label) {
          label.textContent = fontName;
          label.style.fontFamily = fontFamilyStyle;
        }

        if (nativeSelect) {
          nativeSelect.value = val;
          nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }

        if (tag && metaEl) {
          tag.textContent = metaEl.textContent;
        }

        if (preview) {
          preview.style.fontFamily = fontFamilyStyle;
          if (val === "auto") {
            preview.textContent = "Preview: Auto (Random Font)";
          } else {
            preview.textContent = `Preview: ${cfg.defaultSample} (${fontName})`;
          }
        }

        if (window.triggerThumbnailCanvasRedraw) {
          window.triggerThumbnailCanvasRedraw();
        }

        wrapper.classList.remove("open");
        trigger.setAttribute("aria-expanded", "false");
      });
    });
  });

  document.addEventListener("click", () => {
    closeAllDropdowns();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllDropdowns();
    }
  });
}

// Initial Setup
window.addEventListener("DOMContentLoaded", async () => {
  // Check URL parameters (e.g. ?youtube=connected)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("youtube") === "connected") {
    showBanner("started", "YouTube account connected successfully!");
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  await setupBackgroundPicker();
  setupCustomFontDropdowns();
  initThumbnailLiveComposer();

  await checkSystemEngineStatus();
  await checkYouTubeStatus();
  await loadLibrary();
  await loadFailedSongs();
  await loadQueue();

  // Periodically refresh queue status in background
  setInterval(loadQueue, 5000);
});
