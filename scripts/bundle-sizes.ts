#!/usr/bin/env bun
/**
 * Measure bundle sizes for all Shiftspace build outputs.
 *
 * Usage:
 *   bun run scripts/bundle-sizes.ts              # print markdown table
 *   bun run scripts/bundle-sizes.ts --json       # output JSON to stdout
 *   bun run scripts/bundle-sizes.ts --compare base.json pr.json  # diff table
 */

import { gzipSync } from 'node:zlib';
import { statSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const print = (s: string) => process.stdout.write(`${s}\n`);
const printErr = (s: string) => process.stderr.write(`${s}\n`);

interface BundleEntry {
  name: string;
  raw: number;
  gzip: number;
}

const BUNDLES: { name: string; path: string }[] = [
  { name: 'preview (total)', path: 'apps/preview/dist' },
  {
    name: 'webview IIFE',
    path: 'apps/vscode-ext/dist/webview/index.iife.js',
  },
  { name: 'extension host', path: 'apps/vscode-ext/dist/extension.js' },
  { name: 'MCP server', path: 'apps/vscode-ext/dist/mcp-server.mjs' },
];

function dirSize(dir: string): { raw: number; gzip: number } {
  let raw = 0;
  let gzip = 0;
  const entries = readdirSync(dir, { recursive: true, withFileTypes: false });
  for (const entry of entries) {
    const f = String(entry);
    if (!/\.(js|css|mjs)$/.test(f)) continue;
    const fullPath = join(dir, f);
    try {
      const stat = statSync(fullPath);
      if (!stat.isFile()) continue;
      const content = readFileSync(fullPath);
      raw += stat.size;
      gzip += gzipSync(content).length;
    } catch {
      // skip inaccessible files
    }
  }
  return { raw, gzip };
}

function measure(b: { name: string; path: string }): BundleEntry | null {
  const fullPath = join(ROOT, b.path);
  if (!existsSync(fullPath)) return null;

  const stat = statSync(fullPath);
  if (stat.isDirectory()) {
    const { raw, gzip } = dirSize(fullPath);
    return { name: b.name, raw, gzip };
  }

  const content = readFileSync(fullPath);
  return {
    name: b.name,
    raw: stat.size,
    gzip: gzipSync(content).length,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'kB', 'MB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1);
  const value = bytes / Math.pow(1000, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDiff(base: number, pr: number): string {
  const diff = pr - base;
  const pct = base > 0 ? ((diff / base) * 100).toFixed(1) : 'new';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${formatBytes(Math.abs(diff))} (${typeof pct === 'string' ? pct : `${sign}${pct}`}%)`;
}

function printMarkdown(entries: BundleEntry[]) {
  print('## 📦 Bundle Sizes\n');
  print('| Bundle | Raw | Gzipped |');
  print('|---|---|---|');
  for (const e of entries) {
    print(`| ${e.name} | ${formatBytes(e.raw)} | ${formatBytes(e.gzip)} |`);
  }
}

function printComparison(baseEntries: BundleEntry[], prEntries: BundleEntry[]) {
  const baseMap = new Map(baseEntries.map((e) => [e.name, e]));
  const prMap = new Map(prEntries.map((e) => [e.name, e]));
  const allNames = [...new Set([...baseMap.keys(), ...prMap.keys()])];

  print('## 📦 Bundle Sizes\n');
  print('| Bundle | Base (gz) | PR (gz) | Diff | |');
  print('|---|---|---|---|---|');

  for (const name of allNames) {
    const base = baseMap.get(name);
    const pr = prMap.get(name);

    if (!base && pr) {
      print(`| ${name} | — | ${formatBytes(pr.gzip)} | new | 🆕 |`);
      continue;
    }
    if (base && !pr) {
      print(`| ${name} | ${formatBytes(base.gzip)} | — | removed | 🗑️ |`);
      continue;
    }
    if (base && pr) {
      const diff = pr.gzip - base.gzip;
      const pct = base.gzip > 0 ? (diff / base.gzip) * 100 : 0;
      const icon = pct > 5 ? '⚠️' : pct < -5 ? '🎉' : '✅';
      print(
        `| ${name} | ${formatBytes(base.gzip)} | ${formatBytes(pr.gzip)} | ${formatDiff(base.gzip, pr.gzip)} | ${icon} |`
      );
    }
  }

  print('\n*Sizes are gzipped. ⚠️ = increase > 5%*');
}

// --- Main ---

const args = process.argv.slice(2);

if (args[0] === '--compare' && args[1] && args[2]) {
  const baseData: BundleEntry[] = JSON.parse(readFileSync(args[1], 'utf-8'));
  const prData: BundleEntry[] = JSON.parse(readFileSync(args[2], 'utf-8'));
  printComparison(baseData, prData);
  process.exit(0);
}

const entries = BUNDLES.map(measure).filter((e): e is BundleEntry => e !== null);

if (entries.length === 0) {
  printErr('No build outputs found. Run `bun run build` first.');
  process.exit(1);
}

if (args[0] === '--json') {
  print(JSON.stringify(entries, null, 2));
} else {
  printMarkdown(entries);
}
