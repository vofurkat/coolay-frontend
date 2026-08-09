/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Акцентный лаймовый
        accent: {
          DEFAULT: '#E7FE17',
          50: '#FBFFE0',
          100: '#F6FFB8',
          200: '#F1FF8A',
          300: '#ECFF55',
          400: '#E7FE17',
          500: '#CBE000',
          600: '#A3B400',
          700: '#7A8700',
          800: '#525A00',
          900: '#2E3300',
        },
        // Боковое меню — тёмно-серый (светлее основного чёрного)
        sidebar: {
          DEFAULT: '#232427',
          light: '#2c2e32',
          border: '#3a3c41',
        },
        ink: {
          DEFAULT: '#0A0A0A',
          50: '#F7F7F7',
          100: '#EDEDED',
          200: '#D6D6D6',
          300: '#B8B8B8',
          400: '#8C8C8C',
          500: '#5C5C5C',
          600: '#3D3D3D',
          700: '#262626',
          800: '#171717',
          900: '#0A0A0A',
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 2px 12px rgba(0,0,0,0.05)',
        card: '0 4px 24px rgba(0,0,0,0.06)',
        pop: '0 12px 40px rgba(0,0,0,0.12)',
        glow: '0 0 0 3px rgba(231,254,23,0.35)',
      },
      // Скругления уменьшены на 5px (минимум 0) на всех блоках и меню.
      // full не трогаем — это круглые элементы (иконки, аватары, скроллбар).
      borderRadius: {
        sm: '0px',
        DEFAULT: '0px',
        md: '0.0625rem', // 1px (было 6px)
        lg: '0.1875rem', // 3px (было 8px)
        xl: '0.5625rem', // 9px (было 14px)
        '2xl': '0.9375rem', // 15px (было 20px)
        '3xl': '1.4375rem', // 23px (было 28px)
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'scale-in': 'scale-in 0.25s ease-out both',
      },
    },
  },
  plugins: [],
}
