import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Library, Layers, Star, Palette, GitBranch,
  AlertCircle, Copy, Plus, Search, BookOpen, BookMarked, LogOut,
  MessageSquare, Shield, Users
} from 'lucide-react';
import { BatchAddModal } from './BatchAddModal';
import { SearchAddModal } from './SearchAddModal';
import { FeedbackModal } from './FeedbackModal';
import { useAuth } from '../contexts/AuthContext';
import { useAccountSwitcher } from '../hooks/useAccountSwitcher';

const links = [
  { to: '/',          label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/my-cards',  label: 'My Cards',      icon: BookOpen        },
  { to: '/pokedex',   label: 'Pokédex',       icon: BookMarked      },
  { to: '/sets',      label: 'By Set',        icon: Library         },
  { to: '/series',    label: 'By Series',     icon: Layers          },
  { to: '/starters',  label: 'By Starter',    icon: Star            },
  { to: '/type',      label: 'By Type',       icon: Palette         },
  { to: '/evolution', label: 'By Evolution',  icon: GitBranch       },
  { to: '/missing',   label: 'Missing Cards', icon: AlertCircle     },
  { to: '/duplicates',label: 'Duplicates',    icon: Copy            },
];

export function NavBar() {
  const { profile, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [showBatch, setShowBatch] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const { otherAccounts, switchAccount, error: switchError } =
    useAccountSwitcher(() => setSwitcherOpen(false));

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      {/* Phone/tablet top bar. Navigation lives in the bottom TabBar, so
          this is just the app's name. */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-pokemon-nav safe-top">
        <div className="h-14 flex items-center justify-center gap-2">
          <img src="/pokeball.svg" alt="" className="w-7 h-7" />
          <span className="text-white font-bold text-lg tracking-tight">PokeTracker</span>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className="hidden lg:flex lg:static h-full w-64 bg-pokemon-nav flex-col safe-top"
      >
        <div className="p-5 flex items-center gap-3 border-b border-white/10">
          <img src="/pokeball.svg" alt="Pokeball" className="w-9 h-9" />
          <div>
            <h1 className="text-white font-black text-xl tracking-tight leading-none">PokeTracker</h1>
            <p className="text-white/40 text-xs mt-0.5">Card Collection</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-pokemon-blue text-white shadow-md'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-pokemon-blue text-white shadow-md'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <Shield size={18} />
              Admin
            </NavLink>
          )}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <button
            onClick={() => setShowSearch(true)}
            className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-2 rounded-xl text-sm flex items-center justify-center gap-1.5 transition-colors"
          >
            <Search size={14} /> Search & Add Card
          </button>
          <button
            onClick={() => setShowBatch(true)}
            className="w-full bg-pokemon-yellow hover:bg-yellow-400 text-pokemon-dark font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Plus size={16} /> Batch Add Cards
          </button>
        </div>

        <div className="px-4 pb-3">
          <button
            onClick={() => setShowFeedback(true)}
            className="w-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white font-medium py-2 rounded-xl text-sm flex items-center justify-center gap-1.5 transition-colors"
          >
            <MessageSquare size={14} /> Send Feedback
          </button>
        </div>

        {/* User section — signed-in identity, plus switching between accounts
            that have signed in on this device */}
        <div className="px-4 py-3 safe-bottom border-t border-white/10">
          {switcherOpen && otherAccounts.length > 0 && (
            <div className="mb-2 space-y-1">
              {otherAccounts.map((account) => (
                <button
                  key={account.username}
                  onClick={() => switchAccount(account)}
                  className="w-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium py-2 px-3 rounded-xl flex items-center justify-between gap-2 transition-colors"
                >
                  <span className="truncate">{account.username}</span>
                  {account.isAdmin && (
                    <span className="text-[10px] uppercase tracking-wide text-white/50 flex-shrink-0">
                      PIN
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {switchError && (
            <p className="mb-2 text-xs text-red-200">{switchError}</p>
          )}

          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-white/40 text-xs uppercase tracking-wide font-semibold">Signed in as</p>
              <p className="text-white font-bold text-sm truncate mt-0.5">
                {profile?.username ?? '…'}
              </p>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {otherAccounts.length > 0 && (
                <button
                  onClick={() => setSwitcherOpen((v) => !v)}
                  title="Switch account"
                  aria-expanded={switcherOpen}
                  className="text-white/50 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <Users size={16} />
                </button>
              )}
              <button
                onClick={handleLogout}
                title="Sign out"
                className="text-white/50 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {showBatch && <BatchAddModal onClose={() => setShowBatch(false)} />}
      {showSearch && <SearchAddModal onClose={() => setShowSearch(false)} />}
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </>
  );
}
