import { describe, expect, it } from 'vitest';
import { SettleDetector } from './SettleDetector';

describe('SettleDetector', () => {
  it('すべての玉が 0.08 未満のまま 120ms 続いたら止まったとみなす', () => {
    const d = new SettleDetector();
    expect(d.update([0.01, 0.07], 0.06)).toBe(false);
    expect(d.update([0.01, 0.07], 0.059)).toBe(false);
    expect(d.update([0.01, 0.07], 0.002)).toBe(true);
  });

  it('途中で 0.08 以上になったら数え直す', () => {
    const d = new SettleDetector();
    d.update([0.0], 0.1);
    d.update([0.5], 0.01);
    expect(d.update([0.0], 0.1)).toBe(false);
    expect(d.update([0.0], 0.03)).toBe(true);
  });

  it('動き続けても、動き始めから 1.4秒で止まったとみなす', () => {
    const d = new SettleDetector();
    expect(d.update([5], 1.39)).toBe(false);
    expect(d.update([5], 0.01)).toBe(true);
  });
});
