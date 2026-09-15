import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default defineConfig(
  globalIgnores(['**/dist/**', '**/node_modules/**', '**/.turbo/**', 'app/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      quotes: ['error', 'single', { allowTemplateLiterals: false }],
    },
  },
  eslintConfigPrettier
);
