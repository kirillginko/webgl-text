// Proxy for Cover Art Archive images.
// Routes through our server so Three.js TextureLoader has no CORS issues,
// and Next.js caches each image for 24 h.

const UA = "PhotoArchiveApp/1.0 (kirillginko@gmail.com)";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mbid: string }> }
) {
  const { mbid } = await params;

  // Validate mbid is a UUID-like string to prevent SSRF
  if (!/^[0-9a-f-]{36}$/.test(mbid)) {
    return new Response(null, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://coverartarchive.org/release/${mbid}/front-250`,
      {
        headers: { "User-Agent": UA },
        redirect: "follow",
        next: { revalidate: 86400 }, // cache image for 24 h
      }
    );

    if (!res.ok) {
      return new Response(null, { status: 404 });
    }

    const blob = await res.blob();
    const ct = res.headers.get("content-type") ?? "image/jpeg";

    return new Response(blob, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
