/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      colors: {
        brand: {
          50: '#effaf6', 100: '#d7f2e7', 200: '#b1e4d2', 300: '#7ecfb6', 400: '#49b396', 500: '#26977b',
          600: '#187a64', 700: '#156253', 800: '#144e44', 900: '#124139', 950: '#082520',
        },
        ink: {
          50: '#f6f7f6', 100: '#e8ebe9', 200: '#d2d7d4', 300: '#b0b9b4', 400: '#87938d', 500: '#6b7872',
          600: '#55605b', 700: '#464f4b', 800: '#3b423f', 900: '#1c211f', 950: '#0f1311',
        },
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'slide-in': { '0%': { transform: 'translateX(100%)' }, '100%': { transform: 'translateX(0)' } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        'slide-in': 'slide-in .3s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
};
