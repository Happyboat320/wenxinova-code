import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchDocumentIds } from '../../lib/manticore.js';
import { isSearchQueryTooLong, normalizeSearchQuery } from './search.service.js';

describe('Manticore 检索参数', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('清理关键词空白并限制最多 100 个字符', () => {
    expect(normalizeSearchQuery('  盐米\n  民生  ')).toBe('盐米 民生');
    expect(normalizeSearchQuery('   ')).toBeUndefined();
    expect(isSearchQueryTooLong('文'.repeat(101))).toBe(true);
    expect(isSearchQueryTooLong('文'.repeat(100))).toBe(false);
  });

  it('向 Manticore 发送字段范围、分类与分页并解析相关 ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      hits: { total: 2, hits: [{ _id: '8' }, { _id: 3 }] },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchDocumentIds({
      index: 'wenxin_community',
      query: '盐米案',
      fields: ['nickname', 'source_title', 'content'],
      category: 'dm',
      offset: 20,
      limit: 20,
    })).resolves.toEqual({ ids: [8, 3], total: 2 });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      index: 'wenxin_community',
      offset: 20,
      limit: 20,
      query: {
        bool: {
          must: [
            { match: { 'nickname,source_title,content': { query: '盐米案', operator: 'and' } } },
            { equals: { category: 'dm' } },
          ],
        },
      },
    });
  });

  it('向 Manticore 发送多分类过滤', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      hits: { total: { value: 1 }, hits: [{ _id: '11' }] },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchDocumentIds({
      index: 'wenxin_library',
      query: '山水',
      fields: ['title', 'author', 'summary'],
      category: ['散文', '诗', '散文'],
      offset: 0,
      limit: 9,
    })).resolves.toEqual({ ids: [11], total: 1 });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      query: {
        bool: {
          must: [
            { match: { 'title,author,summary': { query: '山水', operator: 'and' } } },
            { in: { category: ['散文', '诗'] } },
          ],
        },
      },
    });
  });

  it('向 Manticore 发送分类排除过滤', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      hits: { total: { value: 1 }, hits: [{ _id: '12' }] },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchDocumentIds({
      index: 'wenxin_library',
      query: '异闻',
      fields: ['title', 'author', 'summary'],
      categoryNot: ['神怪小说', '传奇', '传奇'],
      offset: 0,
      limit: 9,
    })).resolves.toEqual({ ids: [12], total: 1 });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      query: {
        bool: {
          must: [
            { match: { 'title,author,summary': { query: '异闻', operator: 'and' } } },
          ],
          must_not: [
            { in: { category: ['神怪小说', '传奇'] } },
          ],
        },
      },
    });
  });

  it('Manticore 不可用时返回统一的检索服务异常', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));
    await expect(searchDocumentIds({
      index: 'wenxin_library',
      query: '不可少',
      fields: ['title', 'author', 'summary'],
      offset: 0,
      limit: 9,
    })).rejects.toMatchObject({ name: 'SearchUnavailableError' });
  });
});
