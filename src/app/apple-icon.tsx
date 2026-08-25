import { ImageResponse } from "next/og";

/**
 * Raster app icon for Apple devices.
 *
 * icon.svg covers browsers that render SVG favicons; apple-touch-icon only
 * accepts a raster image, so this one is generated rather than hand-drawn as
 * a binary asset.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="120" height="120">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0dca0"/>
      <stop offset="100%" stop-color="#c9a227"/>
    </linearGradient>
  </defs>
  <path d="M6.5 22 L12.5 14.5 L18 19 L25.5 8.5" fill="none" stroke="url(#g)" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="12.5" cy="14.5" r="2.3" fill="url(#g)"/>
  <circle cx="18" cy="19" r="2.3" fill="url(#g)"/>
</svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d0f14",
        }}
      >
        {/* Satori wants numeric dimensions — string attributes are rejected
            and the image pipeline then fails outright. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          style={{ width: 120, height: 120 }}
          src={`data:image/svg+xml;base64,${Buffer.from(MARK).toString("base64")}`}
        />
      </div>
    ),
    { ...size },
  );
}
