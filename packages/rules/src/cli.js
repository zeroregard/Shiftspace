#!/usr/bin/env node
import { resolve } from 'node:path';
import { noRawButton } from './no-raw-button.js';

const root = resolve(import.meta.dirname, '..', '..', '..');

let failed = false;

// -- no-raw-button --
const buttonViolations = noRawButton(root);
if (buttonViolations.length > 0) {
  console.error(
    'no-raw-button: Raw <button> is not allowed in renderer packages.\n' +
      'Use <Button> or <IconButton> from @shiftspace/ui instead.\n' +
      "Add '// lint-allow-button' to suppress for a specific line.\n"
  );
  for (const v of buttonViolations) {
    console.error(`  ${v.file}:${v.line}: ${v.text}`);
  }
  failed = true;
}

if (failed) process.exit(1);
