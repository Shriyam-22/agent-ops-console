import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070A14",
          900: "#0B0F1E",
          850: "#0F1428",
          800: "#141A33",
          700: "#1E2546",
          600: "#2A3260",
        },
        fog: {
          100: "#E8EAF4",
          300: "#A3A9C7",
          500: "#6B7194",
          700: "#4A5070",
        },
        lime: { DEFAULT: "#C6FF3D", dim: "#9BCB2A" },
        violet: { DEFAULT: "#9D8FFF", dim: "#7C6CFF" },
        coral: "#FF8A65",
        amber: "#FFC857",
        danger: "#FF5C7A",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
