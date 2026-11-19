/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#373757',
          dark: '#1E1E38',
          light: '#4E4E7B',
        },
      },
      fontFamily: {
        heading: ['system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

