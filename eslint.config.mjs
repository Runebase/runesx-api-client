// eslint.config.mjs
import js from '@eslint/js';
import globals from 'globals';
import pluginImport from 'eslint-plugin-import';
import pluginN from 'eslint-plugin-n';
import pluginPromise from 'eslint-plugin-promise';

export default [
  { ignores: ['node_modules/**', 'dist/**'] }, // Ignore common directories
  { files: ['**/*.mjs'] }, // Target ES module files
  js.configs.recommended, // ESLint's recommended rules
  {
    languageOptions: {
      globals: {
        ...globals.node // Node.js globals (e.g., process, module)
      },
      sourceType: 'module' // Support ES modules
    }
  },
  {
    plugins: {
      import: pluginImport,
      n: pluginN,
      promise: pluginPromise
    },
    rules: {
      // Custom rules (adjust as needed)
      'no-unused-vars': 'warn',
      'no-undef': 'warn',
      'import/order': ['error', { 'newlines-between': 'always' }], // Enforce import sorting
      'n/no-missing-import': 'error', // Prevent missing imports in Node.js
      'promise/catch-or-return': 'error', // Require catch or return for Promises
      'eqeqeq': 'error', // Enforce strict equality (===)
      'curly': 'error', // Require curly braces for blocks
      'semi': ['error', 'always'], // Require semicolons
      'quotes': ['error', 'single'] // Enforce single quotes
    }
  }
];