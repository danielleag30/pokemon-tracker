/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        pokemon: {
          // Royal blue, the app icon's colour: highlights only (active state,
          // progress, selected chips). Main buttons are yellow; bars are navy.
          blue: '#4169E1',
          yellow: '#FFCB05',
          red: '#CC0000',
          dark: '#1E1B4B',
          nav: '#16133A',
        },
      },
      fontFamily: {
        pokemon: ['"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-soft': 'pulse 2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
