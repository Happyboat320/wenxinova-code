import { useEffect, useState } from 'react';

export type ReadingBackground = 'paper' | 'mist' | 'ink' | 'green' | 'custom';
export type ReadingPreferences = { fontSize: number; background: ReadingBackground; customImage: string };

const defaults: ReadingPreferences = { fontSize: 18, background: 'paper', customImage: '' };

/** 阅读偏好只保存在浏览器本地，避免上传用户选择的图片。 */
export function useReadingPreferences() {
  const [preferences, setPreferences] = useState<ReadingPreferences>(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('wenxin:reading-preferences') || '{}') }; } catch { return defaults; }
  });
  useEffect(() => { try { localStorage.setItem('wenxin:reading-preferences', JSON.stringify(preferences)); } catch { /* 忽略存储配额错误 */ } }, [preferences]);
  return { preferences, setPreferences };
}
