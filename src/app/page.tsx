// Server component — reads local JSON at render time, zero client-side fetches.
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import PhotoArchive from "./components/PhotoArchive/PhotoArchive";
import type { WarpRelease } from "./types/warp";

function loadReleases(): WarpRelease[] {
  const file = join(process.cwd(), "src", "app", "data", "warp-releases.json");
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as WarpRelease[];
  } catch {
    return [];
  }
}

export default function Home() {
  const releases = loadReleases();
  return <PhotoArchive initialReleases={releases} />;
}
