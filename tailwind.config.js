/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        brand: {
          50: '#eefbf5', 100: '#d6f5e8', 200: '#b0e8d4', 300: '#7dd5bb', 400: '#4ab99c', 500: '#279c81',
          600: '#187f68', 700: '#166757', 800: '#155146', 900: '#13443c', 950: '#072720',
        },
        ink: {
          50: '#f6f7f6', 100: '#e9edeb', 200: '#d3d9d6', 300: '#b1bab5', 400: '#88948e', 500: '#6c7973',
          600: '#56615c', 700: '#47504c', 800: '#3c433f', 900: '#1d2220', 950: '#101413',
        },
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .4s cubic-bezier(.2,.8,.2,1) both',
        'fade-in': 'fade-in .3s ease-out both',
        'slide-in': 'slide-in .32s cubic-bezier(.2,.8,.2,1) both',
        'scale-in': 'scale-in .22s cubic-bezier(.2,.8,.2,1) both',
        'shimmer': 'shimmer 1.6s linear infinite',
        'float': 'float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
