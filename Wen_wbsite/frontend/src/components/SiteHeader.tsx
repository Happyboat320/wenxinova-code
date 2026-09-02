import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

const navigation = [
  { to: '/', label: '首页' },
  { to: '/classical-library', label: '古典文库' },
  { to: '/digital-coplay', label: '数字共演' },
  { to: '/ugc-community', label: 'UGC社区' },
  { to: '/my-collection', label: '我的创作' },
];

interface SiteHeaderProps {
  className?: string;
  beforeNavigation?: ReactNode;
}

/** 全站导航在窄屏折叠，避免各页面重复维护容易溢出的横向菜单。 */
export default function SiteHeader({ className = '', beforeNavigation }: SiteHeaderProps) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  const isActive = (to: string) => to === '/'
    ? pathname === '/'
    : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <header className={`site-header ${className}`}>
      <Link to="/" className="flex min-w-0 items-center gap-2 text-amber-900">
        <i className="fa-solid fa-book-open text-2xl" />
        <span className="title-serif truncate text-2xl">文心新述</span>
      </Link>
      <div className="hidden items-center gap-5 lg:flex">
        {beforeNavigation}
        <nav className="flex items-center gap-6" aria-label="主导航">
          {navigation.map(item => (
            <Link key={item.to} to={item.to} className={isActive(item.to) ? 'site-nav-active' : 'transition hover:text-amber-700'}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <button
        type="button"
        className="site-menu-button lg:hidden"
        aria-label={menuOpen ? '关闭导航菜单' : '打开导航菜单'}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(open => !open)}
      >
        <i className={`fa-solid ${menuOpen ? 'fa-xmark' : 'fa-bars'}`} />
      </button>
      {menuOpen && (
        <div className="site-mobile-menu lg:hidden">
          {beforeNavigation && <div className="border-b border-amber-100 pb-3">{beforeNavigation}</div>}
          <nav className="grid gap-1 pt-2" aria-label="手机端主导航">
            {navigation.map(item => (
              <Link key={item.to} to={item.to} className={`site-mobile-link ${isActive(item.to) ? 'site-mobile-link-active' : ''}`}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
