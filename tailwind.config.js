export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Avenir Next",
          "Avenir",
          "Hiragino Sans",
          "\"Noto Sans JP\"",
          "Yu Gothic",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "0 20px 60px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};
