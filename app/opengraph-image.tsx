import { ImageResponse } from "next/og";

// Social preview for the home page (and the default for pages without their own).
export const alt = "PathIITR: career and academic guidance for IIT Roorkee students";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "#0b1f3a",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px", fontSize: 44, fontWeight: 700 }}>
          <div style={{ width: 20, height: 20, borderRadius: 10, background: "#e8a33d" }} />
          PathIITR
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 960 }}>
            Plan your path at IIT Roorkee, from first year to placement.
          </div>
          <div style={{ fontSize: 30, color: "rgba(255,255,255,0.75)" }}>
            Careers, skills, electives and semester plans, with sources.
          </div>
        </div>
        <div style={{ display: "flex", height: 8, width: 240, borderRadius: 4, background: "#e8a33d" }} />
      </div>
    ),
    size,
  );
}
