import type { MetadataRoute } from "next";

// Lets phones "Add to Home Screen" and open the app full-screen like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hardwood Wire",
    short_name: "Hardwood",
    description: "Personal NBA news, scores, injuries and stats.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0f12",
    theme_color: "#0d0f12",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
