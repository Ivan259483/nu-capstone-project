import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(frontendRoot, 'src');
const firestoreWriteNames = [
  'addDoc',
  'setDoc',
  'updateDoc',
  'deleteDoc',
  'writeBatch',
  'runTransaction',
];

const sourceFiles = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [absolute] : [];
  });

test('browser booking integrations keep Firestore read-only', () => {
  const violations: string[] = [];
  for (const file of sourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    if (!/firebase\/firestore/.test(source) || !/['"]bookings['"]/.test(source)) continue;

    const importedWrites = firestoreWriteNames.filter((name) => (
      new RegExp(`\\b${name}\\b`).test(source)
    ));
    if (importedWrites.length) {
      violations.push(`${path.relative(frontendRoot, file)}: ${importedWrites.join(', ')}`);
    }
  }

  assert.deepEqual(violations, [], `Firestore booking writes found:\n${violations.join('\n')}`);
});

test('OrderService writes through HTTP and keeps Firestore only for listeners', () => {
  const source = fs.readFileSync(path.join(sourceRoot, 'lib/order-service.ts'), 'utf8');
  assert.match(source, /api\.post\('\/bookings'/);
  assert.match(source, /api\.put\(`\/bookings\/\$\{id\}`/);
  assert.match(source, /invalidate\('\/bookings'\)/);
  assert.match(source, /onSnapshot\(/);
  assert.doesNotMatch(source, /\b(?:addDoc|setDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/);
});
