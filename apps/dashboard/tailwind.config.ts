import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        // Aegis brand tokens — addressable as `aegis-signal`, `aegis-coral` etc.
        // when shadcn's accent/destructive don't fit (e.g. status badges).
        'aegis-ink': 'hsl(var(--aegis-ink))',
        'aegis-surface': 'hsl(var(--aegis-surface))',
        'aegis-surface-2': 'hsl(var(--aegis-surface-2))',
        'aegis-line': 'hsl(var(--aegis-line))',
        'aegis-line-strong': 'hsl(var(--aegis-line-strong))',
        'aegis-paper': 'hsl(var(--aegis-paper))',
        'aegis-mute': 'hsl(var(--aegis-mute))',
        'aegis-faint': 'hsl(var(--aegis-faint))',
        'aegis-signal': 'hsl(var(--aegis-signal))',
        'aegis-signal-soft': 'hsl(var(--aegis-signal-soft))',
        'aegis-coral': 'hsl(var(--aegis-coral))',
        'aegis-amber': 'hsl(var(--aegis-amber))',
        'aegis-iris': 'hsl(var(--aegis-iris))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
