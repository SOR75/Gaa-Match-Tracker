import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Precache every built asset before an app version is available offline.
// Each build gets its own cache, so an update cannot mix old and new bundles.
export default defineConfig({
  plugins: [
    {
      name: "sideline-offline-shell",
      closeBundle() {
        const dist = resolve("dist");
        const assets = readdirSync(resolve(dist, "assets")).map(
          (file) => `/assets/${file}`,
        );
        const source = readFileSync(resolve("public/sw.js"), "utf8");
        const revision = createHash("sha256")
          .update(assets.join("|") + readFileSync(resolve(dist, "index.html")))
          .update(source)
          .digest("hex")
          .slice(0, 12);
        writeFileSync(
          resolve(dist, "sw.js"),
          source
            .replace("__BUILD_VERSION__", revision)
            .replace("/* __PRECACHE_ASSETS__ */", assets.map(asset => JSON.stringify(asset)).join(",") + ","),
        );
      },
    },
  ],
});
