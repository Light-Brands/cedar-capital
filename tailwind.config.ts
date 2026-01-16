import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary Colors
        'cedar-green': '#0B3D2E',
        'capital-gold': '#C8A24A',
        'gold-hover': '#B8923D',
        // Secondary Colors
        'evergreen': '#1F5B47',
        'navy-ink': '#0F2233',
        // Neutral Colors
        'cream': '#F6F1E6',
        'sand': '#E9DDC7',
        'stone': '#D2C7B3',
        'charcoal': '#1F2933',
        // Utility Colors
        'success': '#2F6F55',
        'warning': '#B07A2A',
        'error': '#A13A3A',
        'info': '#2B5C7A',
      },
      fontFamily: {
        heading: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        'card': '16px',
        'button': '12px',
        'input': '10px',
      },
      boxShadow: {
        'card': '0 2px 8px rgba(31, 41, 51, 0.08)',
        'elevated': '0 4px 16px rgba(31, 41, 51, 0.12)',
        'modal': '0 8px 32px rgba(31, 41, 51, 0.16)',
      },
      transitionDuration: {
        'quick': '200ms',
        'standard': '300ms',
        'entrance': '400ms',
      },
      maxWidth: {
        'content': '1200px',
      },
    },
  },
  plugins: [],
}

export default config
