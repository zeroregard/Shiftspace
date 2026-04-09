#!/usr/bin/env node

/**
 * Generate structured changelogs from conventional commits.
 *
 * Usage:
 *   node scripts/generate-changelog.mjs --from <ref> --to <ref> --version <ver>
 *   node scripts/generate-changelog.mjs --from <ref> --to <ref> --format release-body
 *   node scripts/generate-changelog.mjs --prepend apps/vscode-ext/CHANGELOG.md --version 0.1.41
 *   node scripts/generate-changelog.mjs --backfill apps/vscode-ext/CHANGELOG.md
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// ── Config ──────────────────────────────────────────────────────────────────

const COMMIT_TYPES = {
  feat: 'Added',
  fix: 'Fixed',
  refactor: 'Changed',
  perf: 'Performance',
};

const IGNORED_TYPES = new Set(['chore', 'ci', 'docs', 'test', 'style', 'build']);

const NOISE_PATTERNS = [
  /^chore: bump version/,
  /^chore: release/,
  /^Merge branch/,
  /^merge$/i,
  /^update$/i,
  /^update README/i,
  /^update license/i,
  /^update main README/i,
  /^ammendment$/i,
  /^license$/i,
];

const VERSION_BUMP_RE = /^chore: (bump version to v|release v?)(\d+\.\d+\.\d+)/;

// ── Helpers ─────────────────────────────────────────────────────────────────

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf-8' }).trim();
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      args[key] = next && !next.startsWith('--') ? argv[++i] : true;
    }
  }
  return args;
}

/** Parse a conventional commit subject into { type, scope, description } or null. */
function parseConventionalCommit(subject) {
  // Match: type(scope): desc  OR  type: desc
  const match = subject.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/);
  if (!match) return null;
  return { type: match[1], scope: match[2] || null, description: match[3] };
}

/** Clean scope for display: @shiftspace/renderer-grove → renderer-grove */
function cleanScope(scope) {
  if (!scope) return null;
  return scope.replace(/^@shiftspace\//, '');
}

/** Check if a commit subject is noise that should be filtered out. */
function isNoise(subject) {
  return NOISE_PATTERNS.some((re) => re.test(subject));
}

/**
 * Get commits between two refs, parse them, and group by category.
 * Returns { Added: [...], Fixed: [...], Changed: [...], Performance: [...] }
 */
function getGroupedCommits(from, to) {
  const range = from ? `${from}..${to}` : to;
  const log = git(`log --format="%H %s" ${range}`);
  if (!log) return {};

  const groups = {};

  for (const line of log.split('\n')) {
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) continue;
    const subject = line.slice(spaceIdx + 1);

    if (isNoise(subject)) continue;

    const parsed = parseConventionalCommit(subject);

    if (parsed) {
      if (IGNORED_TYPES.has(parsed.type)) continue;
      const category = COMMIT_TYPES[parsed.type];
      if (!category) continue;

      const scope = cleanScope(parsed.scope);
      const desc = scope
        ? `${parsed.description} _(${scope})_`
        : parsed.description;

      groups[category] ??= [];
      groups[category].push(desc);
    } else {
      // Non-conventional commits that aren't noise go into "Changed"
      // Strip PR number suffix for cleaner display
      const cleaned = subject.replace(/\s*\(#\d+\)$/, '');
      groups['Changed'] ??= [];
      groups['Changed'].push(cleaned);
    }
  }

  return groups;
}

/** Format grouped commits as markdown sections. */
function formatGroups(groups) {
  const lines = [];
  const order = ['Added', 'Changed', 'Fixed', 'Performance'];

  for (const category of order) {
    const items = groups[category];
    if (!items?.length) continue;
    lines.push(`### ${category}\n`);
    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

/** Format a full changelog entry with version header. */
function formatChangelogEntry(version, groups, date) {
  const dateStr = date || new Date().toISOString().slice(0, 10);
  const body = formatGroups(groups);
  if (!body) return '';
  return `## [${version}] — ${dateStr}\n\n${body}`;
}

/** Prepend a changelog entry to an existing CHANGELOG.md file. */
function prependToChangelog(filePath, entry) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    content = '# Changelog\n\nAll notable changes to Shiftspace will be documented in this file.\n';
  }

  // Insert after the header block (# Changelog + optional description line)
  const headerRe = /^# Changelog\n(?:\n[^\n#][^\n]*\n)?/;
  const match = content.match(headerRe);
  if (match) {
    const insertPos = match[0].length;
    content = content.slice(0, insertPos) + '\n' + entry + '\n\n' + content.slice(insertPos).replace(/^\n+/, '');
  } else {
    content = '# Changelog\n\nAll notable changes to Shiftspace will be documented in this file.\n\n' + entry + '\n\n' + content;
  }

  writeFileSync(filePath, content);
}

// ── Backfill mode ───────────────────────────────────────────────────────────

function findVersionBumps() {
  const log = git('log --format="%H %s" --reverse');
  const bumps = [];
  for (const line of log.split('\n')) {
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) continue;
    const hash = line.slice(0, spaceIdx);
    const subject = line.slice(spaceIdx + 1);
    const match = subject.match(VERSION_BUMP_RE);
    if (match) {
      bumps.push({ hash, version: match[2] });
    }
  }
  return bumps;
}

function backfill(filePath) {
  const bumps = findVersionBumps();
  const entries = [];

  for (let i = 0; i < bumps.length; i++) {
    const { hash, version } = bumps[i];
    const from = i > 0 ? bumps[i - 1].hash : null;

    // For the first bump (root commit or no parent), skip — there are no prior commits
    if (!from) continue;

    // Get commits between previous bump and this bump (exclusive of both bump commits)
    const to = `${hash}~1`;

    // Check that `to` is a valid ref (the bump commit might be the immediate next commit)
    let hasCommits;
    try {
      const count = execSync(`git rev-list --count ${from}..${to}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      hasCommits = parseInt(count, 10) > 0;
    } catch {
      hasCommits = false;
    }
    if (!hasCommits) continue;

    // Get the date of the bump commit
    const date = git(`log -1 --format=%as ${hash}`);

    const groups = getGroupedCommits(from, to);
    const entry = formatChangelogEntry(version, groups, date);
    if (entry) entries.push(entry);
  }

  // Also get commits after the last bump (unreleased on main)
  if (bumps.length > 0) {
    const lastBump = bumps[bumps.length - 1];
    const groups = getGroupedCommits(lastBump.hash, 'HEAD');
    if (Object.keys(groups).length > 0) {
      entries.push(`## [Unreleased]\n\n${formatGroups(groups)}`);
    }
  }

  // Build the full changelog (newest first)
  entries.reverse();
  const content =
    '# Changelog\n\nAll notable changes to Shiftspace will be documented in this file.\n\n' +
    entries.join('\n\n') +
    '\n';

  writeFileSync(filePath, content);
  console.log(`Backfilled ${entries.length} entries → ${filePath}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv);

if (args.backfill) {
  backfill(args.backfill);
  process.exit(0);
}

const from = args.from || null;
const to = args.to || 'HEAD';
const format = args.format || 'changelog';
const version = args.version || 'Unreleased';

const groups = getGroupedCommits(from, to);

if (!Object.keys(groups).length) {
  console.error('No notable commits found in range.');
  process.exit(0);
}

if (format === 'release-body') {
  console.log(formatGroups(groups));
} else {
  const entry = formatChangelogEntry(version, groups);
  if (args.prepend) {
    prependToChangelog(args.prepend, entry);
    console.log(`Prepended ${version} entry to ${args.prepend}`);
  } else {
    console.log(entry);
  }
}
