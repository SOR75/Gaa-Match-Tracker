import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
} from "node:fs";
import { resolve } from "node:path";

const sourceInfo = (() => {
  let sourceCommit = /^[a-f0-9]{40}$/i.test(process.env.COMMIT_REF || "") ? process.env.COMMIT_REF : "unknown";
  let sourceDirty = null;
  try {
    if (sourceCommit === "unknown") sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    sourceDirty = Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim());
  } catch { /* Source ZIPs can build without Git; never manufacture a revision. */ }
  return { sourceCommit, sourceDirty };
})();
const buildMetadata = JSON.parse(readFileSync(resolve("public/build-info.json"), "utf8"));
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
  define: {
    "import.meta.env.VITE_BUILD_COMMIT": JSON.stringify(sourceInfo.sourceCommit),
    "import.meta.env.VITE_BUILD_DIRTY": JSON.stringify(sourceInfo.sourceDirty),
  },
  plugins: [
    {
      name: "sideline-offline-shell",
      configureServer(server) {
        server.httpServer?.once("listening", () =>
          server.config.logger.info(
            `[Sideline V${buildMetadata.version}] Project root: ${server.config.root}`,
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
          .update(JSON.stringify(sourceInfo))
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
        writeFileSync(resolve(dist, "build-info.json"), JSON.stringify({
          ...buildMetadata, ...sourceInfo, assetRevision: revision,
        }, null, 2) + "\n");
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
