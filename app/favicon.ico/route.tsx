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
          background: "#4f46e5",
          borderRadius: 14,
          color: "white",
          fontSize: 48,
          fontWeight: 800,
          fontFamily: "Arial",
        }}
      >
        C
      </div>
    ),
    { width: 64, height: 64 }
  );
}
