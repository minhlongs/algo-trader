import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#051424', card: '#101426', border: 'rgba(255, 255, 255, 0.05)' },
        obsidian: {
          bg: '#060814',
          card: '#101426',
          border: 'rgba(255, 255, 255, 0.05)',
          glow: 'rgba(0, 255, 163, 0.15)',
        },
        accent: {
          DEFAULT: '#00FFA3', // Neon Green
          cyan: '#00D9FF',
          pink: '#FF2E93',
        },
        profit: '#22c55e',
        loss: '#FF5C6C',
        muted: '#8892B0',
        surface: {
          DEFAULT: '#0d1c2d',
          high: '#1c2b3c',
          container: '#122131',
        },
        surfaceHigh: '#1c2b3c',
        surfaceContainer: '#122131',
        outline: '#3f4e5f',
        primary: {
          DEFAULT: '#4cd7f6',
          container: '#06b6d4',
        },
        primaryContainer: '#06b6d4',
        onSurface: {
          DEFAULT: '#e2e8f0',
          variant: '#94a3b8',
        },
        onSurfaceVariant: '#94a3b8',
        onPrimary: '#003640',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      // Mobile-first breakpoints for responsive trading dashboard
      screens: {
        'sm': '640px',   // Mobile landscape
        'md': '768px',   // Tablet
        'lg': '1024px',  // Laptop
        'xl': '1280px',  // Desktop
        '2xl': '1536px', // Large desktop
      },
      // Touch-friendly sizing
      minHeight: {
        'touch': '44px', // Minimum tap target size
      },
      minWidth: {
        'touch': '44px', // Minimum tap target size
      },
    },
  },
  plugins: [],
} satisfies Config;
