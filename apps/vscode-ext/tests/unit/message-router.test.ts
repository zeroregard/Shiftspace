import { describe, it, expect, vi } from 'vitest';
import { MessageRouter } from '../../src/webview/message-router';

describe('MessageRouter', () => {
  it('dispatches to registered handler', () => {
    const router = new MessageRouter();
    const handler = vi.fn();
    router.on('test', handler);

    router.dispatch({ type: 'test' });

    expect(handler).toHaveBeenCalledWith({ type: 'test' });
  });

  it('silently ignores unregistered message types', () => {
    const router = new MessageRouter();
    expect(() => router.dispatch({ type: 'unknown' })).not.toThrow();
  });

  it('clear() removes all handlers', () => {
    const router = new MessageRouter();
    const handler = vi.fn();
    router.on('test', handler);
    router.clear();

    router.dispatch({ type: 'test' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('re-registering after clear() works', () => {
    const router = new MessageRouter();
    const first = vi.fn();
    const second = vi.fn();
    router.on('ready', first);
    router.clear();
    router.on('ready', second);

    router.dispatch({ type: 'ready' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  /**
   * Regression: the "ready" handler must be registered in the constructor,
   * BEFORE registerHandlers() is called (which happens inside onReady).
   * If the first "ready" message is dropped, the panel never initialises
   * and shows "no worktrees". This test encodes the invariant.
   */
  it('ready handler registered before clear+re-register survives the bootstrap sequence', () => {
    const router = new MessageRouter();
    const onReady = vi.fn();

    // Simulate constructor: register ready handler immediately
    router.on('ready', onReady);

    // Simulate webview sending "ready" — this must work
    router.dispatch({ type: 'ready' });
    expect(onReady).toHaveBeenCalledOnce();

    // Simulate registerHandlers() called from inside onReady:
    // clear + re-register all handlers including ready
    router.clear();
    const onReadyAgain = vi.fn();
    router.on('ready', onReadyAgain);
    router.on('file-click', vi.fn());

    // Simulate webview reload sending "ready" again
    router.dispatch({ type: 'ready' });
    expect(onReadyAgain).toHaveBeenCalledOnce();
    // Original handler should not fire again after clear
    expect(onReady).toHaveBeenCalledOnce();
  });
});
