// ESLint flat config (ESLint 9+)
// Prioritizes functionality over strict style — catches real errors, not style nits.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    // Files to lint
    files: ['src/**/*.ts', 'src/**/*.tsx'],

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },

    plugins: {
      '@typescript-eslint': tsPlugin,
    },

    rules: {
      // TypeScript recommended — catches real bugs
      ...tsPlugin.configs.recommended.rules,

      // Relax rules that hurt productivity without improving correctness
      '@typescript-eslint/no-explicit-any': 'off',            // off — incremental cleanup via separate initiative
      '@typescript-eslint/no-unused-vars': ['warn', {        // warn, allow _ prefix
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-require-imports': 'warn',       // warn for legacy require()
      '@typescript-eslint/no-empty-object-type': 'warn',     // warn only

      // Turn off style-only rules
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
    },
  },
  {
    // Relaxed rules for test files — allow `any` and unused imports in tests
    // for mocking, test scaffolding, and assertion patterns
    files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts', 'src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // Top-level ignores (flat config style)
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.archive/**',
      'dashboard/**',
      '**/*.d.ts',
    ],
  },
];
