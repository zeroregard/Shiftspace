/**
 * Rule: no raw error message exposure in MCP/HTTP response handlers.
 *
 * Catches patterns like:
 *   err instanceof Error ? err.message : String(err)
 *   error instanceof Error ? error.message : String(error)
 *
 * These leak internal error details to clients (CWE-209). Log the error
 * server-side and return a generic message instead.
 *
 * Scope: apps/vscode-ext/src/mcp/
 * Suppress with: // eslint-disable-next-line @shiftspace/no-error-message-exposure
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const DISABLE_COMMENT = '@shiftspace/no-error-message-exposure';

/**
 * Matches the common pattern of extracting error messages for client responses:
 *   err instanceof Error ? err.message : String(err)
 *   (err as Error).message
 *   error.message used in JSON.stringify / response objects
 */
const PATTERNS = [
  /instanceof\s+Error\s*\?\s*\w+\.message\s*:\s*String\(/,
  /\(\w+\s+as\s+Error\)\.message/,
];

function findTsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) results.push(...findTsFiles(full));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) results.push(full);
  }
  return results;
}

export function noErrorMessageExposure(root) {
  const mcpDir = resolve(root, 'apps', 'vscode-ext', 'src', 'mcp');
  let files;
  try {
    files = findTsFiles(mcpDir).map((f) => relative(root, f));
  } catch {
    return [];
  }

  const violations = [];

  for (const file of files) {
    const content = readFileSync(resolve(root, file), 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = PATTERNS.some((p) => p.test(line));
      if (!matches) continue;
      // Skip comment lines
      const trimmed = line.trimStart();
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
      // Check for suppress comment
      const prevLine = i > 0 ? lines[i - 1] : '';
      if (prevLine.includes(DISABLE_COMMENT) || line.includes(DISABLE_COMMENT)) continue;
      violations.push({ file, line: i + 1, text: trimmed });
    }
  }

  return violations;
}
