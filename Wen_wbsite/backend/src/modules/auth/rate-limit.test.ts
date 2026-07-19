import { beforeEach, describe, expect, it } from 'vitest';
import { consumeLimit, resetRateLimitsForTests } from './rate-limit.js';

describe('本地费用保护限流', () => {
  beforeEach(resetRateLimitsForTests);

  it('超过窗口配额时返回 retryAfter', () => {
    consumeLimit('phone:13800000000', 1, 60_000);
    expect(() => consumeLimit('phone:13800000000', 1, 60_000)).toThrow('请求过于频繁');
    try {
      consumeLimit('phone:13800000000', 1, 60_000);
    } catch (caught) {
      expect((caught as { retryAfter: number }).retryAfter).toBeGreaterThan(0);
    }
  });

  it('不同手机号使用独立配额', () => {
    consumeLimit('phone:13800000000', 1, 60_000);
    expect(() => consumeLimit('phone:13900000000', 1, 60_000)).not.toThrow();
  });
});

