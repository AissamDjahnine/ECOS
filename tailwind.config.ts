import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#e0f4f4",
          100: "#b3e3e3",
          200: "#80d0d0",
          300: "#4dbdbd",
          400: "#26aeae",
          500: "#008282",
          600: "#006767",
          700: "#004f4f",
          800: "#003838",
          900: "#002424",
        },
        slate: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },
        // Material Design 3 color tokens (used by HomePage)
        m3: {
          primary: '#006767',
          'primary-cont': '#008282',
          'primary-fixed': '#8cf3f3',
          secondary: '#416564',
          tertiary: '#8f4922',
          error: '#ba1a1a',
          surface: '#f7f9fe',
          'on-surface': '#181c20',
          'on-surface-var': '#3d4949',
          'outline-var': '#bcc9c8',
        },
        // Keep clinic colors for backward compatibility
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
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        manrope: ['Manrope', 'system-ui', 'sans-serif'],
        inter: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 2px 8px rgba(15, 23, 42, 0.06)',
        'panel': '0 4px 24px rgba(15, 23, 42, 0.08)',
        'elevated': '0 8px 40px rgba(15, 23, 42, 0.12)',
        'glow': '0 0 40px rgba(0, 103, 103, 0.15)',
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'pulse-ring': 'pulse-ring 1.5s ease-out infinite',
        'wave': 'wave 1s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
