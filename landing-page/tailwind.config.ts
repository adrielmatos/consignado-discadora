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
        navy: {
          950: "#040814",
          900: "#070e22",
          850: "#0b1533",
          800: "#0f1d47",
          700: "#162b69",
          600: "#1d3b90",
        },
        brand: {
          royal: "#1e40af",
          blue: "#2563eb",
          electric: "#3b82f6",
          cyan: "#06b6d4",
        },
        cta: {
          yellow: "#f59e0b",
          amber: "#d97706",
          orange: "#ea580c",
          gold: "#eab308",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        "cta-glow": "0 0 25px -5px rgba(245, 158, 11, 0.45), 0 8px 10px -6px rgba(234, 88, 12, 0.3)",
        "blue-glow": "0 0 35px -5px rgba(37, 99, 235, 0.35)",
        "card-glow": "0 0 20px 0 rgba(30, 64, 175, 0.15)",
      },
      animation: {
        "pulse-subtle": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
