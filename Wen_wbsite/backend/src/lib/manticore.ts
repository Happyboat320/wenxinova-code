const MANTICORE_HTTP_URL = (process.env.MANTICORE_HTTP_URL || 'http://127.0.0.1:9308').replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.MANTICORE_TIMEOUT_MS || '5000', 10);

export const LIBRARY_INDEX = process.env.MANTICORE_LIBRARY_INDEX || 'wenxin_library';
export const COMMUNITY_INDEX = process.env.MANTICORE_COMMUNITY_INDEX || 'wenxin_community';

export class SearchUnavailableError extends Error {
  constructor(message = '检索服务暂时不可用') {
    super(message);
    this.name = 'SearchUnavailableError';
  }
}

type SearchHit = { _id: string | number };
type SearchResponse = {
  hits?: {
    total?: number | { value?: number };
    hits?: SearchHit[];
  };
  error?: string;
};

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(Number.isFinite(REQUEST_TIMEOUT_MS) ? REQUEST_TIMEOUT_MS : 5000);
}

async function request(path: string, init: RequestInit): Promise<Response> {
  try {
    const response = await fetch(`${MANTICORE_HTTP_URL}${path}`, {
      ...init,
      signal: timeoutSignal(),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Manticore HTTP ${response.status}: ${detail}`);
    }
    return response;
  } catch (caught) {
    if (caught instanceof SearchUnavailableError) throw caught;
    const detail = caught instanceof Error ? caught.message : String(caught);
    throw new SearchUnavailableError(`检索服务暂时不可用：${detail}`);
  }
}

export async function executeSearchSql(query: string): Promise<unknown> {
  const body = new URLSearchParams({ query });
  const response = await request('/sql?mode=raw', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  return response.json();
}

// 中文采用单字 n-gram，古典篇名、人名及无空格正文都可以按连续关键词命中。
export async function ensureSearchIndexes(): Promise<void> {
  await executeSearchSql(`CREATE TABLE IF NOT EXISTS ${LIBRARY_INDEX} (
    title text,
    author text,
    summary text,
    category string
  ) charset_table='non_cjk' min_infix_len='1' ngram_len='1' ngram_chars='U+3400..U+4DBF, U+4E00..U+9FFF, U+F900..U+FAFF, U+20000..U+2FA1F'`);
  await executeSearchSql(`CREATE TABLE IF NOT EXISTS ${COMMUNITY_INDEX} (
    nickname text,
    source_title text,
    content text,
    category string,
    published_at timestamp
  ) charset_table='non_cjk' min_infix_len='1' ngram_len='1' ngram_chars='U+3400..U+4DBF, U+4E00..U+9FFF, U+F900..U+FAFF, U+20000..U+2FA1F'`);
}

export async function truncateSearchIndex(index: string): Promise<void> {
  await executeSearchSql(`TRUNCATE TABLE ${index}`);
}

export async function replaceSearchDocument(index: string, id: number, doc: Record<string, unknown>): Promise<void> {
  await request('/replace', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ index, id, doc }),
  });
}

export async function deleteSearchDocument(index: string, id: number): Promise<void> {
  await request('/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ index, id }),
  });
}

export async function bulkInsertSearchDocuments(
  index: string,
  documents: Array<{ id: number; doc: Record<string, unknown> }>,
): Promise<void> {
  if (documents.length === 0) return;
  const body = `${documents.map(({ id, doc }) => JSON.stringify({ insert: { index, id, doc } })).join('\n')}\n`;
  const response = await request('/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/x-ndjson' },
    body,
  });
  const result = await response.text();
  // bulk 接口可能以 HTTP 200 返回逐条错误，因此仍需检查响应内容。
  let hasErrors = false;
  try {
    const parsed = JSON.parse(result) as { errors?: boolean; error?: string };
    hasErrors = parsed.errors === true || Boolean(parsed.error);
  } catch {
    hasErrors = true;
  }
  if (hasErrors) {
    throw new SearchUnavailableError(`批量写入检索索引失败：${result.slice(0, 500)}`);
  }
}

function totalValue(total: SearchResponse['hits'] extends infer _T ? number | { value?: number } | undefined : never): number {
  return typeof total === 'number' ? total : Number(total?.value || 0);
}

export async function searchDocumentIds(options: {
  index: string;
  query: string;
  fields: string[];
  offset: number;
  limit: number;
  category?: string | string[];
  categoryNot?: string | string[];
}): Promise<{ ids: number[]; total: number }> {
  const must: unknown[] = [{
    match: {
      [options.fields.join(',')]: {
        query: options.query,
        operator: 'and',
      },
    },
  }];
  if (Array.isArray(options.category)) {
    const categories = [...new Set(options.category)].filter(Boolean);
    if (categories.length === 1) {
      must.push({ equals: { category: categories[0] } });
    } else if (categories.length > 1) {
      must.push({ in: { category: categories } });
    }
  } else if (options.category) {
    must.push({ equals: { category: options.category } });
  }
  const mustNot: unknown[] = [];
  const excludedCategories = Array.isArray(options.categoryNot)
    ? [...new Set(options.categoryNot)].filter(Boolean)
    : (options.categoryNot ? [options.categoryNot] : []);
  if (excludedCategories.length === 1) {
    mustNot.push({ equals: { category: excludedCategories[0] } });
  } else if (excludedCategories.length > 1) {
    mustNot.push({ in: { category: excludedCategories } });
  }

  const response = await request('/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      index: options.index,
      query: { bool: mustNot.length > 0 ? { must, must_not: mustNot } : { must } },
      offset: options.offset,
      limit: options.limit,
      sort: [{ _score: 'desc' }, { id: 'asc' }],
      options: { max_matches: 100000 },
    }),
  });
  const data = await response.json() as SearchResponse;
  if (data.error) throw new SearchUnavailableError(`检索失败：${data.error}`);
  return {
    ids: (data.hits?.hits || []).map(hit => Number(hit._id)).filter(Number.isInteger),
    total: totalValue(data.hits?.total),
  };
}
