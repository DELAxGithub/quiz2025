import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0066CC",
          foreground: "#FFFFFF",
        },
        secondary: {
          DEFAULT: "#FFD700",
          foreground: "#000000",
        },
        accent: {
          DEFAULT: "#DC143C",
          foreground: "#FFFFFF",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
