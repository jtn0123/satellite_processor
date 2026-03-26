import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strict,
      tseslint.configs.stylistic,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Downgrade to warn — 112 existing usages; fix incrementally
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Allow empty functions (common for no-op handlers and mocks)
      '@typescript-eslint/no-empty-function': 'off',
      // autoFocus is acceptable for search inputs and modals
      'jsx-a11y/no-autofocus': 'warn',
    },
  },
]);
