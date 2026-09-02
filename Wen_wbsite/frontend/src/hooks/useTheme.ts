import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark';

export function useTheme() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) {
      return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const effectiveTheme: Theme = isMobile ? 'light' : theme;

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const syncMobileViewport = (event: MediaQueryListEvent) => setIsMobile(event.matches);

    // 手机端统一使用现有浅色视觉，避免系统暗色模式只改变字体颜色。
    setIsMobile(mobileQuery.matches);
    mobileQuery.addEventListener('change', syncMobileViewport);
    return () => mobileQuery.removeEventListener('change', syncMobileViewport);
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(effectiveTheme);
    localStorage.setItem('theme', theme);
  }, [effectiveTheme, theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  return {
    theme: effectiveTheme,
    toggleTheme,
    isDark: effectiveTheme === 'dark'
  };
}
