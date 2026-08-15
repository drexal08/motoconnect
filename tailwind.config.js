/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './admin.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // §7.2 — Primary: Deep Emerald Green, scale generated from #0B6E4F
        emerald: {
          50: '#e7f5f0',
          100: '#c8e9dd',
          200: '#98d4be',
          300: '#64bb9c',
          400: '#3aa07c',
          500: '#1f8763',
          600: '#0b6e4f',
          700: '#0a5c43',
          800: '#084a36',
          900: '#063829',
          950: '#03241b',
        },
        // §7.2 — Secondary: Amber Yellow, scale generated from #F5A623
        amber: {
          50: '#fef9ec',
          100: '#fcefca',
          200: '#f9de97',
          300: '#f7cb62',
          400: '#f6b83c',
          500: '#f5a623',
          600: '#d98e18',
          700: '#b67412',
          800: '#8a5610',
          900: '#6b420e',
          950: '#3f2608',
        },
        // §7.2 — Neutrals
        surface: {
          DEFAULT: '#fafaf8',   // off-white background
          card: '#ffffff',
          raised: '#ffffff',
        },
        // §7.2 — Neutrals.
        //
        // `ink` at reduced opacity was used for secondary text throughout, which
        // measured 2.4:1 to 3.7:1 against white — well under the 4.5:1 the
        // standard requires, and this app is read outdoors in Kigali sunlight
        // where faint grey is the first thing to disappear. These two tokens
        // replace those opacities and are contrast-checked against #ffffff.
        ink: {
          DEFAULT: '#1f2421',   // charcoal text — 15.4:1
          muted: '#5f6763',     // secondary text — 5.8:1, passes AA
          subtle: '#6e7773',    // tertiary text and hints — 4.6:1, passes AA
        },
        primary: {
          DEFAULT: '#0b6e4f',
          50: '#e7f5f0',
          100: '#c8e9dd',
          200: '#98d4be',
          300: '#64bb9c',
          400: '#3aa07c',
          500: '#1f8763',
          600: '#0b6e4f',
          700: '#0a5c43',
          800: '#084a36',
          900: '#063829',
          950: '#03241b',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#f5a623',
          foreground: '#1f2421',
        },
        accent: {
          DEFAULT: '#f5a623',
          foreground: '#1f2421',
        },
        destructive: {
          DEFAULT: '#c43d2f',
          foreground: '#ffffff',
        },
        border: '#e5e6e2',
        input: '#e5e6e2',
        ring: '#0b6e4f',
        background: '#fafaf8',
        foreground: '#1f2421',
        muted: {
          DEFAULT: '#f0f1ed',
          foreground: '#4a5149',
        },
        card: {
          DEFAULT: '#ffffff',
          foreground: '#1f2421',
        },
        popover: {
          DEFAULT: '#ffffff',
          foreground: '#1f2421',
        },
        sidebar: {
          DEFAULT: '#fafaf8',
          foreground: '#1f2421',
          border: '#e5e6e2',
          ring: '#0b6e4f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in-right': { from: { opacity: '0', transform: 'translateX(24px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(1.35)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out both',
        'slide-up': 'slide-up 0.3s ease-out both',
        'slide-in-right': 'slide-in-right 0.3s ease-out both',
        'pulse-dot': 'pulse-dot 1.5s ease-in-out infinite',
        shimmer: 'shimmer 1.4s linear infinite',
      },
    },
  },
  plugins: [],
};
