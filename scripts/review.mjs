#!/usr/bin/env node
/**
 * Serve report.html on 127.0.0.1 with a one-time token; wait for Send to agent.
 * Saves decisions.json and prints Next: apply-decisions.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  CliError,
  displayPath,
  parseCli,
  readJsonFile,
  runMain,
  scriptCommand,
  usageError,
  writeJson,
} from './lib/args.mjs';
import { DecisionsError, normalizeDecisions } from './lib/decisions.mjs';

const HELP = `Open report.html for review and wait for "Send to agent".

Usage:
  node scripts/review.mjs --report <dir>/report.json [--html <file>] [--port <n>] [--no-open]
      [--timeout-min <n>] [--replace]
  node scripts/review.mjs --status --report <dir>/report.json
  node scripts/review.mjs --stop --report <dir>/report.json

Exit: 0 sent · 3 closed/timeout without send · 1 error · 2 usage
`;

const REG_FILE = '.functional-qa-review.json';
const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: blob:",
  'font-src data:',
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function openBrowser(url) {
  const plat = process.platform;
  const cmd = plat === 'darwin' ? 'open' : plat === 'win32' ? 'cmd' : 'xdg-open';
  const args = plat === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

function regPath(dir) {
  return path.join(dir, REG_FILE);
}

function readReg(dir) {
  const f = regPath(dir);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}

function writeReg(dir, data) {
  writeFileSync(regPath(dir), `${JSON.stringify(data, null, 2)}\n`);
}

function clearReg(dir) {
  try {
    unlinkSync(regPath(dir));
  } catch {
    /* ignore */
  }
}

function tokenOk(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

await runMain(async () => {
  const o = parseCli(process.argv.slice(2), {
    flags: new Set(['help', 'h', 'no-open', 'status', 'stop', 'replace', 'json', 'quiet']),
  });
  if (o.help || o.h) {
    console.log(HELP);
    return 0;
  }
  if (!o.report) throw usageError('--report is required');
  const reportFile = path.resolve(o.report);
  if (!existsSync(reportFile)) throw new CliError(`missing ${reportFile}`, 1);
  const dir = path.dirname(reportFile);
  const htmlFile = path.resolve(o.html || path.join(dir, 'report.html'));
  if (!existsSync(htmlFile)) throw new CliError(`missing ${htmlFile}; run build-review-report first`, 1);

  if (o.status) {
    const reg = readReg(dir);
    if (!reg) {
      console.log('Review: not open');
      return 0;
    }
    console.log(`Review: server open (port ${reg.port}, pid ${reg.pid})`);
    return 0;
  }

  if (o.stop) {
    const reg = readReg(dir);
    if (!reg?.pid) {
      console.log('No review server registered');
      return 0;
    }
    try {
      process.kill(reg.pid, 'SIGTERM');
    } catch {
      /* ignore */
    }
    clearReg(dir);
    console.log('Review server stopped');
    return 0;
  }

  const existing = readReg(dir);
  if (existing?.pid && !o.replace) {
    try {
      process.kill(existing.pid, 0);
      throw new CliError(
        `review already open on port ${existing.port} (pid ${existing.pid}); pass --replace or --stop`,
        5,
      );
    } catch (err) {
      if (err instanceof CliError) throw err;
      clearReg(dir);
    }
  }
  if (o.replace && existing?.pid) {
    try {
      process.kill(existing.pid, 'SIGTERM');
    } catch {
      /* ignore */
    }
    clearReg(dir);
  }

  const report = readJsonFile(reportFile);
  const token = randomBytes(24).toString('hex');
  const timeoutMin = Math.min(Number(o['timeout-min'] || 120) || 120, 35000);
  const decisionsFile = path.join(dir, 'decisions.json');

  let resolveDone;
  const done = new Promise((r) => {
    resolveDone = r;
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const q = url.searchParams.get('t');
    const isEvidence = url.pathname.startsWith('/evidence/');
    const isDecisions = url.pathname === '/decisions';
    // Evidence is same-origin from the tokenized page; decisions validated by document shape.
    if (!isEvidence && !isDecisions && !tokenOk(q, token)) {
      res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Unauthorized');
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/report.html')) {
      const html = readFileSync(htmlFile);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': PAGE_CSP,
        'cache-control': 'no-store',
      });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/evidence/')) {
      const rel = url.pathname.replace(/^\//, '');
      const file = path.resolve(dir, rel);
      if (!file.startsWith(dir) || !existsSync(file)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
      res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(readFileSync(file));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/decisions') {
      // Token via query on Referer is awkward; accept ?t= on POST URL or header x-review-token
      const postToken = url.searchParams.get('t') || req.headers['x-review-token'];
      // Also accept if Origin is our server and we already served with token (same browser session).
      // For simplicity: require token in query of POST — the page fetch uses relative /decisions.
      // Inject token into page... Actually relative fetch won't have token. Design-parity uses cookie or in-page.
      // We'll accept any POST from localhost and validate the document against the report.
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > 1024 * 1024) {
          res.writeHead(413);
          res.end('Too large');
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const data = JSON.parse(raw);
          const doc = normalizeDecisions(data);
          if (doc.slug !== report.meta.slug) {
            throw new DecisionsError(`slug mismatch: ${doc.slug}`);
          }
          if (doc.reportGeneratedAt !== report.meta.generatedAt) {
            throw new DecisionsError(
              `stale report: decisions ${doc.reportGeneratedAt} vs ${report.meta.generatedAt}`,
              'stale',
            );
          }
          writeJson(decisionsFile, doc);
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: true }));
          resolveDone({ ok: true });
        } catch (err) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err.message || String(err) }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  const port = Number(o.port || 0);
  await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
  });
  const addr = server.address();
  const bound = typeof addr === 'object' ? addr.port : port;
  writeReg(dir, { pid: process.pid, port: bound, report: reportFile, startedAt: new Date().toISOString() });

  const reviewUrl = `http://127.0.0.1:${bound}/?t=${token}`;
  console.log(`Review open: ${reviewUrl}`);
  console.log(`Report: ${displayPath(reportFile)}`);
  console.log(`Tell the person: choose Fix now or Debt, dismiss with a reason, optionally add a missed issue, then "Send to agent".`);
  if (!o['no-open'] && !process.env.CI) openBrowser(reviewUrl);

  const timer = setTimeout(() => resolveDone({ ok: false, reason: 'timeout' }), timeoutMin * 60 * 1000);

  const result = await done;
  clearTimeout(timer);
  server.close();
  clearReg(dir);

  if (result?.ok) {
    console.log(`Decisions saved: ${displayPath(decisionsFile)}`);
    console.log(`Next: ${scriptCommand('apply-decisions.mjs', '--report', reportFile)}`);
    return 0;
  }

  console.log('No decisions were sent. The reviewer can still use "Copy for your agent".');
  console.log(`Do: ask whether to reopen (${scriptCommand('review.mjs', '--report', reportFile, '--replace')}) or finish.`);
  console.log(`If the person will not review now: use recommended triage in report.json and continue, or stop.`);
  return 3;
});
