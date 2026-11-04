import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BROWSE_PAGES, COLLECTION_PAGES, rememberSectionPage, type SectionPage,
} from '../lib/sections';

/**
 * Layout for a tab that holds several pages: a row of pills to move between
 * them, then the page. Phone and tablet only -- on desktop the sidebar
 * already lists every page, so the pills would just repeat it.
 */
export function SectionTabs({ section }: { section: 'browse' | 'collection' }) {
  const pages: SectionPage[] = section === 'browse' ? BROWSE_PAGES : COLLECTION_PAGES;
  const { pathname, search } = useLocation();

  useEffect(() => {
    rememberSectionPage(section, pathname + search);
  }, [section, pathname, search]);

  return (
    <>
      <nav
        aria-label={section === 'browse' ? 'Browse by' : 'My cards'}
        className="lg:hidden -mx-4 px-4 mb-4 flex gap-2 overflow-x-auto no-scrollbar"
      >
        {pages.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `shrink-0 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${
                isActive
                  ? 'bg-pokemon-nav text-white'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
