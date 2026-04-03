/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f0f0f",
        surface: "#1a1a2e",
        accent: "#e94560",
        "accent-alt": "#0f3460",
      },
    },
  },
  plugins: [],
};
