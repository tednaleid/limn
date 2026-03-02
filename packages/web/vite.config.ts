import { defineConfig } from "vite";
import { execSync } from "child_process";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const gitSha = execSync("git rev-parse --short HEAD").toString().trim();
const version = process.env.npm_package_version ?? "dev";

export default defineConfig({
  base: "/limn/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "Limn",
        short_name: "Limn",
        description: "Keyboard-first, offline-capable mind map",
        theme_color: "#1e40af",
        background_color: "#f8fafc",
        display: "standalone",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  build: {
    outDir: "dist",
  },
});
