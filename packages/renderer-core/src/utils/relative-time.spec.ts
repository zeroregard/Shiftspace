import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime, getTickInterval } from './relative-time';

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function atAge(ageMs: number): number {
    const now = Date.now();
    return now - ageMs;
  }

  it('returns null for 0 timestamp', () => {
    expect(formatRelativeTime(0)).toBeNull();
  });

  it('returns null for future timestamps', () => {
    expect(formatRelativeTime(Date.now() + 60_000)).toBeNull();
  });

  it('shows seconds for ages under 1 minute', () => {
    expect(formatRelativeTime(atAge(3_000))).toBe('3s');
    expect(formatRelativeTime(atAge(30_000))).toBe('30s');
    expect(formatRelativeTime(atAge(59_000))).toBe('59s');
  });

  it('clamps to at least 1s', () => {
    expect(formatRelativeTime(atAge(500))).toBe('1s');
  });

  it('shows minutes for ages under 1 hour', () => {
    expect(formatRelativeTime(atAge(60_000))).toBe('1m');
    expect(formatRelativeTime(atAge(2 * 60_000))).toBe('2m');
    expect(formatRelativeTime(atAge(59 * 60_000))).toBe('59m');
  });

  it('shows hours for ages under 1 day', () => {
    expect(formatRelativeTime(atAge(60 * 60_000))).toBe('1h');
    expect(formatRelativeTime(atAge(23 * 60 * 60_000))).toBe('23h');
  });

  it('shows days for ages under 2 weeks', () => {
    expect(formatRelativeTime(atAge(24 * 60 * 60_000))).toBe('1d');
    expect(formatRelativeTime(atAge(3 * 24 * 60 * 60_000))).toBe('3d');
    expect(formatRelativeTime(atAge(13 * 24 * 60 * 60_000))).toBe('13d');
  });

  it('shows weeks for ages 2 weeks and above', () => {
    expect(formatRelativeTime(atAge(14 * 24 * 60 * 60_000))).toBe('2w');
    expect(formatRelativeTime(atAge(21 * 24 * 60 * 60_000))).toBe('3w');
  });
});

describe('getTickInterval', () => {
  function atAge(ageMs: number): number {
    return Date.now() - ageMs;
  }

  it('returns 60s for 0 timestamp', () => {
    expect(getTickInterval(0)).toBe(60_000);
  });

  it('returns 10s for ages under 1 minute', () => {
    expect(getTickInterval(atAge(5_000))).toBe(10_000);
    expect(getTickInterval(atAge(50_000))).toBe(10_000);
  });

  it('returns 30s for ages under 1 hour', () => {
    expect(getTickInterval(atAge(2 * 60_000))).toBe(30_000);
    expect(getTickInterval(atAge(30 * 60_000))).toBe(30_000);
  });

  it('returns 60s for ages 1 hour and above', () => {
    expect(getTickInterval(atAge(60 * 60_000))).toBe(60_000);
    expect(getTickInterval(atAge(5 * 60 * 60_000))).toBe(60_000);
  });
});
