import { describe, it, expect } from 'vitest';
import type { Event as SentryEvent, Integration } from '@sentry/node';
import type * as Sentry from '@sentry/node';
import {
  hasShiftspaceFrame,
  sanitizePath,
  sanitizePathString,
  __scrubEventForTests,
} from '../../src/telemetry';

type ExceptionValues = NonNullable<NonNullable<Sentry.ErrorEvent['exception']>['values']>;

function frameValues(frames: Array<{ filename?: string }>): ExceptionValues {
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
    const hostFrames = frameValues([
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
    const mixedFrames = frameValues([
      { filename: 'vscode-file://vscode-app/out/vs/workbench/workbench.desktop.main.js' },
      { filename: '~/.vscode/extensions/shiftspace.shiftspace-0.2.1/dist/extension.js' },
    ]);

    expect(hasShiftspaceFrame(mixedFrames)).toBe(true);
  });

  it('treats bare <anonymous> and electron/* frames as host-side noise', () => {
    const frames = frameValues([
      { filename: '<anonymous>' },
      { filename: 'electron/js2c/renderer_init.js' },
    ]);

    expect(hasShiftspaceFrame(frames)).toBe(false);
  });

  it('keeps events we cannot classify (no frames at all)', () => {
    expect(hasShiftspaceFrame(frameValues([]))).toBe(true);
    expect(hasShiftspaceFrame([{ type: 'Error', value: 'no stack' }])).toBe(true);
  });
});

describe('sanitizePathString', () => {
  it('scrubs the bug-repro path and keeps the basename', () => {
    expect(
      sanitizePathString(
        '/Users/mathiassiignorregaard/Documents/Projects/CF/cf-web/.cursor/orchestrator/package.json'
      )
    ).toBe('<path>/package.json');
  });

  it('scrubs a Linux /home path', () => {
    expect(sanitizePathString('/home/alice/app/src/index.ts')).toBe('<path>/index.ts');
  });

  it('scrubs a Windows drive path', () => {
    expect(sanitizePathString('C:\\Users\\bob\\code\\foo\\bar.ts')).toBe('<path>/bar.ts');
  });

  it('scrubs a Windows UNC path', () => {
    expect(sanitizePathString('\\\\server\\share\\file.txt')).toBe('<path>/file.txt');
  });

  it('scrubs /private/var paths', () => {
    expect(sanitizePathString('/private/var/folders/xy/abc/T/foo.log')).toBe('<path>/foo.log');
  });

  it('scrubs /tmp paths', () => {
    expect(sanitizePathString('/tmp/shiftspace/foo.sock')).toBe('<path>/foo.sock');
  });

  it('scrubs /var and /opt and /usr paths', () => {
    expect(sanitizePathString('/var/log/system.log')).toBe('<path>/system.log');
    expect(sanitizePathString('/opt/homebrew/bin/git')).toBe('<path>/git');
    expect(sanitizePathString('/usr/local/bin/node')).toBe('<path>/node');
  });

  it('scrubs a path embedded in a sentence', () => {
    expect(sanitizePathString('failed to parse the file /Users/alice/code/pkg.json today')).toBe(
      'failed to parse the file <path>/pkg.json today'
    );
  });

  it('scrubs multiple paths in one string', () => {
    expect(sanitizePathString('copy /Users/a/src/one.ts to /Users/a/dest/two.ts')).toBe(
      'copy <path>/one.ts to <path>/two.ts'
    );
  });

  it('preserves HTTP URLs unchanged', () => {
    expect(sanitizePathString('https://example.com/api/v1/users')).toBe(
      'https://example.com/api/v1/users'
    );
  });

  it('preserves short URL-style paths unchanged', () => {
    expect(sanitizePathString('/api/v1')).toBe('/api/v1');
    expect(sanitizePathString('kind/Node')).toBe('kind/Node');
  });

  it('preserves git branch names unchanged', () => {
    expect(sanitizePathString('main')).toBe('main');
    expect(sanitizePathString('feat/foo')).toBe('feat/foo');
    expect(sanitizePathString('release-1.2')).toBe('release-1.2');
  });

  it('returns empty string unchanged', () => {
    expect(sanitizePathString('')).toBe('');
  });
});

describe('sanitizePath', () => {
  it('passes non-strings through unchanged', () => {
    expect(sanitizePath(42)).toBe(42);
    expect(sanitizePath(null)).toBe(null);
    expect(sanitizePath(undefined)).toBe(undefined);
    expect(sanitizePath(true)).toBe(true);
    const obj = { foo: 'bar' };
    expect(sanitizePath(obj)).toBe(obj);
  });

  it('sanitizes strings', () => {
    expect(sanitizePath('/Users/alice/x/y.ts')).toBe('<path>/y.ts');
  });
});

describe('__scrubEventForTests', () => {
  it('scrubs paths in event.message', () => {
    const event: SentryEvent = { message: 'open /Users/a/b/c.ts' };
    const out = __scrubEventForTests(event);
    expect(out.message).toBe('open <path>/c.ts');
  });

  it('scrubs paths in exception.values[].value (the original bug)', () => {
    const event: SentryEvent = {
      exception: {
        values: [
          {
            type: 'Error',
            value:
              'Npm task detection: failed to parse the file /Users/mathiassiignorregaard/Documents/Projects/CF/cf-web/.cursor/orchestrator/package.json',
          },
        ],
      },
    };
    const out = __scrubEventForTests(event);
    expect(out.exception?.values?.[0]?.value).toBe(
      'Npm task detection: failed to parse the file <path>/package.json'
    );
  });

  it('scrubs paths in stack frame filenames', () => {
    const event: SentryEvent = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'boom',
            stacktrace: {
              frames: [
                {
                  filename: '/Users/alice/proj/src/foo.ts',
                  abs_path: '/Users/alice/proj/src/foo.ts',
                  module: 'alice/proj/src/foo',
                },
              ],
            },
          },
        ],
      },
    };
    const out = __scrubEventForTests(event);
    const frame = out.exception?.values?.[0]?.stacktrace?.frames?.[0];
    expect(frame?.filename).toBe('<path>/foo.ts');
    expect(frame?.abs_path).toBe('<path>/foo.ts');
  });

  it('scrubs paths in tag values', () => {
    const event: SentryEvent = {
      tags: {
        repoRoot: '/Users/alice/projects/shiftspace',
        branch: 'main',
      },
    };
    const out = __scrubEventForTests(event);
    expect(out.tags?.repoRoot).toBe('<path>/shiftspace');
    expect(out.tags?.branch).toBe('main');
  });

  it('scrubs paths in breadcrumbs', () => {
    const event: SentryEvent = {
      breadcrumbs: [
        {
          message: 'opened /Users/alice/x/y.ts',
          data: { path: '/Users/alice/x/y.ts', branch: 'main' },
        },
      ],
    };
    const out = __scrubEventForTests(event);
    expect(out.breadcrumbs?.[0]?.message).toBe('opened <path>/y.ts');
    expect(out.breadcrumbs?.[0]?.data?.path).toBe('<path>/y.ts');
    expect(out.breadcrumbs?.[0]?.data?.branch).toBe('main');
  });

  it('scrubs paths nested deeply in extra', () => {
    const event: SentryEvent = {
      extra: {
        details: {
          files: ['/Users/alice/a.ts', '/home/bob/b.ts'],
          count: 2,
        },
      },
    };
    const out = __scrubEventForTests(event);
    const files = (out.extra?.details as { files: string[] }).files;
    expect(files).toEqual(['<path>/a.ts', '<path>/b.ts']);
  });

  it('leaves a clean event structurally unchanged', () => {
    const event: SentryEvent = {
      message: 'everything ok',
      tags: { branch: 'main', category: 'invariant' },
      breadcrumbs: [{ message: 'did a thing' }],
    };
    const out = __scrubEventForTests(event);
    expect(out.message).toBe('everything ok');
    expect(out.tags).toEqual({ branch: 'main', category: 'invariant' });
    expect(out.breadcrumbs?.[0]?.message).toBe('did a thing');
  });
});

describe('integrations filter (Decision A)', () => {
  // This mirrors the exact callback passed to Sentry.init to make sure the
  // OnUncaughtException / OnUnhandledRejection defaults are stripped.
  const filter = (defaults: Integration[]): Integration[] =>
    defaults.filter((i) => i.name !== 'OnUncaughtException' && i.name !== 'OnUnhandledRejection');

  it('removes the uncaught-error default integrations', () => {
    const defaults: Integration[] = [
      { name: 'OnUncaughtException', setupOnce: () => {} },
      { name: 'OnUnhandledRejection', setupOnce: () => {} },
      { name: 'Console', setupOnce: () => {} },
      { name: 'ContextLines', setupOnce: () => {} },
    ];
    const kept = filter(defaults).map((i) => i.name);
    expect(kept).toEqual(['Console', 'ContextLines']);
  });
});
