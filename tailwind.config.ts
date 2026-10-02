import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        growthos: {
          bg: "#0a0a0f",
          surface: "#12121a",
          border: "#1e1e2e",
          text: "#e4e4ef",
          muted: "#6b7280",
          accent: "#6366f1",
          "accent-hover": "#818cf8",
          success: "#22c55e",
          warning: "#eab308",
          danger: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};

export default config;
