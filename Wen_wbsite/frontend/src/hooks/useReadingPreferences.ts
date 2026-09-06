import { useEffect, useState } from 'react';

export type ReadingBackground = 'paper' | 'mist' | 'ink' | 'green' | 'custom';
export type ReadingPreferences = { fontSize: number; background: ReadingBackground; customImage: string };

/** 正文共十档字号，按钮只能在这里定义的边界内调整。 */
export const READING_FONT_SIZES = [14, 16, 18, 20, 22, 24, 26, 28, 30, 32] as const;
const defaults: ReadingPreferences = { fontSize: 18, background: 'paper', customImage: '' };

function normalizePreferences(value: Partial<ReadingPreferences>): ReadingPreferences {
  const fontSize = READING_FONT_SIZES.includes(value.fontSize as typeof READING_FONT_SIZES[number])
    ? value.fontSize!
    : defaults.fontSize;
  const backgrounds: ReadingBackground[] = ['paper', 'mist', 'ink', 'green', 'custom'];
  return {
    fontSize,
    background: backgrounds.includes(value.background as ReadingBackground) ? value.background! : defaults.background,
    customImage: typeof value.customImage === 'string' ? value.customImage : '',
  };
}

/** 阅读偏好只保存在浏览器本地，避免上传用户选择的图片。 */
export function useReadingPreferences() {
  const [preferences, setPreferences] = useState<ReadingPreferences>(() => {
    try { return normalizePreferences(JSON.parse(localStorage.getItem('wenxin:reading-preferences') || '{}')); } catch { return defaults; }
  });
  useEffect(() => { try { localStorage.setItem('wenxin:reading-preferences', JSON.stringify(preferences)); } catch { /* 忽略存储配额错误 */ } }, [preferences]);
  return { preferences, setPreferences };
}
