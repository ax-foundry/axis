import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary palette - uses CSS variables with RGB for opacity support
        primary: {
          DEFAULT: 'rgb(var(--primary-rgb) / <alpha-value>)',
          light: 'rgb(var(--primary-light-rgb) / <alpha-value>)',
          dark: 'rgb(var(--primary-dark-rgb) / <alpha-value>)',
          soft: 'rgb(var(--primary-soft-rgb) / <alpha-value>)',
          pale: 'rgb(var(--primary-pale-rgb) / <alpha-value>)',
        },
        // Accent colors - uses CSS variables with RGB for opacity support
        accent: {
          gold: 'rgb(var(--accent-gold-rgb) / <alpha-value>)',
          silver: 'rgb(var(--accent-silver-rgb) / <alpha-value>)',
        },
        // Text colors (no opacity needed, use hex)
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        // Status colors
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        // UI colors
        border: 'var(--border)',
        background: 'var(--background)',
        surface: 'var(--surface)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [typography],
};

export default config;
