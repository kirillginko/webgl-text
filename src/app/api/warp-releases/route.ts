// Fallback API route — serves the locally-scraped JSON.
// The primary path is server-side props from page.tsx (no fetch at all).
// Run `node scripts/fetch-warp-data.mjs` to populate the data first.
import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { WarpRelease } from "@/app/types/warp";

export { type WarpRelease };

export const dynamic = "force-static";

export async function GET() {
  const file = join(process.cwd(), "src", "app", "data", "warp-releases.json");
  if (!existsSync(file)) {
    return NextResponse.json([], {
      headers: { "X-Hint": "Run: node scripts/fetch-warp-data.mjs" },
    });
  }
  try {
    const releases = JSON.parse(readFileSync(file, "utf-8")) as WarpRelease[];
    return NextResponse.json(releases, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
