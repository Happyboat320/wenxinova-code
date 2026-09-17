import { useEffect, useState } from 'react';

export type ReadingBackground = 'paper' | 'mist' | 'ink' | 'green' | 'custom';
export type ReadingPreferences = { fontSize: number; background: ReadingBackground; customImage: string };

/** 正文共十档字号，按钮只能在这里定义的边界内调整。 */
export const READING_FONT_SIZES = [14, 16, 18, 20, 22, 24, 26, 28, 30, 32] as const;
const defaults: ReadingPreferences = { fontSize: 18, background: 'paper', customImage: '' };
const IMAGE_DB = 'wenxin-reading-preferences';
const IMAGE_STORE = 'images';

function openImageDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IMAGE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IMAGE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadSavedImage() {
  try {
    const db = await openImageDb();
    return await new Promise<string>((resolve, reject) => {
      const request = db.transaction(IMAGE_STORE, 'readonly').objectStore(IMAGE_STORE).get('customImage');
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : '');
      request.onerror = () => reject(request.error);
    });
  } catch { return ''; }
}

async function saveImage(image: string) {
  try {
    const db = await openImageDb();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(IMAGE_STORE, 'readwrite').objectStore(IMAGE_STORE).put(image, 'customImage');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch { /* IndexedDB 不可用时仍保留 localStorage 兜底 */ }
}

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
  useEffect(() => {
    try {
      // 图片单独放入 IndexedDB，localStorage 只保存字号和背景类型。
      localStorage.setItem('wenxin:reading-preferences', JSON.stringify({ ...preferences, customImage: '' }));
    } catch { /* 忽略存储配额错误 */ }
    if (preferences.customImage) void saveImage(preferences.customImage);
  }, [preferences]);
  useEffect(() => {
    let cancelled = false;
    void loadSavedImage().then(customImage => {
      if (!cancelled && customImage) setPreferences(current => ({ ...current, customImage, background: current.background === 'custom' ? 'custom' : current.background }));
    });
    return () => { cancelled = true; };
  }, []);
  return { preferences, setPreferences };
}
