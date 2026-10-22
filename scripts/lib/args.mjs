import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function oneLine(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function displayPath(p, cwd = process.cwd()) {
  const abs = path.resolve(p);
  const rel = path.relative(cwd, abs);
  return rel && !rel.startsWith('..') ? rel : abs;
}

export function shellArg(v) {
  const s = String(v);
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function scriptCommand(script, ...args) {
  const file = path.join(SKILL_ROOT, 'scripts', script);
  return `node ${shellArg(file)} ${args.map(shellArg).join(' ')}`.trim();
}

export function parseCli(argv, { flags = new Set(), multi = new Set() } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
      if (flags.has(key)) {
        out[key] = true;
        continue;
      }
      const raw = eq === -1 ? argv[++i] : a.slice(eq + 1);
      if (raw === undefined) throw usageError(`missing value for --${key}`);
      if (multi.has(key)) {
        if (!out[key]) out[key] = [];
        out[key].push(raw);
      } else {
        out[key] = raw;
      }
      continue;
    }
    out._.push(a);
  }
  return out;
}

export function usageError(message) {
  const err = new Error(oneLine(message));
  err.code = 'USAGE';
  return err;
}

export class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(oneLine(message));
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

export function readJsonFile(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function writeText(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text, 'utf8');
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function runMain(main) {
  try {
    const code = await main();
    process.exit(typeof code === 'number' ? code : 0);
  } catch (err) {
    if (err?.code === 'USAGE') {
      console.error(`Usage error: ${err.message}`);
      process.exit(2);
    }
    if (err instanceof CliError) {
      console.error(err.message);
      process.exit(err.exitCode);
    }
    console.error(err?.stack || String(err));
    process.exit(1);
  }
}

export function exists(p) {
  return existsSync(p);
}
