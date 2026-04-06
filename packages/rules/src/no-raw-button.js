/**
 * Rule: no raw <button> in renderer packages.
 * Use <Button> or <IconButton> from @shiftspace/ui instead.
 *
 * Escape hatch: add "// lint-allow-button" on the same line.
 */
import { readFileSync, globSync } from 'node:fs';
import { resolve } from 'node:path';

export function noRawButton(root) {
  const files = globSync('packages/renderer-*/src/**/*.tsx', { cwd: root }).filter(
    (f) => !f.includes('renderer-browser-tests')
  );

  const violations = [];

  for (const file of files) {
    const content = readFileSync(resolve(root, file), 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('<button') && !line.includes('// lint-allow-button')) {
        violations.push({ file, line: i + 1, text: line.trimStart() });
      }
    }
  }

  return violations;
}
