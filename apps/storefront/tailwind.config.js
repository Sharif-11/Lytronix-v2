import typography from '@tailwindcss/typography';
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ui: {
          bg: '#F4F6FB',
          surface: '#FFFFFF',
          surfaceAlt: '#F8FAFC',
          border: '#E4E8F1',
          ink: '#0F172A',
          muted: '#64748B',
          faint: '#94A3B8',

          panel: '#FFFFFF',
          line: '#E4E8F1',
          brand: '#4A7D1E',      // interactive green — darkened from logo's #76C043 for AA text contrast on white
          brandDark: '#3A6216',
          rust: '#DC2626',
          gold: '#D97706',

          dark: '#0A0B08',
          darkAlt: '#16180F',
          darkLine: 'rgba(255,255,255,0.08)',
        },
        accent: {
          lime: '#76C043', // true logo green, for badges/highlights that want the exact brand hue
        },
        // bKash's own brand colour, used only on the bKash manual-payment
        // panel at checkout so it reads as "this part is bKash", distinct
        // from the site's own green brand.
        bkash: {
          DEFAULT: '#E2136E',
          dark: '#C1105F',
        },
      },
      fontFamily: {
        // The whole storefront reads in Bangla — Noto Sans Bengali is in the
        // primary stack (not just a fallback) so headings and body text both
        // render Bangla glyphs from the intended font, not an OS default.
        display: ['"Manrope"', '"Noto Sans Bengali"', '"Inter"', 'system-ui', 'sans-serif'],
        sans: ['"Noto Sans Bengali"', '"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
        bangla: ['"Noto Sans Bengali"', '"Inter"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
        raised: '0 4px 16px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)',
        floating: '0 12px 32px rgba(15,23,42,0.12)',
      },
    },
  },
  plugins: [typography],
};
