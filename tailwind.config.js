/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // 深色商务风调色板
        ink: {
          950: "#0a0a0b",
          900: "#111114",
          850: "#16161a",
          800: "#1c1c22",
          700: "#26262e",
          600: "#34343f",
        },
        accent: {
          DEFAULT: "#10b981",
          soft: "#34d399",
        },
      },
      keyframes: {
        ripple: {
          "0%": { transform: "scale(1)", opacity: "0.55" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        pulseSoft: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.04)" },
        },
        breathe: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(16,185,129,0.45)" },
          "50%": { boxShadow: "0 0 0 14px rgba(16,185,129,0)" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        ripple: "ripple 1.8s ease-out infinite",
        pulseSoft: "pulseSoft 2.4s ease-in-out infinite",
        breathe: "breathe 2.2s ease-in-out infinite",
        fadeUp: "fadeUp 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
