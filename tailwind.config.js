/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F5F6F7',
        ink: '#25292D',
        muted: '#6B7280',
        line: '#DFE2E5',
        brand: { DEFAULT: '#EE6C14', dark: '#C9560B', soft: '#FDE9DA' },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['Figtree', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
