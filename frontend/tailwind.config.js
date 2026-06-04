/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // CSS-variable driven — preserves opacity modifiers (bg-navy-800/50, etc.)
        navy: {
          950: 'rgb(var(--navy-950) / <alpha-value>)',
          900: 'rgb(var(--navy-900) / <alpha-value>)',
          800: 'rgb(var(--navy-800) / <alpha-value>)',
          700: 'rgb(var(--navy-700) / <alpha-value>)',
          600: 'rgb(var(--navy-600) / <alpha-value>)',
        },
        ocean: {
          400: 'rgb(var(--ocean-400) / <alpha-value>)',
          500: 'rgb(var(--ocean-500) / <alpha-value>)',
          600: 'rgb(var(--ocean-600) / <alpha-value>)',
          900: 'rgb(var(--ocean-900) / <alpha-value>)',
        },
        coral: '#ff6b6b',
        seafoam: '#48cae4',
      },
    },
  },
  plugins: [],
};
