export const CREATION_CATEGORIES = [
  { value: 'adaptation', label: '改编' },
  { value: 'script', label: '剧本杀' },
  { value: 'props', label: '线索' },
  { value: 'dm', label: 'DM 手册' },
  { value: 'coplay', label: '数字共演' },
  { value: 'other', label: '其他' },
] as const;

export type CreationCategory = typeof CREATION_CATEGORIES[number]['value'];

export function isCreationCategory(value: unknown): value is CreationCategory {
  return typeof value === 'string' && CREATION_CATEGORIES.some(category => category.value === value);
}
