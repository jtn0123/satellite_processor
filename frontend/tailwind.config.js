/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#06b6d4',
          dark: '#0891b2',
          light: '#22d3ee',
        },
        // Satellite-themed palette
        space: {
          950: '#020617',
          900: '#0a1628',
          850: '#0f1d32',
          800: '#132240',
          750: '#1a2d4d',
          700: '#1e3a5f',
          600: '#254d7a',
          500: '#2d6094',
        },
        accent: {
          cyan: '#22d3ee',
          blue: '#3b82f6',
          indigo: '#6366f1',
          glow: '#06b6d4',
        },
      },
      backgroundColor: {
        card: '#0f1d32',
        'card-hover': '#132240',
      },
      borderColor: {
        subtle: '#1e3a5f',
      },
    },
  },
  plugins: [],
};
