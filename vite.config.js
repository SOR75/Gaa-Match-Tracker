import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { resolve } from "node:path";

const ocrFiles = {
  "worker.min.js": "node_modules/tesseract.js/dist/worker.min.js",
  "eng.traineddata.gz":
    "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  ...Object.fromEntries(
    ["lstm", "simd-lstm", "relaxedsimd-lstm"].map((kind) => [
      `tesseract-core-${kind}.wasm.js`,
      `node_modules/tesseract.js-core/tesseract-core-${kind}.wasm.js`,
    ]),
  ),
};
// Precache every built asset before an app version is available offline.
// Each build gets its own cache, so an update cannot mix old and new bundles.
export default defineConfig({
  plugins: [
    {
      name: "sideline-offline-shell",
      configureServer(server) {
        server.httpServer?.once("listening", () =>
          server.config.logger.info(
            `[Sideline V0.3.4] Project root: ${server.config.root}`,
          ),
        );
        server.middlewares.use((req, res, next) => {
          const name = req.url?.split("?")[0].replace(/^\/ocr\//, "");
          if (!req.url?.startsWith("/ocr/") || !ocrFiles[name]) return next();
          res.setHeader(
            "Content-Type",
            name.endsWith(".js")
              ? "application/javascript"
              : "application/octet-stream",
          );
          res.end(readFileSync(resolve(ocrFiles[name])));
        });
      },
      closeBundle() {
        const dist = resolve("dist");
        mkdirSync(resolve(dist, "ocr"), { recursive: true });
        for (const [name, path] of Object.entries(ocrFiles))
          copyFileSync(resolve(path), resolve(dist, "ocr", name));
        const assets = readdirSync(resolve(dist, "assets")).map(
          (file) => `/assets/${file}`,
        );
        assets.push(...Object.keys(ocrFiles).map((name) => `/ocr/${name}`));
        const source = readFileSync(resolve("public/sw.js"), "utf8");
        const revision = createHash("sha256")
          .update(assets.join("|") + readFileSync(resolve(dist, "index.html")))
          .update(source)
          .update(
            Object.values(ocrFiles)
              .map((path) =>
                createHash("sha256")
                  .update(readFileSync(resolve(path)))
                  .digest("hex"),
              )
              .join("|"),
          )
          .digest("hex")
          .slice(0, 12);
        writeFileSync(
          resolve(dist, "sw.js"),
          source
            .replace("__BUILD_VERSION__", revision)
            .replace(
              "/* __PRECACHE_ASSETS__ */",
              assets.map((asset) => JSON.stringify(asset)).join(",") + ",",
            ),
        );
      },
    },
  ],
});
