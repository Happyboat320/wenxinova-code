import type { NextFunction, Request, Response } from 'express';
import { error } from '../../lib/response.js';

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

export function consumeLimit(key: string, max: number, windowMs: number): number {
  const now = Date.now();
  const bucket = buckets.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter(timestamp => timestamp > now - windowMs);
  if (bucket.timestamps.length >= max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.timestamps[0] + windowMs - now) / 1000));
    throw Object.assign(new Error('请求过于频繁，请稍后重试'), { retryAfter });
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return Math.ceil(windowMs / 1000);
}

const activeAiRequests = new Map<number, number>();

export function aiUsageGuard(req: Request, res: Response, next: NextFunction): void {
  const userId = req.auth!.userId;
  try {
    consumeLimit(`ai:user:${userId}`, 20, 60 * 60 * 1000);
    consumeLimit(`ai:ip:${req.ip}`, 40, 60 * 60 * 1000);
  } catch (caught) {
    const retryAfter = Number((caught as { retryAfter?: number }).retryAfter || 60);
    res.setHeader('Retry-After', retryAfter);
    res.status(429).json(error('AI 调用过于频繁，请稍后重试', 429));
    return;
  }

  const active = activeAiRequests.get(userId) || 0;
  if (active >= 2) {
    res.status(429).json(error('已有生成任务正在进行，请稍候', 429));
    return;
  }

  activeAiRequests.set(userId, active + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const remaining = (activeAiRequests.get(userId) || 1) - 1;
    if (remaining <= 0) activeAiRequests.delete(userId);
    else activeAiRequests.set(userId, remaining);
  };
  res.once('finish', release);
  res.once('close', release);
  next();
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
  activeAiRequests.clear();
}

