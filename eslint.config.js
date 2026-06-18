// ESLint flat config. Source is TypeScript everywhere (`.ts`); the only `.js`/
// `.mjs` files are this config and the esbuild script. Three runtime targets:
// Node (src/, main/, cli/, examples/, preload), the browser (renderer/), and
// CommonJS (any `.cjs`). Each gets its own globals. Build output is ignored.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'fixtures/**',
      'dist/**',
      'renderer/dist/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Node — engine, main process, CLI, examples, preload source, build script.
  {
    files: [
      'src/**/*.ts', 'main/**/*.ts', 'cli/**/*.ts', 'examples/**/*.ts',
      'preload.ts', 'build.mjs',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // Browser — renderer GUI.
  {
    files: ['renderer/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },

  // CommonJS — any hand-written `.cjs`.
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },

  // Project-wide rule tweaks.
  {
    rules: {
      // The JS→TS migration ran with `strict:false` and uses `any` deliberately
      // in places (untyped optional `easymidi` dep, DOM helpers). Tightening
      // these into precise types is a separate "strict mode" phase, so this rule
      // is off rather than emitting ~120 known warnings that would bury real ones.
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
);
