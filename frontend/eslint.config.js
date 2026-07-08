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
      // react-hooks v7 promoted this react-compiler rule to error. It flags
      // legitimate patterns (seeding a default once query data loads, fetch
      // -on-mount effects that toggle a loading flag) where a rewrite would
      // be riskier than the warning. Kept as warn; fix incrementally.
      'react-hooks/set-state-in-effect': 'warn',
      // Allow empty arrow functions (common for no-op handlers and mocks)
      '@typescript-eslint/no-empty-function': ['warn', { allow: ['arrowFunctions'] }],
      // JTN-389: autoFocus can steal focus from screen-reader users —
      // bumped back to error. Inline-edit inputs that used to rely on
      // autoFocus are now ref + useEffect (see AnimationPresets.tsx,
      // PresetManager.tsx, pages/Presets.tsx). WhatsNewModal delegates
      // initial focus to useFocusTrap.
      'jsx-a11y/no-autofocus': 'error',
    },
  },
]);
