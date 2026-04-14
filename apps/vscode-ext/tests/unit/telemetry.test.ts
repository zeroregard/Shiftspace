import { describe, expect, it } from 'vitest';
import type * as Sentry from '@sentry/node';
import { hasShiftspaceFrame } from '../../src/telemetry';

type ExceptionValues = NonNullable<NonNullable<Sentry.ErrorEvent['exception']>['values']>;

function values(frames: Array<{ filename?: string }>): ExceptionValues {
  return [
    {
      type: 'Error',
      value: 'test',
      stacktrace: { frames },
    },
  ];
}

describe('hasShiftspaceFrame', () => {
  it('drops events whose frames are entirely from the host editor workbench', () => {
    const hostFrames = values([
      {
        filename:
          'vscode-file://vscode-app/Applications/Cursor.app/Contents/Resources/app/out/vs/workbench/workbench.desktop.main.js',
      },
      {
        filename:
          'vscode-file://vscode-app/Applications/Cursor.app/Contents/Resources/app/out/vs/base/common/async.js',
      },
    ]);

    expect(hasShiftspaceFrame(hostFrames)).toBe(false);
  });

  it('keeps events with at least one frame from our extension', () => {
    const mixedFrames = values([
      { filename: 'vscode-file://vscode-app/out/vs/workbench/workbench.desktop.main.js' },
      { filename: '~/.vscode/extensions/shiftspace.shiftspace-0.2.1/dist/extension.js' },
    ]);

    expect(hasShiftspaceFrame(mixedFrames)).toBe(true);
  });

  it('treats bare <anonymous> and electron/* frames as host-side noise', () => {
    const frames = values([
      { filename: '<anonymous>' },
      { filename: 'electron/js2c/renderer_init.js' },
    ]);

    expect(hasShiftspaceFrame(frames)).toBe(false);
  });

  it('keeps events we cannot classify (no frames at all)', () => {
    expect(hasShiftspaceFrame(values([]))).toBe(true);
    expect(hasShiftspaceFrame([{ type: 'Error', value: 'no stack' }])).toBe(true);
  });
});
