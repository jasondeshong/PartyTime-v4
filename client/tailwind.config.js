/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#080808",
        surface: "#121210",
        "surface-light": "#1a1a18",
        border: "#1e1e1c",
        accent: "#D4884A",
        "accent-hover": "#c47a3e",
        muted: "#888888",
        papyrus: "#F0ECE4",
        amber: "#D4884A",
        scarab: "#E05555",
        spotify: "#1DB954",
      },
    },
  },
  plugins: [],
};
