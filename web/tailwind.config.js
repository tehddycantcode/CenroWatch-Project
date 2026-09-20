/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"DM Serif Display"', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        // CENROWATCH brand palette (exact values from Figma)
        brand: {
          forest: '#0f3d1f',
          primary: '#22a050',
          accent: '#2dc568',
          light: '#8fe8ae',
          tint: '#e6fdf0',
          surface: '#f8faf9',
        },
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
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15,61,31,0.04), 0 1px 3px rgba(15,61,31,0.06)',
        'soft-md': '0 2px 4px rgba(15,61,31,0.05), 0 6px 16px rgba(15,61,31,0.08)',
        'soft-lg': '0 8px 30px rgba(15,61,31,0.10)',
      },
      transitionTimingFunction: {
        // Fast out, settle in - the curve the phone nav's panel, backdrop and
        // icon cross-fade all share, so the whole gesture reads as one motion.
        // Named here rather than written inline: `ease-[cubic-bezier(...)]` is
        // ambiguous to Tailwind's parser and warns on every build.
        'swift-out': 'cubic-bezier(0.2, 0, 0, 1)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'float-soft': {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        // Bar chart grow-in. Scales from the left rather than animating width,
        // so the bar is already at its final size in the DOM on the first paint
        // and reduced-motion users never see an empty plot.
        'bar-grow': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
        // Phone nav panel. It drops from under the header, so it enters from
        // slightly above rather than below.
        'nav-panel-in': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // The exit is deliberately shorter and travels less than the enter: a
        // dismissal should get out of the way, not perform.
        'nav-panel-out': {
          from: { opacity: '1', transform: 'translateY(0)' },
          to: { opacity: '0', transform: 'translateY(-6px)' },
        },
        'nav-item-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.5s ease-out both',
        'float-soft': 'float-soft 6s ease-in-out infinite',
        // `both` holds scaleX(0) through the per-bar stagger delay.
        'bar-grow': 'bar-grow 500ms cubic-bezier(0.4, 0, 0.2, 1) both',
        'nav-panel-in': 'nav-panel-in 180ms cubic-bezier(0.2, 0, 0, 1) both',
        // Must stay in step with EXIT_MS in components/ui/mobile-nav.jsx, which
        // is how long the panel is kept mounted after it is dismissed.
        'nav-panel-out': 'nav-panel-out 150ms cubic-bezier(0.2, 0, 0, 1) both',
        // `both` holds the item invisible through its stagger delay.
        'nav-item-in': 'nav-item-in 200ms cubic-bezier(0.2, 0, 0, 1) both',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
