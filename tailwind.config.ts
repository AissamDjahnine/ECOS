import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        clinic: {
          50: "#f4fbfb",
          100: "#dbefef",
          200: "#b7dcdc",
          300: "#8ebebe",
          400: "#679f9f",
          500: "#4d8486",
          600: "#3a6769",
          700: "#315355",
          800: "#2a4446",
          900: "#25393a"
        }
      },
      boxShadow: {
        panel: "0 16px 40px rgba(25, 48, 61, 0.12)"
      },
      fontFamily: {
        sans: ["\"IBM Plex Sans\"", "system-ui", "sans-serif"],
        display: ["\"Fraunces\"", "Georgia", "serif"]
      }
    },
  },
  plugins: [],
} satisfies Config;
