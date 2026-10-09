export const CREATION_CATEGORIES = [
  { value: 'adaptation', label: '风格化改编' },
  { value: 'script', label: '剧本杀' },
  // props 只用于隔离线索草稿，展示到社区时统一并入“剧本杀”。
  { value: 'props', label: '剧本杀' },
  { value: 'coplay', label: '数字共演' },
] as const;

export type CreationCategory = typeof CREATION_CATEGORIES[number]['value'];

export const COMMUNITY_CATEGORIES = [
  { value: 'adaptation', label: '风格化改编' },
  { value: 'script', label: '剧本杀' },
  { value: 'coplay', label: '数字共演' },
] as const;

export type CommunityCategory = typeof COMMUNITY_CATEGORIES[number]['value'];

export function isCreationCategory(value: unknown): value is CreationCategory {
  return typeof value === 'string' && CREATION_CATEGORIES.some(category => category.value === value);
}

export function isCommunityCategory(value: unknown): value is CommunityCategory {
  return typeof value === 'string' && COMMUNITY_CATEGORIES.some(category => category.value === value);
}

export function toCommunityCategory(value: string): CommunityCategory | null {
  if (value === 'props') return 'script';
  return isCommunityCategory(value) ? value : null;
}
