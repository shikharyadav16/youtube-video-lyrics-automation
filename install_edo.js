import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

// 1. Locate source font file
const candidates = [
  path.resolve("assets", "fonts", "edosz.ttf"),
  path.resolve("edo_font", "edosz.ttf"),
  path.resolve("public", "fonts", "edosz.ttf"),
];

let src = candidates.find((p) => fs.existsSync(p));
if (!src) {
  console.error("❌ Source edosz.ttf not found in assets/fonts, edo_font, or public/fonts.");
  process.exit(1);
}
console.log("✔ Found font source at:", src);

// 2. Ensure public/fonts/ for browser @font-face preview
const pubDir = path.resolve("public", "fonts");
if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
fs.copyFileSync(src, path.join(pubDir, "edosz.ttf"));
console.log("✔ Synced to public/fonts/edosz.ttf");

// 3. Ensure assets/fonts/ for local FFmpeg libass lookup
const assetDir = path.resolve("assets", "fonts");
if (!fs.existsSync(assetDir)) fs.mkdirSync(assetDir, { recursive: true });
fs.copyFileSync(src, path.join(assetDir, "edosz.ttf"));
console.log("✔ Synced to assets/fonts/edosz.ttf");

// 4. System Font Registration (Cross-Platform)
if (process.platform === "win32") {
  // Windows font registration
  const winFontsDir = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Windows", "Fonts");
  if (fs.existsSync(winFontsDir)) {
    const winTarget = path.join(winFontsDir, "edosz.ttf");
    try {
      fs.copyFileSync(src, winTarget);
      console.log("✔ Copied to Windows user fonts directory:", winTarget);
    } catch (copyErr) {
      console.log("✔ Font is already registered/loaded in Windows Fonts directory");
    }

    try {
      execSync(
        `reg add "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" /v "Edo SZ (TrueType)" /t REG_SZ /d "${winTarget}" /f`,
        { stdio: "ignore" }
      );
      execSync(
        `reg add "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" /v "Edo (TrueType)" /t REG_SZ /d "${winTarget}" /f`,
        { stdio: "ignore" }
      );
      console.log("✔ Windows Registry entries updated for 'Edo' and 'Edo SZ'");
    } catch (e) {
      console.warn("Notice: Windows Registry update warning:", e.message);
    }
  }
} else {
  // Linux (Ubuntu 24.04 / Debian / RHEL)
  const homeDir = os.homedir();
  const linuxFontDirs = [
    path.join(homeDir, ".local", "share", "fonts"),
    path.join(homeDir, ".fonts"),
  ];

  for (const dir of linuxFontDirs) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(src, path.join(dir, "edosz.ttf"));
      console.log(`✔ Copied to Linux font directory: ${path.join(dir, "edosz.ttf")}`);
    } catch (err) {
      console.warn(`Notice: Could not copy to ${dir}:`, err.message);
    }
  }

  // Refresh fontconfig cache so FFmpeg / libass can resolve 'Edo SZ'
  try {
    execSync("fc-cache -f", { stdio: "ignore" });
    console.log("✔ Successfully refreshed fontconfig cache (fc-cache -f)");
  } catch {
    console.warn("Notice: 'fc-cache' not found. Run 'sudo apt install fontconfig' on Ubuntu 24.04.");
  }
}

console.log("✔ Edo font installation complete!");
