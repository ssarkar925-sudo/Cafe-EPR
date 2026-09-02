import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #c026d3 100%)",
          borderRadius: 42,
          color: "white",
          fontSize: 112,
          fontWeight: 800,
          fontFamily: "Arial",
        }}
      >
        C
      </div>
    ),
    { width: 192, height: 192 }
  );
}
