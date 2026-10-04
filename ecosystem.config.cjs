module.exports = {
  apps: [
    {
      name: "spark-lyric-studio",
      script: "server.js",
      instances: 1, // Single queue worker for serial video processing
      autorestart: true,
      watch: false,
      max_memory_restart: "800M", // Protect free-tier 1GB/2GB VPS instances from OOM
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "0.0.0.0",
        VIDEO_ENCODER: "auto",
        CPU_PRESET: "veryfast",
        CPU_CRF: "23",
      },
      error_file: "logs/pm2_error.log",
      out_file: "logs/pm2_out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
  ],
};
