#!/usr/bin/env node
/**
 * One-time data scraper for Warp Records releases.
 *
 *   node scripts/fetch-warp-data.mjs
 *
 * Outputs:
 *   public/covers/<mbid>.jpg          — 500 px front cover thumbnails
 *   src/app/data/warp-releases.json   — release metadata
 */

import { writeFile, mkdir, access } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const UA = "PhotoArchiveApp/1.0 (kirillginko@gmail.com)";
const PAGE_SIZE = 100;
const MAX_RELEASES = 600;
const MB_SLEEP_MS = 1200;
const IMG_BATCH = 12;

const COVERS_DIR = join(ROOT, "public", "covers");
const DATA_DIR = join(ROOT, "src", "app", "data");
const DATA_FILE = join(DATA_DIR, "warp-releases.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true).catch(() => false);

async function mbFetch(path) {
  const url = `https://musicbrainz.org/ws/2${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`MusicBrainz ${res.status} for ${url}\n  ${body}`);
  }
  return res.json();
}

// ── Step 1: find Warp Records label MBID ─────────────────────────────────────
// MusicBrainz registers the main Warp Records catalog as "Warp" with
// label-code 2070. We prefer that entry; if not found we fall back to the
// known stable MBID.
const WARP_FALLBACK_ID = "46f0f4cd-8aab-4b33-b698-f459faf64190";

async function findWarpLabelId() {
  console.log("🔍  Searching for Warp Records label (code 2070)…");
  const data = await mbFetch(`/label?query=warp&fmt=json&limit=15`);
  const labels = data.labels ?? [];

  // The real Warp Records catalog has label-code 2070
  const byCode = labels.find((l) => l["label-code"] === 2070);
  if (byCode) {
    console.log(`   Found: "${byCode.name}" (${byCode.id})  label-code=2070`);
    return byCode.id;
  }

  console.log(`   Label-code 2070 not in search results — using known MBID`);
  return WARP_FALLBACK_ID;
}

// ── Step 2: paginate releases for the label ───────────────────────────────────

async function fetchReleasePage(labelId, offset) {
  return mbFetch(
    `/release?label=${labelId}&fmt=json&limit=${PAGE_SIZE}&offset=${offset}&inc=artist-credits`
  );
}

async function fetchAllReleases(labelId) {
  console.log("\n📡  Fetching releases from MusicBrainz…");
  const first = await fetchReleasePage(labelId, 0);
  const totalAvailable = first["release-count"] ?? 0;
  const totalToFetch = Math.min(totalAvailable, MAX_RELEASES);
  const pages = Math.ceil(totalToFetch / PAGE_SIZE);

  console.log(
    `   ${totalAvailable} total on label — fetching up to ${totalToFetch} (${pages} pages)`
  );

  const all = [...(first.releases ?? [])];

  for (let p = 1; p < pages; p++) {
    await sleep(MB_SLEEP_MS);
    process.stdout.write(`   page ${p + 1}/${pages}…\r`);
    try {
      const { releases } = await fetchReleasePage(labelId, p * PAGE_SIZE);
      all.push(...(releases ?? []));
    } catch (err) {
      console.warn(`\n   ⚠  page ${p + 1} failed, continuing: ${err.message}`);
    }
  }

  console.log(`   Fetched ${all.length} releases total\n`);
  return all;
}

// ── Step 3: download cover images ────────────────────────────────────────────

async function downloadCover(mbid) {
  const dest = join(COVERS_DIR, `${mbid}.jpg`);
  if (await exists(dest)) return true;

  try {
    const res = await fetch(
      `https://coverartarchive.org/release/${mbid}/front-500`,
      { headers: { "User-Agent": UA }, redirect: "follow" }
    );
    if (!res.ok) return false;
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

async function downloadAll(releases) {
  console.log(`🎨  Downloading covers for ${releases.length} releases…`);
  let ok = 0, fail = 0;

  for (let i = 0; i < releases.length; i += IMG_BATCH) {
    const batch = releases.slice(i, i + IMG_BATCH);
    const results = await Promise.all(batch.map((r) => downloadCover(r.id)));
    results.forEach((s) => (s ? ok++ : fail++));

    const done = Math.min(i + IMG_BATCH, releases.length);
    const pct = Math.round((done / releases.length) * 100);
    process.stdout.write(
      `   ${done}/${releases.length}  ${pct}%  ✓ ${ok}  ✗ ${fail}     \r`
    );
  }
  console.log(`\n   Finished: ${ok} saved, ${fail} unavailable\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(COVERS_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });

  const labelId = await findWarpLabelId();

  const allReleases = await fetchAllReleases(labelId);

  // Try downloading art for every release — 404s are silently skipped
  console.log(`   Attempting cover art for all ${allReleases.length} releases\n`);
  await downloadAll(allReleases);

  // Only include releases whose image actually landed on disk
  const releases = [];
  for (const r of allReleases) {
    if (await exists(join(COVERS_DIR, `${r.id}.jpg`))) {
      releases.push({
        mbid: r.id,
        title: r.title,
        artist:
          r["artist-credit"]?.[0]?.name ??
          r["artist-credit"]?.[0]?.artist?.name ??
          "Various Artists",
        date: r.date ?? "",
        coverUrl: `/covers/${r.id}.jpg`,
      });
    }
  }

  await writeFile(DATA_FILE, JSON.stringify(releases, null, 2));
  console.log(`✅  ${releases.length} releases saved`);
  console.log(`   JSON  → src/app/data/warp-releases.json`);
  console.log(`   Art   → public/covers/  (${releases.length} × .jpg)`);
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err.message);
  process.exit(1);
});
