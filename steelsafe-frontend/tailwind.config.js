/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        theme: {
          bg: 'var(--theme-bg)',
          'bg-alt': 'var(--theme-bg-alt)',
          card: 'var(--theme-card)',
          'card-hover': 'var(--theme-card-hover)',
          well: 'var(--theme-well)',
          'well-border': 'var(--theme-well-border)',
          text: 'var(--theme-text)',
          'text-secondary': 'var(--theme-text-secondary)',
          'text-muted': 'var(--theme-text-muted)',
          'text-inverse': 'var(--theme-text-inverse)',
          border: 'var(--theme-border)',
          'border-muted': 'var(--theme-border-muted)',
          accent: 'var(--theme-accent)',
          'accent-hover': 'var(--theme-accent-hover)',
          'accent-bg': 'var(--theme-accent-bg)',
          'accent-light': 'var(--theme-accent-light)',
          'accent-light-bg': 'var(--theme-accent-light-bg)',
          'accent-color-bg': 'var(--theme-accent-color-bg)',
          
          'risk-low': 'var(--theme-risk-low)',
          'risk-low-bg': 'var(--theme-risk-low-bg)',
          'risk-low-border': 'var(--theme-risk-low-border)',
          'risk-low-text': 'var(--theme-risk-low-text)',
          
          'risk-med': 'var(--theme-risk-med)',
          'risk-med-bg': 'var(--theme-risk-med-bg)',
          'risk-med-border': 'var(--theme-risk-med-border)',
          'risk-med-text': 'var(--theme-risk-med-text)',
          
          'risk-high': 'var(--theme-risk-high)',
          'risk-high-bg': 'var(--theme-risk-high-bg)',
          'risk-high-border': 'var(--theme-risk-high-border)',
          'risk-high-text': 'var(--theme-risk-high-text)',
          
          'risk-crit': 'var(--theme-risk-crit)',
          'risk-crit-bg': 'var(--theme-risk-crit-bg)',
          'risk-crit-border': 'var(--theme-risk-crit-border)',
          'risk-crit-text': 'var(--theme-risk-crit-text)',
          
          violet: 'var(--theme-violet)',
          'violet-bg': 'var(--theme-violet-bg)',
          'violet-border': 'var(--theme-violet-border)',
          'violet-text': 'var(--theme-violet-text)',

          blue: 'var(--theme-blue)',
          'blue-bg': 'var(--theme-blue-bg)',
          'blue-border': 'var(--theme-blue-border)',
          'blue-text': 'var(--theme-blue-text)',

          purple: 'var(--theme-purple)',
          'purple-bg': 'var(--theme-purple-bg)',
          'purple-border': 'var(--theme-purple-border)',
          'purple-text': 'var(--theme-purple-text)',

          sky: 'var(--theme-sky)',
          'sky-bg': 'var(--theme-sky-bg)',
          'sky-border': 'var(--theme-sky-border)',
          'sky-text': 'var(--theme-sky-text)',

          gray: 'var(--theme-gray)',
          'gray-bg': 'var(--theme-gray-bg)',
          'gray-border': 'var(--theme-gray-border)',
          'gray-text': 'var(--theme-gray-text)',
        },
        steel: {
          950: '#020617', // deep dark
          900: '#0f172a', // panel background
          800: '#1e293b', // card background
          700: '#334155', // input/border
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-fast': 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'strobe': 'strobe 0.8s steps(2, start) infinite',
      },
      keyframes: {
        strobe: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        }
      }
    },
  },
  plugins: [],
}
