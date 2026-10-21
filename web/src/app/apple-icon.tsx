import { ImageResponse } from "next/og";

// iPhone home-screen icon (iOS ignores SVG icons).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#e8833a", color: "#000", fontSize: 80, fontWeight: 900 }}>HW</div>,
    size,
  );
}
