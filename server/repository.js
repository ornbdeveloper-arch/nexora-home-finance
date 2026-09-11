import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { emptyState, validateBackup } from './domain.js';

// Troque apenas este módulo ao escolher um banco. O navegador nunca acessa o arquivo.
// Escritas síncronas + rename evitam concorrência dentro deste único processo Node.
const directory = resolve(process.env.DATA_DIR || 'data');
mkdirSync(directory, { recursive: true });
const file = join(directory, 'finance.json');
let state = existsSync(file) ? validateBackup(JSON.parse(readFileSync(file, 'utf8'))) : emptyState();
export function readState() { return structuredClone(state); }
export function saveState(next) {
  const validated = validateBackup(next);
  writeFileSync(file + '.tmp', JSON.stringify(validated, null, 2), { mode: 0o600 });
  if (existsSync(file)) copyFileSync(file, file + '.previous');
  renameSync(file + '.tmp', file);
  state = validated;
  return readState();
}
