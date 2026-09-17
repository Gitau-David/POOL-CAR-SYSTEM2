import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B1220",
        surface: "#131B2E",
        surface2: "#1B2740",
        border: "#24314D",
        ink: "#E5EAF3",
        muted: "#8A94A8",
        teal: "#2DD4BF",
        amber: "#F5A524",
        red: "#F16565",
        blue: "#5B9CF6",
      },
      fontFamily: {
        head: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
