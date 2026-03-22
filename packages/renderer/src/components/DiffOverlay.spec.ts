import { describe, it, expect } from 'vitest';
import { getOverlayPosition, OVERLAY_W, OVERLAY_MAX_H } from './DiffOverlay';

describe('getOverlayPosition', () => {
  it('places overlay to the right of cursor when space permits', () => {
    const { left } = getOverlayPosition(100, 300, 1200, 800);
    expect(left).toBe(120); // 100 + 20
  });

  it('flips overlay to the left when it would overflow the right edge', () => {
    const { left } = getOverlayPosition(1000, 300, 1200, 800);
    expect(left).toBe(1000 - 20 - OVERLAY_W); // flip left
  });

  it('clamps top to minimum 8px', () => {
    const { top } = getOverlayPosition(100, 5, 1200, 800);
    expect(top).toBe(8);
  });

  it('clamps top so overlay does not exceed bottom of viewport', () => {
    const { top } = getOverlayPosition(100, 790, 1200, 800);
    expect(top).toBe(800 - OVERLAY_MAX_H - 8);
  });

  it('places overlay vertically at y - 20 when within bounds', () => {
    const { top } = getOverlayPosition(100, 400, 1200, 800);
    expect(top).toBe(380); // 400 - 20
  });
});
