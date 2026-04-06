/**
 * Rule: no raw <button> in renderer packages.
 * Use <Button> or <IconButton> from @shiftspace/ui instead.
 *
 * Suppress with: // eslint-disable-next-line @shiftspace/no-raw-button
 */
import { readFileSync, globSync } from 'node:fs';
import { resolve } from 'node:path';

const DISABLE_COMMENT = '@shiftspace/no-raw-button';

export function noRawButton(root) {
  const files = globSync('packages/renderer-*/src/**/*.tsx', { cwd: root }).filter(
    (f) => !f.includes('renderer-browser-tests') && !f.includes('renderer-core')
  );

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
