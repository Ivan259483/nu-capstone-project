#!/usr/bin/env node
/**
 * Regenerate homepage hero responsive WebP/AVIF from a 3840px-wide source.
 * Requires: npx sharp-cli (pulled on demand)
 *
 * Usage: node scripts/optimize-hero-images.mjs
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "public/images/hero");
const sourceUrl =
    "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?q=82&w=3840&auto=format&fit=crop";
const sourceFile = path.join(outDir, "hero-source.jpg");

const variants = [
    { name: "mobile", width: 768, webpQ: 80, avifQ: 75 },
    { name: "tablet", width: 1280, webpQ: 82, avifQ: 77 },
    { name: "desktop", width: 1920, webpQ: 84, avifQ: 79 },
    { name: "desktop-2x", width: 2560, webpQ: 84, avifQ: 79 },
    { name: "4k", width: 3840, webpQ: 85, avifQ: 80 },
];

function run(cmd) {
    execSync(cmd, { stdio: "inherit", cwd: root });
}

function sharpResize(outPath, format, quality, width) {
    const qFlag = format === "webp" ? `-q ${quality}` : `-q ${quality}`;
    run(
        `npx --yes sharp-cli -i "${sourceFile}" -o "${outPath}" -f ${format} ${qFlag} resize ${width} --fit cover --position right --withoutEnlargement`,
    );
}

fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(sourceFile)) {
    console.log("Downloading 3840px source…");
    run(`curl -fsSL "${sourceUrl}" -o "${sourceFile}"`);
}

for (const v of variants) {
    sharpResize(path.join(outDir, `hero-${v.name}.webp`), "webp", v.webpQ, v.width);
    sharpResize(path.join(outDir, `hero-${v.name}.avif`), "avif", v.avifQ, v.width);
}

console.log("Done. Outputs in public/images/hero/");
