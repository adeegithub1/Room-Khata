/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Poppins"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        saffron:  { DEFAULT: '#FF6600', 2: '#FF8C00' },
        gold:     { DEFAULT: '#F59E0B', 2: '#D97706' },
        indigo:   { DEFAULT: '#2D1B69', 2: '#4C1D95' },
        emerald:  { DEFAULT: '#059669' },
        rose:     { DEFAULT: '#E11D48' },
        cream:    '#F4F6FB',
        surface:  { DEFAULT: '#FFFFFF', 2: '#F4F6FB' },
        border:   '#ECEEF4',
      },
      animation: {
        shimmer:    'shimmer 2s infinite',
        slideIn:    'slideIn 0.6s cubic-bezier(0.16,1,0.3,1)',
        fadeUp:     'fadeUp 0.5s ease-out',
        scaleIn:    'scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
        bounce3d:   'bounce3d 0.8s ease-out',
        float:      'float 3s ease-in-out infinite',
        pulse2:     'pulse2 2s cubic-bezier(0.4,0,0.6,1) infinite',
        scaleFadeIn:'scaleFadeIn 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards',
        slideUpBouncy: 'slideUpBouncy 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards',
      },
      keyframes: {
        shimmer:    { '0%': { backgroundPosition: '-1000px 0' }, '100%': { backgroundPosition: '1000px 0' } },
        slideIn:    { '0%': { opacity: '0', transform: 'translateX(-30px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        fadeUp:     { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:    { '0%': { opacity: '0', transform: 'scale(0.8)' },       '100%': { opacity: '1', transform: 'scale(1)' } },
        bounce3d:   { '0%': { transform: 'translateY(-10px) scale(1)' }, '50%': { transform: 'translateY(0) scale(1.05)' }, '100%': { transform: 'translateY(-10px) scale(1)' } },
        float:      { '0%, 100%': { transform: 'translateY(0px)' },          '50%': { transform: 'translateY(-20px)' } },
        pulse2:     { '0%, 100%': { opacity: '1' },                           '50%': { opacity: '0.5' } },
        scaleFadeIn:{ '0%': { opacity:'0', transform:'scale(.94) translateY(16px)' }, '100%': { opacity:'1', transform:'scale(1) translateY(0)' } },
        slideUpBouncy: { '0%': { opacity:'0', transform:'translateY(36px)' }, '65%': { transform:'translateY(-5px)' }, '100%': { opacity:'1', transform:'translateY(0)' } },
      },
      boxShadow: {
        sm:  '0 2px 8px rgba(30,27,75,0.07)',
        md:  '0 6px 24px rgba(30,27,75,0.10)',
        lg:  '0 16px 48px rgba(30,27,75,0.13)',
        xl:  '0 60px 120px -20px rgba(30,27,75,0.4)',
      },
    },
  },
  plugins: [],
}
