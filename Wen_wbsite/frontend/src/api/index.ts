import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const client = axios.create({
  baseURL,
  timeout: 120000,
  withCredentials: true,
});

const refreshClient = axios.create({ baseURL, timeout: 15000, withCredentials: true });
let accessToken: string | null = null;
let refreshPromise: Promise<AuthSession> | null = null;
let authFailureHandler: (() => void) | null = null;

interface RetryConfig extends InternalAxiosRequestConfig {
  _authRetry?: boolean;
}

interface ApiResponse<T> {
  code: number;
  message: string;
  data?: T;
}

function unwrap<T>(response: ApiResponse<T>, fallback: string): T {
  if (response.code !== 0 && response.code !== 200) {
    throw new Error(response.message || fallback);
  }
  if (response.data === undefined) {
    throw new Error(fallback);
  }
  return response.data;
}

export interface User {
  id: number;
  phone: string;
  status: string;
  phoneVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: User;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function onAuthFailure(handler: (() => void) | null): void {
  authFailureHandler = handler;
}

client.interceptors.request.use(config => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

async function requestRefresh(): Promise<AuthSession> {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post<ApiResponse<AuthSession>>('/auth/refresh', {})
      .then(response => {
        const session = unwrap(response.data, '登录状态已失效');
        setAccessToken(session.accessToken);
        return session;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

client.interceptors.response.use(
  response => response,
  async (caught: AxiosError<ApiResponse<unknown>>) => {
    const config = caught.config as RetryConfig | undefined;
    const isAuthEndpoint = config?.url?.startsWith('/auth/') || false;
    if (caught.response?.status === 401 && config && !config._authRetry && !isAuthEndpoint) {
      config._authRetry = true;
      try {
        await requestRefresh();
        return client.request(config);
      } catch {
        setAccessToken(null);
        authFailureHandler?.();
      }
    }
    throw new Error(caught.response?.data?.message || caught.message || '请求失败');
  },
);

export interface Creation {
  id: number;
  userId: number;
  bookId: number | null;
  category: CreationCategory;
  prompt: string;
  content: string;
  createdAt: string;
  book?: { title: string } | null;
}

export type CreationCategory = 'adaptation' | 'script' | 'props' | 'dm' | 'other';

export interface CategoryOption {
  value: string;
  label: string;
  count: number;
}

export interface CommunityCreation {
  id: number;
  userId: number;
  bookId: number | null;
  category: CreationCategory;
  prompt: string;
  createdAt: string;
  user: { phone: string };
  book: { title: string } | null;
}

export interface CreationDetail extends CommunityCreation {
  content: string;
  book: { title: string; author: string } | null;
}

export async function getBookList(page = 1, category?: string): Promise<{
  list: { id: number; title: string; author: string; category: string | null; description: string | null; summary: string | null }[];
  totalPages: number;
  currentPage: number;
  totalCount: number;
}> {
  const response = await client.get<ApiResponse<{
    list: { id: number; title: string; author: string; category: string | null; description: string | null; summary: string | null }[];
    totalPages: number;
    currentPage: number;
    totalCount: number;
  }>>('/books', { params: { page, category } });
  return unwrap(response.data, '获取书籍列表失败');
}

export async function getBookCategories(): Promise<CategoryOption[]> {
  const response = await client.get<ApiResponse<CategoryOption[]>>('/books/categories');
  return unwrap(response.data, '获取书籍分类失败');
}

export async function getBookContent(id: number): Promise<{
  title: string;
  author: string;
  content: string;
  annotations: { index: number; content: string }[];
  characters: { id: number; name: string; description: string | null }[];
}> {
  const response = await client.get<ApiResponse<{
    title: string;
    author: string;
    content: string;
    annotations: { index: number; content: string }[];
    characters: { id: number; name: string; description: string | null }[];
  }>>(`/books/${id}/content`);
  return unwrap(response.data, '获取书籍内容失败');
}

export async function getBookTranslation(id: number): Promise<string> {
  const response = await client.post<ApiResponse<{ translation: string }>>(`/books/${id}/translation`, {});
  return unwrap(response.data, '获取译文失败').translation;
}

export async function adaptBook(
  translation: string,
  type: 'adapt' | 'creative' | 'script' | 'custom',
  prompt: string
): Promise<string> {
  const response = await client.post<ApiResponse<{ adaptedContent: string }>>('/adapt', {
    translation,
    type,
    prompt,
  });
  return unwrap(response.data, '生成内容失败').adaptedContent;
}

async function authenticate(path: '/auth/login' | '/auth/register', phone: string, password: string, code?: string): Promise<AuthSession> {
  const response = await client.post<ApiResponse<AuthSession>>(path, { phone, password, ...(code ? { code } : {}) });
  const session = unwrap(response.data, '登录失败');
  setAccessToken(session.accessToken);
  return session;
}

export function login(phone: string, password: string): Promise<AuthSession> {
  return authenticate('/auth/login', phone, password);
}

export async function sendRegistrationCode(phone: string): Promise<{ retryAfter: number }> {
  const response = await client.post<ApiResponse<{ retryAfter: number }>>('/auth/register/code', { phone });
  return unwrap(response.data, '验证码发送失败');
}

export function register(phone: string, password: string, code: string): Promise<AuthSession> {
  return authenticate('/auth/register', phone, password, code);
}

export async function refreshAuth(): Promise<AuthSession> {
  try {
    return await requestRefresh();
  } catch (caught) {
    if (axios.isAxiosError<ApiResponse<unknown>>(caught) && caught.response?.data?.message) {
      throw new Error(caught.response.data.message);
    }
    throw caught;
  }
}

export async function getCurrentUser(): Promise<User> {
  const response = await client.get<ApiResponse<User>>('/auth/me');
  return unwrap(response.data, '获取用户信息失败');
}

export async function logout(): Promise<void> {
  try {
    await refreshClient.post('/auth/logout', {});
  } finally {
    setAccessToken(null);
  }
}

export async function saveCreation(data: {
  bookId?: number;
  category: CreationCategory;
  prompt: string;
  content: string;
}): Promise<Creation> {
  const response = await client.post<ApiResponse<Creation>>('/users/creation', data);
  return unwrap(response.data, '保存创作失败');
}

export async function getUserCreations(): Promise<Creation[]> {
  const response = await client.get<ApiResponse<Creation[]>>('/users/me/creations');
  return unwrap(response.data, '获取创作历史失败');
}

export async function getCommunityCreations(page = 1, category?: CreationCategory): Promise<{
  list: CommunityCreation[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
}> {
  const response = await client.get<ApiResponse<{
    list: CommunityCreation[];
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
  }>>('/community/creations', {
    params: { page, category },
  });
  return unwrap(response.data, '获取社区列表失败');
}

export async function getCommunityCategories(): Promise<Array<CategoryOption & { value: CreationCategory }>> {
  const response = await client.get<ApiResponse<Array<CategoryOption & { value: CreationCategory }>>>('/community/categories');
  return unwrap(response.data, '获取社区分类失败');
}

export async function getCreationDetail(id: number): Promise<CreationDetail> {
  const response = await client.get<ApiResponse<CreationDetail>>(`/community/creations/${id}`);
  return unwrap(response.data, '获取作品详情失败');
}
