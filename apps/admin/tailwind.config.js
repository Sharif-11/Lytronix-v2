import typography from '@tailwindcss/typography';
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral surface scale — cool slate, not the warm "paper" tone of v1.
        ui: {
          bg: '#F4F6FB',        // app background
          surface: '#FFFFFF',    // cards / panels
          surfaceAlt: '#F8FAFC', // subtle secondary surface (table header, hover)
          border: '#E4E8F1',
          ink: '#0F172A',        // primary text
          muted: '#64748B',      // secondary text
          faint: '#94A3B8',      // tertiary / placeholder text

          // Legacy aliases kept so nothing across the app needs touching again.
          panel: '#FFFFFF',
          line: '#E4E8F1',
          brand: '#4A7D1E',      // interactive green — darkened from logo's #76C043 for AA text contrast on white buttons
          brandDark: '#3A6216',
          rust: '#DC2626',       // danger / destructive
          gold: '#D97706',       // warning / accent

          // Dark surfaces — used for the sidebar / login hero, echoing the
          // logo's black badge. Kept separate from the light `ink`/`surface`
          // pair above so content areas stay bright and legible.
          dark: '#0A0B08',
          darkAlt: '#16180F',
          darkLine: 'rgba(255,255,255,0.08)',
        },
        // Semantic accents for status pills, charts, etc. — deliberately
        // distinct from the brand green so status/data don't read as "on/off".
        accent: {
          indigo: '#4F46E5',
          violet: '#7C3AED',
          teal: '#0D9488',
          amber: '#D97706',
          rose: '#E11D48',
          sky: '#0284C7',
          lime: '#76C043', // true logo green, for badges/highlights that want the exact brand hue
        },
      },
      fontFamily: {
        // One professional sans stack. Manrope for headings gives just
        // enough personality without tipping into "serif logbook" territory.
        display: ['"Manrope"', '"Inter"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', '"Noto Sans Bengali"', 'system-ui', 'sans-serif'],
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
