import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        action: {
          DEFAULT: "#7B2FF7",
          hover: "#6620E0",
          light: "#F3EEFF",
        },
        brand: {
          DEFAULT: "#3B1E8C",
          light: "#5B2FC2",
        },
        accent: {
          blue: "#2E9BF5",
          orange: "#FF9233",
        },
        doravia: {
          text: "#2D1660",
          muted: "#6E6592",
          surface: "#F8F5FE",
          border: "#E9E1FB",
          highlight: "#FDF0E3",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
