// tailwind.config.js - Premium Figma-Inspired Configuration
// Phase 6: One font (Inter), 8pt grid (spacing 2=8px, 4=16px, 6=24px), touch 44px.
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        glass: {
          bg: 'rgba(255, 255, 255, 0.7)',
          border: 'rgba(255, 255, 255, 0.3)',
          hover: 'rgba(255, 255, 255, 0.9)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '1.5', letterSpacing: '0.02em' }],
        sm: ['14px', { lineHeight: '1.6', letterSpacing: '0' }],
        base: ['16px', { lineHeight: '1.6' }],
        lg: ['18px', { lineHeight: '1.5', letterSpacing: '-0.01em' }],
        xl: ['20px', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        '2xl': ['24px', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        '3xl': ['32px', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        'section': '1.5rem',
        'block': '1rem',
        'touch': '44px',
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },
      borderRadius: {
        'lg': '10px',
        'xl': '12px',
        '2xl': '16px',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.04)',
        'glass-hover': '0 12px 40px rgba(0, 0, 0, 0.08)',
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'primary': '0 4px 12px rgba(239, 68, 68, 0.3)',
        'primary-hover': '0 8px 20px rgba(239, 68, 68, 0.4)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.02), 0 8px 24px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.05), 0 12px 32px rgba(0, 0, 0, 0.06)',
        'medium': '0 4px 12px rgba(0, 0, 0, 0.06)',
        'large': '0 8px 24px rgba(0, 0, 0, 0.08)',
      },
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        DEFAULT: '10px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '32px',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'shimmer': 'shimmer 2s infinite',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
