import { describe, expect, it } from 'vitest';
import { deepClean } from './firestoreSync';

describe('deepClean', () => {
  it('removes undefined fields and preserves nulls', () => {
    const input = {
      a: 1,
      b: undefined,
      c: null,
      d: {
        e: undefined,
        f: 'ok',
      },
      g: [1, undefined, 2],
    };

    expect(deepClean(input)).toEqual({
      a: 1,
      c: null,
      d: { f: 'ok' },
      g: [1, 2],
    });
  });

  it('preserves serverTimestamp sentinels and timestamps', () => {
    const sentinel = { _methodName: 'serverTimestamp' };
    const ts = { constructor: { name: 'Timestamp' }, toDate: () => new Date() };
    const input = { createdAt: sentinel, updatedAt: ts, name: 'x', missing: undefined };
    const cleaned = deepClean(input) as { createdAt: unknown; updatedAt: unknown };
    expect(cleaned.createdAt).toEqual(sentinel);
    expect(cleaned.updatedAt).toEqual(ts);
    expect('missing' in cleaned).toBe(false);
  });
});

