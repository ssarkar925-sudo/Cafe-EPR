const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#4f46e5"/><text x="32" y="45" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="800" fill="#fff">C</text></svg>`;

export async function GET() {
  return new Response(ICON_SVG, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
