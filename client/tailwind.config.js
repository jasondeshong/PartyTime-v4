/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        surface: "#161616",
        "surface-light": "#222222",
        border: "#2a2a2a",
        accent: "#c96442",
        "accent-hover": "#b5573a",
        muted: "#888888",
      },
    },
  },
  plugins: [],
};
