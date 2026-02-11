/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0b0c0e',
        surface: '#161719',
        border: '#2e2e32',
        muted: '#707070',
        accent: '#505050',
      },
      fontFamily: {
        sans: ["'JetBrains Mono'", "'Fira Code'", "'Consolas'", "monospace"],
        mono: ["'JetBrains Mono'", "'Fira Code'", "'Consolas'", "monospace"],
      },
    },
  },
  plugins: [],
}
