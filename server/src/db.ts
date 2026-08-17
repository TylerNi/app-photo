import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config.js';

for (const dir of [
  dirname(config.dbPath),
  config.originalsDir,
  config.thumbsDir,
  config.teasersDir,
  config.tmpDir,
]) {
  mkdirSync(dir, { recursive: true });
}

for (const entry of readdirSync(config.tmpDir)) {
  rmSync(resolve(config.tmpDir, entry), { recursive: true, force: true });
}

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(readFileSync(resolve(import.meta.dirname, 'schema.sql'), 'utf8'));
