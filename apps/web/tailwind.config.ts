import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        surface: {
          subtle: 'hsl(var(--surface-subtle))',
          raised: 'hsl(var(--surface-raised))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
        '3xl': '1.5rem',
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em' }],
        '5xl': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
        '6xl': ['3.75rem', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
        '7xl': ['4.5rem', { lineHeight: '1', letterSpacing: '-0.04em' }],
        '8xl': ['6rem', { lineHeight: '1', letterSpacing: '-0.04em' }],
      },
      spacing: {
        '4.5': '1.125rem',
        '13': '3.25rem',
        '15': '3.75rem',
        '18': '4.5rem',
        '22': '5.5rem',
      },
      maxWidth: {
        '8xl': '88rem',
        '9xl': '96rem',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0', opacity: '0' },
          to: { height: 'var(--radix-accordion-content-height)', opacity: '1' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)', opacity: '1' },
          to: { height: '0', opacity: '0' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-scale': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'count-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'live-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'border-glow': {
          '0%, 100%': { borderColor: 'rgba(124,58,237,0.3)' },
          '50%': { borderColor: 'rgba(124,58,237,0.8)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 1.8s ease-in-out infinite',
        'fade-in': 'fade-in 0.4s ease-out both',
        'fade-in-up': 'fade-in-up 0.5s ease-out both',
        'fade-in-scale': 'fade-in-scale 0.3s ease-out both',
        'slide-in-right': 'slide-in-right 0.4s ease-out both',
        float: 'float 4s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
        'gradient-shift': 'gradient-shift 6s ease infinite',
        'spin-slow': 'spin-slow 8s linear infinite',
        'count-up': 'count-up 0.4s ease-out both',
        'live-pulse': 'live-pulse 2s ease-in-out infinite',
        'border-glow': 'border-glow 2s ease-in-out infinite',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
        'gradient-brand-soft': 'linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(79,70,229,0.12) 100%)',
        'gradient-radial': 'radial-gradient(ellipse at center, var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'mesh-purple': `
          radial-gradient(at 40% 20%, rgba(124,58,237,0.15) 0px, transparent 50%),
          radial-gradient(at 80% 0%, rgba(79,70,229,0.1) 0px, transparent 50%),
          radial-gradient(at 0% 50%, rgba(139,92,246,0.08) 0px, transparent 50%),
          radial-gradient(at 80% 50%, rgba(67,56,202,0.08) 0px, transparent 50%)
        `,
      },
      boxShadow: {
        xs: '0 1px 2px rgba(0,0,0,0.04)',
        sm: '0 2px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        DEFAULT: '0 4px 8px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        md: '0 4px 8px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        lg: '0 8px 24px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.06)',
        xl: '0 24px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08)',
        '2xl': '0 32px 64px rgba(0,0,0,0.14), 0 16px 32px rgba(0,0,0,0.08)',
        violet: '0 0 0 1px rgba(124,58,237,0.15), 0 8px 24px rgba(124,58,237,0.15)',
        'violet-lg': '0 0 0 1px rgba(124,58,237,0.2), 0 20px 48px rgba(124,58,237,0.25)',
        'violet-glow': '0 0 40px -10px rgba(124,58,237,0.5)',
        elevated: '0 0 0 1px rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.4)',
        none: 'none',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-expo': 'cubic-bezier(0.7, 0, 0.84, 0)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
