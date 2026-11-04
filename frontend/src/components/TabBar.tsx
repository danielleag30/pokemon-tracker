import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, BookOpen, Plus, LayoutGrid, User, Search, Layers } from 'lucide-react';
import { BatchAddModal } from './BatchAddModal';
import { SearchAddModal } from './SearchAddModal';
import { Sheet } from './Sheet';
import { BROWSE_PAGES, COLLECTION_PAGES, inSection, sectionEntry } from '../lib/sections';
import { haptic } from '../lib/native';

/**
 * Bottom tab bar for phones and tablets: Home · My Cards · Add · Browse · Me.
 * Replaces the hamburger sidebar below the desktop breakpoint.
 */
export function TabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [addMenu, setAddMenu] = useState(false);
  const [flow, setFlow] = useState<'search' | 'batch' | null>(null);

  type NavTab = { key: 'home' | 'cards' | 'browse' | 'me'; label: string; icon: typeof Home; active: boolean; to: string };
  const tabs: (NavTab | { key: 'add' })[] = [
    { key: 'home',   label: 'Home',     icon: Home,       active: pathname === '/',                            to: '/' },
    { key: 'cards',  label: 'My Cards', icon: BookOpen,   active: inSection(COLLECTION_PAGES, pathname),       to: sectionEntry('collection') },
    { key: 'add' },
    { key: 'browse', label: 'Browse',   icon: LayoutGrid, active: inSection(BROWSE_PAGES, pathname),           to: sectionEntry('browse') },
    { key: 'me',     label: 'Me',       icon: User,       active: pathname === '/me' || pathname === '/admin', to: '/me' },
  ];

  function go(to: string, active: boolean, sectionRoot?: string) {
    haptic('tap');
    // Tapping the tab you're already on goes back to that tab's first page,
    // the standard iOS behaviour.
    navigate(active && sectionRoot ? sectionRoot : to);
  }

  return (
    <>
      <nav
        aria-label="Main"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-pokemon-nav border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="h-16 grid grid-cols-5 items-center">
          {tabs.map((tab) => {
            if (tab.key === 'add') {
              return (
                <div key="add" className="flex justify-center">
                  <button
                    type="button"
                    aria-label="Add cards"
                    onClick={() => { haptic('tap'); setAddMenu(true); }}
                    className="w-14 h-14 -mt-6 rounded-full bg-pokemon-yellow text-pokemon-dark shadow-lg shadow-black/30 ring-4 ring-pokemon-nav flex items-center justify-center"
                  >
                    <Plus size={28} strokeWidth={2.75} />
                  </button>
                </div>
              );
            }
            const { key, label, icon: Icon, active, to } = tab;
            const root = key === 'cards' ? COLLECTION_PAGES[0].to : key === 'browse' ? BROWSE_PAGES[0].to : undefined;
            return (
              <NavLink
                key={key}
                to={to}
                onClick={(e) => { e.preventDefault(); go(to, active, root); }}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 h-full ${
                  active ? 'text-white' : 'text-white/50'
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[11px] font-semibold leading-none">{label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {addMenu && (
        <Sheet onClose={() => setAddMenu(false)} width="sm" label="Add cards">
          <div className="px-5 pt-2 pb-5 sm:pt-5">
            <h2 className="text-lg font-bold text-gray-900 text-center mb-4" data-sheet-handle>
              Add cards
            </h2>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => { setAddMenu(false); setFlow('search'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gray-50 text-left"
              >
                <span className="w-11 h-11 rounded-xl bg-pokemon-yellow text-pokemon-dark flex items-center justify-center shrink-0">
                  <Search size={20} />
                </span>
                <span>
                  <span className="block font-bold text-gray-900">Find a card</span>
                  <span className="block text-sm text-gray-500">Search by name and add it</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => { setAddMenu(false); setFlow('batch'); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gray-50 text-left"
              >
                <span className="w-11 h-11 rounded-xl bg-pokemon-nav text-white flex items-center justify-center shrink-0">
                  <Layers size={20} />
                </span>
                <span>
                  <span className="block font-bold text-gray-900">Add a bunch</span>
                  <span className="block text-sm text-gray-500">Pick many cards from a set, series or type</span>
                </span>
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {flow === 'search' && <SearchAddModal onClose={() => setFlow(null)} />}
      {flow === 'batch' && <BatchAddModal onClose={() => setFlow(null)} />}
    </>
  );
}
