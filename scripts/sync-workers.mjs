#!/usr/bin/env node
/**
 * sync-workers.mjs — keep public/dvai-*.worker.js in sync with the
 * @westenets/dvai-bridge-core dist that's currently installed.
 *
 * The bridge runs Gemma 4 (and the embedder) inside a Web Worker. Next.js
 * serves /dvai-transformers.worker.js and /dvai-webllm.worker.js from /public,
 * so on every install we copy the fresh worker bundles out of node_modules.
 *
 * Wired as `postinstall` in package.json — runs automatically after every
 * `pnpm install`. Idempotent, and silently skips if node_modules isn't
 * populated yet (e.g. during a fresh clone before `pnpm install`).
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const WORKERS = ["dvai-transformers.worker.js", "dvai-webllm.worker.js"];
const SRC_DIR = join(
    root,
    "node_modules",
    "@westenets",
    "dvai-bridge-core",
    "dist",
);
const DST_DIR = join(root, "public");

async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

async function main() {
    if (!(await exists(SRC_DIR))) {
        console.log(
            "[sync-workers] @westenets/dvai-bridge-core dist not found; skipping " +
                "(run `pnpm install` first).",
        );
        return;
    }
    await mkdir(DST_DIR, { recursive: true });

    let copied = 0;
    for (const worker of WORKERS) {
        const src = join(SRC_DIR, worker);
        const dst = join(DST_DIR, worker);
        if (!(await exists(src))) {
            console.warn(`[sync-workers] missing in dist: ${worker} (skipped)`);
            continue;
        }
        try {
            await copyFile(src, dst);
            copied++;
        } catch (err) {
            console.warn(`[sync-workers] failed to copy ${worker}: ${err.message}`);
        }
    }
    console.log(`[sync-workers] copied ${copied}/${WORKERS.length} workers to public/`);
}

main().catch((err) => {
    // Never fail the install on this script — workers can be re-synced manually.
    console.warn(`[sync-workers] error: ${err.message}`);
    process.exit(0);
});
