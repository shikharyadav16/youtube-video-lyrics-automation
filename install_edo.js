import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const src = path.resolve("edo_font", "edosz.ttf");
if (!fs.existsSync(src)) {
  console.error("Source edosz.ttf not found at", src);
  process.exit(1);
}

// 1. Copy to public/fonts/ for browser @font-face
const pubDir = path.resolve("public", "fonts");
if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
fs.copyFileSync(src, path.join(pubDir, "edosz.ttf"));
console.log("Copied to public/fonts/edosz.ttf");

// 2. Copy to assets/fonts/ for local font lookup
const assetDir = path.resolve("assets", "fonts");
if (!fs.existsSync(assetDir)) fs.mkdirSync(assetDir, { recursive: true });
fs.copyFileSync(src, path.join(assetDir, "edosz.ttf"));
console.log("Copied to assets/fonts/edosz.ttf");

// 3. Copy to Windows user fonts directory
const winFontsDir = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Windows", "Fonts");
if (fs.existsSync(winFontsDir)) {
  const winTarget = path.join(winFontsDir, "edosz.ttf");
  fs.copyFileSync(src, winTarget);
  console.log("Copied to Windows Fonts dir:", winTarget);

  try {
    execSync(`reg add "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" /v "Edo SZ (TrueType)" /t REG_SZ /d "${winTarget}" /f`);
    execSync(`reg add "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" /v "Edo (TrueType)" /t REG_SZ /d "${winTarget}" /f`);
    console.log("Registry entries created for Edo and Edo SZ");
  } catch (e) {
    console.warn("Registry update error:", e.message);
  }
}
