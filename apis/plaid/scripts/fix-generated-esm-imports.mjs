// typescript-axios (openapi-generator) emits extensionless relative imports,
// which fail under this project's `moduleResolution: "NodeNext"`. Rewrite
// them to explicit `.js` specifiers after each generation run.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const generatedDir = join(import.meta.dirname, '../src/generated');

const importFromRegex = /((?:import|export)[^;]*?from\s+['"])(\.\/[^'".]+)(['"])/g;

for (const file of readdirSync(generatedDir)) {
  if (!file.endsWith('.ts')) continue;

  const path = join(generatedDir, file);
  const original = readFileSync(path, 'utf8');
  const fixed = original.replace(importFromRegex, '$1$2.js$3');

  if (fixed !== original) {
    writeFileSync(path, fixed);
  }
}
