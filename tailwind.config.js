/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand surfaces
        ink: {
          DEFAULT: '#0B0F19',
          card: '#151B29',
          raised: '#1C2434',
          border: '#283246',
        },
        // Brand primary — roxo elétrico
        brand: {
          50: '#F2EDFF',
          100: '#E4D9FF',
          200: '#C9B4FF',
          300: '#AD8EFF',
          400: '#9A77FF',
          500: '#8C5CFF',
          600: '#7A47F0',
          700: '#6536CC',
          800: '#5028A3',
          900: '#3B1D7A',
        },
        // Secondary — azul-ciano
        cyan: {
          50: '#E6FBFE',
          100: '#C2F3FB',
          200: '#8BE7F7',
          300: '#56DBF3',
          400: '#35C9E8',
          500: '#1FB5D4',
          600: '#1693AE',
          700: '#107585',
          800: '#0C5868',
          900: '#083B47',
        },
        success: {
          DEFAULT: '#35E6A1',
          50: '#E6FFF6',
          100: '#C2FFDF',
          200: '#8AFAC1',
          300: '#52F2A3',
          400: '#35E6A1',
          500: '#1FC986',
          600: '#16A06B',
          700: '#108054',
          800: '#0B5E3D',
          900: '#073D28',
        },
        danger: {
          DEFAULT: '#FF6B78',
          50: '#FFF1F2',
          100: '#FFDCE0',
          200: '#FFB8C0',
          300: '#FF8E9A',
          400: '#FF6B78',
          500: '#F04A5A',
          600: '#C73645',
          700: '#9E2A36',
          800: '#751F28',
          900: '#4C1419',
        },
        warning: {
          DEFAULT: '#F7BC55',
          50: '#FFF8E6',
          100: '#FFEFBF',
          200: '#FFE08C',
          300: '#F7BC55',
          400: '#E5A23A',
          500: '#B57D2A',
          600: '#8A5E20',
          700: '#5E4015',
          800: '#3A270D',
          900: '#1C1306',
        },
        content: {
          primary: '#F3F5FA',
          secondary: '#A7B0C2',
          muted: '#6B7589',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px #283246',
        raised: '0 8px 24px -8px rgba(0,0,0,0.5), 0 0 0 1px #283246',
        glow: '0 0 24px -4px rgba(140,92,255,0.45)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'scale-in': 'scale-in 0.3s ease-out both',
        'slide-in': 'slide-in 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};
