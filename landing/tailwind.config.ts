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
          green: '#0EA56F',
          greenDark: '#057A55',
          greenDeep: '#034E36',
          dark: '#0f172a',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.03)',
        'card-hover': '0 1px 3px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.07)',
        'glow-green': '0 0 0 3px rgba(14,165,111,0.15), 0 4px 16px rgba(14,165,111,0.2)',
        'button': '0 1px 2px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

export default config
