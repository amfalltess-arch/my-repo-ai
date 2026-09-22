import type { Config } from "tailwindcss";

// Design tokens for AI ClipFlow.
//
// The product's core act is turning one long timeline into many scored,
// vertical fragments — so the palette and shapes lean into that: a dark
// signal-room base (this is a tool people stare at while judging footage,
// same reasoning editors have for dark NLEs), a cool "signal" teal for
// interactive/active states, and a warm "score" amber reserved for AI
// confidence and highlights so it reads as meaningful, not decorative.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: "#0A0C0F",
          raised: "#121519",
          surface: "#181C21",
          elevated: "#1F242B",
          border: "#272D35",
          "border-strong": "#343B45",
        },
        ink: {
          DEFAULT: "#EDF0F3",
          muted: "#9CA6B2",
          faint: "#5C6570",
        },
        signal: {
          DEFAULT: "#31D6C2",
          dim: "#1E8F82",
          bg: "#0F2926",
        },
        score: {
          high: "#31D6C2",
          mid: "#F2B84B",
          low: "#6B7280",
          bg: "#241C0F",
        },
        danger: {
          DEFAULT: "#F2555A",
          bg: "#2A1315",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "10px",
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset",
      },
    },
  },
  plugins: [],
};

export default config;
