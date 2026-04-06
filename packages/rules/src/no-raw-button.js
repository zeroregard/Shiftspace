/**
 * Rule: no raw <button> in renderer packages.
 * Use <Button> or <IconButton> from @shiftspace/ui instead.
 *
 * Suppress with: // eslint-disable-next-line @shiftspace/no-raw-button
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const DISABLE_COMMENT = '@shiftspace/no-raw-button';

function findTsxFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) results.push(...findTsxFiles(full));
    else if (entry.name.endsWith('.tsx')) results.push(full);
  }
  return results;
}

export function noRawButton(root) {
  const packagesDir = resolve(root, 'packages');
  const rendererDirs = readdirSync(packagesDir, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        d.name.startsWith('renderer-') &&
        d.name !== 'renderer-browser-tests' &&
        d.name !== 'renderer-core'
    )
    .map((d) => resolve(packagesDir, d.name, 'src'));

  const files = rendererDirs
    .flatMap((dir) => {
      try { return findTsxFiles(dir); } catch { return []; }
    })
    .map((f) => relative(root, f));

  const violations = [];

  for (const file of files) {
    const content = readFileSync(resolve(root, file), 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('<button')) continue;
      // Skip lines inside comments (JSDoc, block comments)
      const trimmed = line.trimStart();
      if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
      // Check previous line for disable comment
      const prevLine = i > 0 ? lines[i - 1] : '';
      if (prevLine.includes(DISABLE_COMMENT) || line.includes(DISABLE_COMMENT)) continue;
      violations.push({ file, line: i + 1, text: line.trimStart() });
    }
  }

  return violations;
}
