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
