/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0a1628',
          800: '#0d2137',
          700: '#0f2d4a',
          600: '#134060',
        },
        ocean: {
          400: '#00b4d8',
          500: '#0096b7',
          600: '#007a96',
        },
        coral: '#ff6b6b',
        seafoam: '#48cae4',
      },
    },
  },
  plugins: [],
};
