import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          rose: '#D97A91',
          roseDark: '#C4617A',
          roseLight: '#E9A0B1',
          blush: '#F5E1E8',
          cream: '#FBF7F0',
          gold: '#D4AF37',
          goldLight: '#E8C84A',
          dark: '#1D1D1F',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.02), 0 4px 16px rgba(0,0,0,0.02)',
        'card-hover': '0 1px 3px rgba(0,0,0,0.04), 0 16px 48px rgba(0,0,0,0.08)',
        'glow-rose': '0 0 0 3px rgba(217,122,145,0.15), 0 4px 16px rgba(217,122,145,0.2)',
        'glow-gold': '0 0 0 3px rgba(212,175,55,0.15), 0 4px 16px rgba(212,175,55,0.2)',
        'button': '0 1px 2px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)',
        'luxury': '0 1px 3px rgba(0,0,0,0.02), 0 8px 32px rgba(0,0,0,0.04)',
      },
      borderRadius: {
        '2xl': '24px',
        '3xl': '32px',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

export default config
