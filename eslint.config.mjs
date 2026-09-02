// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'public/js/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'data/**',
      'images/**',
      'views/**',
      '.codegraph/**',
      '*.log'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript itself already flags undefined identifiers, and does so
      // more accurately than this core rule — which doesn't know about the
      // Node vs. DOM globals split across src/ (server), src/client/
      // (browser), and e2e/ (Playwright's browser-context callbacks).
      'no-undef': 'off',

      // This codebase intentionally uses `any` in several places (loose
      // Mongoose typings, legacy middleware casts) — see
      // src/types/express.d.ts and src/app.ts.
      '@typescript-eslint/no-explicit-any': 'off',

      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],

      'no-console': 'off'
    }
  },
  {
    // Chai's BDD assertion style (`expect(x).to.be.true`) is a chain of
    // getters with no call/assignment at the end, which trips the base
    // no-unused-expressions rule even though the getter has the side
    // effect of throwing on failure.
    files: ['test/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off'
    }
  },
  eslintConfigPrettier
);
