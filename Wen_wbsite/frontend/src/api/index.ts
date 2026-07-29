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
  nickname: string | null;
  signature: string | null;
  avatar: string | null;
  status: string;
  role: 'user' | 'admin';
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
  status: 'draft' | 'pending' | 'published' | 'rejected';
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  book?: { title: string } | null;
}

export interface AdminApplication {
  id: number;
  remark: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface KnowledgeGraph {
  timeline: Array<{ id: string; time: string; title: string; description: string; characters: string[] }>;
  relationships: {
    nodes: Array<{ id: string; name: string; description: string }>;
    edges: Array<{ source: string; target: string; relation: string; description: string }>;
  };
  generatedAt: string;
}

export type CreationCategory = 'adaptation' | 'script' | 'props' | 'dm' | 'other';

export interface CategoryOption {
  value: string;
  label: string;
  count: number;
}

export interface BookChapterOption {
  id: number;
  order: number;
  title: string;
}

export interface BookContent {
  title: string;
  author: string;
  content: string;
  chapter: (BookChapterOption & { summary: string | null }) | null;
  chapters: BookChapterOption[];
  annotations: { index: number; content: string }[];
  characters: { id: number; name: string; description: string | null }[];
}

export interface FavoriteCharacter {
  id: number;
  userId: number;
  bookId: number | null;
  chapterId: number | null;
  characterId: number | null;
  name: string;
  description: string | null;
  deeds: string | null;
  sourceType: string;
  sourceTitle: string | null;
  sourceChapterTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CoPlaySessionCharacter {
  id: number;
  sessionId: number;
  favoriteCharacterId: number | null;
  position: number;
  name: string;
  description: string | null;
  deeds: string | null;
  sourceTitle: string | null;
  createdAt: string;
}

export interface CoPlayMessage {
  id: number;
  sessionId: number;
  role: 'user' | 'character' | 'system';
  characterName: string | null;
  content: string;
  order: number;
  createdAt: string;
}

export interface CoPlaySession {
  id: number;
  userId: number;
  title: string;
  scene: string;
  createdAt: string;
  updatedAt: string;
  characters: CoPlaySessionCharacter[];
  messages: CoPlayMessage[];
}

export interface CommunityCreation {
  id: number;
  userId: number;
  bookId: number | null;
  category: CreationCategory;
  prompt: string;
  createdAt: string;
  publishedAt: string | null;
  likeCount: number;
  commentCount: number;
  user: { nickname?: string | null; avatar?: string | null; phone?: string };
  book: { title: string } | null;
}

export interface CommunityComment {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: { nickname?: string | null; avatar?: string | null };
}

export interface CreationDetail extends CommunityCreation {
  content: string;
  likedByCurrentUser: boolean;
  comments: CommunityComment[];
  book: { title: string; author: string } | null;
}

export async function getBookList(page = 1, category?: string, query?: string): Promise<{
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
  }>>('/books', { params: { page, category, q: query } });
  return unwrap(response.data, '获取书籍列表失败');
}

export async function getBookCategories(): Promise<CategoryOption[]> {
  const response = await client.get<ApiResponse<CategoryOption[]>>('/books/categories');
  return unwrap(response.data, '获取书籍分类失败');
}

export async function getBookContent(id: number, chapterId?: number): Promise<BookContent> {
  const response = await client.get<ApiResponse<BookContent>>(`/books/${id}/content`, { params: { chapterId } });
  return unwrap(response.data, '获取书籍内容失败');
}

export async function getBookTranslation(id: number, chapterId?: number): Promise<string> {
  const response = await client.post<ApiResponse<{ translation: string }>>(`/books/${id}/translation`, { chapterId });
  return unwrap(response.data, '获取译文失败').translation;
}

export async function getKnowledgeGraph(id: number): Promise<KnowledgeGraph | null> {
  const response = await client.get<ApiResponse<KnowledgeGraph | null>>(`/books/${id}/knowledge-graph`);
  return unwrap(response.data, '获取知识图谱失败');
}

export async function generateKnowledgeGraph(id: number): Promise<KnowledgeGraph> {
  const response = await client.post<ApiResponse<KnowledgeGraph>>(`/books/${id}/knowledge-graph`, {});
  return unwrap(response.data, '生成知识图谱失败');
}

export async function regenerateKnowledgeGraph(id: number): Promise<KnowledgeGraph> {
  const response = await client.post<ApiResponse<KnowledgeGraph>>(`/admin/books/${id}/knowledge-graph/regenerate`, {});
  return unwrap(response.data, '重新生成知识图谱失败');
}

export async function adaptBook(
  translation: string,
  type: 'adapt' | 'creative' | 'script' | 'custom' | 'continue',
  prompt: string
): Promise<string> {
  const response = await client.post<ApiResponse<{ adaptedContent: string }>>('/adapt', {
    translation,
    type,
    prompt,
  });
  return unwrap(response.data, '生成内容失败').adaptedContent;
}

async function authenticate(path: '/auth/login' | '/auth/register', phone: string, password: string, code?: string, nickname?: string): Promise<AuthSession> {
  const response = await client.post<ApiResponse<AuthSession>>(path, {
    phone,
    password,
    ...(code ? { code } : {}),
    ...(nickname ? { nickname } : {}),
  });
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

export function register(phone: string, password: string, code: string, nickname: string): Promise<AuthSession> {
  return authenticate('/auth/register', phone, password, code, nickname);
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

export async function updateProfile(data: { nickname: string; signature: string; avatar?: string | null }): Promise<User> {
  const response = await client.patch<ApiResponse<User>>('/users/me/profile', data);
  return unwrap(response.data, '更新个人资料失败');
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
  action: 'draft' | 'publish';
  draftId?: number;
}): Promise<Creation> {
  const response = await client.post<ApiResponse<Creation>>('/users/creation', data);
  return unwrap(response.data, '保存创作失败');
}

export async function getDraft(bookId: number, category: CreationCategory): Promise<Creation | null> {
  const response = await client.get<ApiResponse<Creation | null>>('/users/me/draft', {
    params: { bookId, category },
  });
  return unwrap(response.data, '获取草稿失败');
}

export async function getUserCreations(): Promise<Creation[]> {
  const response = await client.get<ApiResponse<Creation[]>>('/users/me/creations');
  return unwrap(response.data, '获取创作历史失败');
}

export async function getAdminApplication(): Promise<AdminApplication | null> {
  const response = await client.get<ApiResponse<AdminApplication | null>>('/users/me/admin-application');
  return unwrap(response.data, '获取管理员申请失败');
}

export async function applyForAdmin(remark: string): Promise<AdminApplication> {
  const response = await client.post<ApiResponse<AdminApplication>>('/users/me/admin-application', { remark });
  return unwrap(response.data, '提交管理员申请失败');
}

export interface AdminDashboard {
  creations: Array<Creation & {
    user: { id: number; phone: string; nickname: string | null; avatar: string | null };
    book: { title: string } | null;
  }>;
  applications: Array<AdminApplication & {
    user: { id: number; phone: string; nickname: string | null; avatar: string | null };
  }>;
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const response = await client.get<ApiResponse<AdminDashboard>>('/admin/dashboard');
  return unwrap(response.data, '加载管理审核台失败');
}

export async function reviewCreation(id: number, decision: 'approve' | 'reject', reviewNote: string): Promise<void> {
  await client.post(`/admin/creations/${id}/review`, { decision, reviewNote });
}

export async function reviewAdminApplication(id: number, decision: 'approve' | 'reject', reviewNote: string): Promise<void> {
  await client.post(`/admin/applications/${id}/review`, { decision, reviewNote });
}

export async function getCommunityCreations(page = 1, category?: CreationCategory, query?: string): Promise<{
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
    params: { page, category, q: query },
  });
  const data = unwrap(response.data, '获取社区列表失败');
  return {
    ...data,
    list: data.list.map(creation => ({
      ...creation,
      likeCount: Number.isFinite(creation.likeCount) ? creation.likeCount : 0,
      commentCount: Number.isFinite(creation.commentCount) ? creation.commentCount : 0,
    })),
  };
}

export async function getCommunityCategories(): Promise<Array<CategoryOption & { value: CreationCategory }>> {
  const response = await client.get<ApiResponse<Array<CategoryOption & { value: CreationCategory }>>>('/community/categories');
  return unwrap(response.data, '获取社区分类失败');
}

export async function getCreationDetail(id: number): Promise<CreationDetail> {
  const response = await client.get<ApiResponse<CreationDetail>>(`/community/creations/${id}`);
  const detail = unwrap(response.data, '获取作品详情失败');
  return {
    ...detail,
    likeCount: Number.isFinite(detail.likeCount) ? detail.likeCount : 0,
    commentCount: Number.isFinite(detail.commentCount) ? detail.commentCount : 0,
    likedByCurrentUser: detail.likedByCurrentUser === true,
    comments: Array.isArray(detail.comments) ? detail.comments : [],
  };
}

export async function toggleCreationLike(id: number): Promise<{ liked: boolean; likeCount: number }> {
  const response = await client.post<ApiResponse<{ liked: boolean; likeCount: number }>>(`/community/creations/${id}/like`);
  return unwrap(response.data, '更新点赞失败');
}

export async function addCreationComment(id: number, content: string): Promise<CommunityComment> {
  const response = await client.post<ApiResponse<CommunityComment>>(`/community/creations/${id}/comments`, { content });
  return unwrap(response.data, '发布评论失败');
}

export async function getFavoriteCharacters(): Promise<FavoriteCharacter[]> {
  const response = await client.get<ApiResponse<FavoriteCharacter[]>>('/co-play/favorites');
  return unwrap(response.data, '获取收藏角色失败');
}

export async function addFavoriteCharacter(data: {
  bookId?: number;
  chapterId?: number;
  characterId?: number;
  name: string;
  description?: string | null;
  deeds?: string | null;
  sourceType?: 'ai' | 'database' | 'manual';
  sourceTitle?: string;
  sourceChapterTitle?: string | null;
}): Promise<FavoriteCharacter> {
  const response = await client.post<ApiResponse<FavoriteCharacter>>('/co-play/favorites', data);
  return unwrap(response.data, '收藏角色失败');
}

export async function removeFavoriteCharacter(id: number): Promise<void> {
  await client.delete(`/co-play/favorites/${id}`);
}

export async function getCoPlaySessions(): Promise<CoPlaySession[]> {
  const response = await client.get<ApiResponse<CoPlaySession[]>>('/co-play/sessions');
  return unwrap(response.data, '获取数字共演会话失败');
}

export async function createCoPlaySession(data: {
  title?: string;
  scene: string;
  favoriteCharacterIds: number[];
}): Promise<CoPlaySession> {
  const response = await client.post<ApiResponse<CoPlaySession>>('/co-play/sessions', data);
  return unwrap(response.data, '创建数字共演会话失败');
}

export async function getCoPlaySession(id: number): Promise<CoPlaySession> {
  const response = await client.get<ApiResponse<CoPlaySession>>(`/co-play/sessions/${id}`);
  return unwrap(response.data, '获取数字共演会话失败');
}

export async function advanceCoPlayTurn(id: number, userMessage?: string): Promise<CoPlayMessage[]> {
  const response = await client.post<ApiResponse<CoPlayMessage[]>>(`/co-play/sessions/${id}/turn`, { userMessage });
  return unwrap(response.data, '生成数字共演发言失败');
}

export async function deleteCoPlaySession(id: number): Promise<void> {
  await client.delete(`/co-play/sessions/${id}`);
}
