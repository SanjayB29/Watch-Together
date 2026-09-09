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
        background: "#090A0F",
        surface: "#111420",
        "surface-light": "#1B2032",
        "surface-border": "#28304B",
        primary: {
          DEFAULT: "#6366F1", // Indigo
          hover: "#4F46E5",
          purple: "#8B5CF6", // Purple accent
        },
        cinema: {
          bg: "#050608",
          card: "#0D111C",
          border: "#1E2638",
        }
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "hero-glow": "radial-gradient(circle at 50% 20%, rgba(99, 102, 241, 0.18) 0%, rgba(139, 92, 246, 0.08) 40%, rgba(9, 10, 15, 0) 80%)",
        "cinema-glow": "radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.25) 0%, rgba(9, 10, 15, 0) 70%)",
      },
    },
  },
  plugins: [],
};
export default config;
