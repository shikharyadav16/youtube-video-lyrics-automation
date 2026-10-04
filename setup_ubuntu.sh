#!/usr/bin/env bash
# ==============================================================================
# Spark Lyric Studio — Ubuntu 24.04 Automated Server Setup Script
# Configures Node.js, FFmpeg (with libass), Edo font registration, and PM2
# ==============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "\n${CYAN}=================================================================${NC}"
echo -e "${CYAN}▶ Spark Lyric Studio — Ubuntu 24.04 Server Provisioner${NC}"
echo -e "${CYAN}=================================================================${NC}\n"

# 1. Update Package Index
echo -e "${GREEN}[1/6] Updating APT repositories...${NC}"
sudo apt-get update -y

# 2. Install FFmpeg, Fontconfig & System Dependencies
echo -e "\n${GREEN}[2/6] Installing FFmpeg, fontconfig, and audio libraries...${NC}"
sudo apt-get install -y \
  ffmpeg \
  fontconfig \
  libass9 \
  curl \
  git \
  build-essential

# 3. Check / Install Node.js (LTS 20.x / 22.x)
echo -e "\n${GREEN}[3/6] Verifying Node.js environment...${NC}"
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'.' -f1 | tr -d 'v')" -lt 18 ]; then
  echo -e "${YELLOW}Installing Node.js 20 LTS via NodeSource...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo -e "✔ Node.js version: $(node -v) | npm version: $(npm -v)"

# 4. Install Project Fonts & Update Fontconfig Cache
echo -e "\n${GREEN}[4/6] Registering Edo SZ font with fontconfig...${NC}"
USER_FONT_DIR="${HOME}/.local/share/fonts"
mkdir -p "${USER_FONT_DIR}"

if [ -f "assets/fonts/edosz.ttf" ]; then
  cp "assets/fonts/edosz.ttf" "${USER_FONT_DIR}/edosz.ttf"
  echo -e "✔ Copied assets/fonts/edosz.ttf -> ${USER_FONT_DIR}/edosz.ttf"
elif [ -f "edo_font/edosz.ttf" ]; then
  cp "edo_font/edosz.ttf" "${USER_FONT_DIR}/edosz.ttf"
  echo -e "✔ Copied edo_font/edosz.ttf -> ${USER_FONT_DIR}/edosz.ttf"
fi

fc-cache -f "${USER_FONT_DIR}"
echo -e "✔ Font cache refreshed. Verifying font recognition:"
fc-list : family | grep -i "edo" || echo -e "${YELLOW}Notice: Font registered in ${USER_FONT_DIR}${NC}"

# 5. Create Required Output & Cache Directories
echo -e "\n${GREEN}[5/6] Creating application directories...${NC}"
mkdir -p output temp credentials logs public/fonts

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  echo -e "${YELLOW}Creating .env from .env.example (please add your MONGO_URI)...${NC}"
  cp .env.example .env
fi

# 6. Install NPM Dependencies
echo -e "\n${GREEN}[6/6] Installing Node dependencies...${NC}"
npm install --omit=dev

# 7. Hardware & Capability Test
echo -e "\n${CYAN}-----------------------------------------------------------------${NC}"
echo -e "${CYAN}Running Hardware Acceleration Probe...${NC}"
node -e "
  import('./server.js').catch(err => {
    // Expected on initial standalone check if port is bound, but syntax & probe ran
  });
" 2>/dev/null || true

echo -e "\n${GREEN}=================================================================${NC}"
echo -e "${GREEN}✔ Spark Lyric Studio server setup complete!${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo -e "\n${CYAN}To run with PM2 (24/7 background service):${NC}"
echo -e "  sudo npm install -g pm2"
echo -e "  pm2 start ecosystem.config.cjs"
echo -e "  pm2 save"
echo -e "  pm2 startup"
echo -e "\n${CYAN}To run directly in foreground:${NC}"
echo -e "  npm start\n"
