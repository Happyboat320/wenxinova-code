import { beforeEach, describe, expect, it, vi } from 'vitest';

const bookKnowledgeGraph = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
const book = vi.hoisted(() => ({ findUnique: vi.fn() }));
const generateKnowledgeGraph = vi.hoisted(() => vi.fn());

vi.mock('../../lib/prisma.js', () => ({ default: { bookKnowledgeGraph, book } }));
vi.mock('../../lib/deepseek.js', () => ({ generateKnowledgeGraph }));

import { generateAndCacheKnowledgeGraph, getKnowledgeGraph } from './knowledge-graph.service.js';

describe('知识图谱缓存', () => {
  beforeEach(() => vi.clearAllMocks());

  it('已有缓存时直接反序列化，不重复调用 LLM', async () => {
    bookKnowledgeGraph.findUnique.mockResolvedValue({
      timelineJson: '[{"id":"e1"}]', relationshipJson: '{"nodes":[],"edges":[]}', generatedAt: new Date('2026-01-01'),
    });
    await expect(getKnowledgeGraph(1)).resolves.toMatchObject({ timeline: [{ id: 'e1' }] });
    await generateAndCacheKnowledgeGraph(1);
    expect(generateKnowledgeGraph).not.toHaveBeenCalled();
  });

  it('无缓存时生成结构化数据并写入书籍缓存', async () => {
    bookKnowledgeGraph.findUnique.mockResolvedValue(null);
    book.findUnique.mockResolvedValue({ title: '任氏传', author: '沈既济', originalText: '原文' });
    generateKnowledgeGraph.mockResolvedValue({ timeline: [{ id: 'e1' }], relationships: { nodes: [], edges: [] } });
    bookKnowledgeGraph.upsert.mockResolvedValue({
      timelineJson: '[{"id":"e1"}]', relationshipJson: '{"nodes":[],"edges":[]}', generatedAt: new Date(),
    });
    await generateAndCacheKnowledgeGraph(1);
    expect(bookKnowledgeGraph.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { bookId: 1 }, create: expect.objectContaining({ bookId: 1 }),
    }));
  });
});
