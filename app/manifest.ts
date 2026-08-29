import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CyberCafe ERP & Smart Business Suite",
    short_name: "Cafe ERP",
    description: "Full Point of Sale, Billing, AEPS/DMT & Business Management Suite",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#070a14",
    theme_color: "#4f46e5",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
