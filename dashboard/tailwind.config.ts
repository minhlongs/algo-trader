import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#060814', card: '#101426', border: 'rgba(255, 255, 255, 0.05)' },
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
        profit: '#00FFA3',
        loss: '#FF2E93',
        muted: '#8892B0',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
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
