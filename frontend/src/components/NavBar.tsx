import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Library, Layers, Star, Palette, GitBranch,
  AlertCircle, Copy, Menu, X, Plus, Search, BookOpen, BookMarked, LogOut,
  MessageSquare, Shield
} from 'lucide-react';
import { BatchAddModal } from './BatchAddModal';
import { SearchAddModal } from './SearchAddModal';
import { FeedbackModal } from './FeedbackModal';
import { useAuth } from '../contexts/AuthContext';

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
  const [open, setOpen] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-pokemon-nav flex items-center justify-between px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2">
          <img src="/pokeball.svg" alt="Pokeball" className="w-7 h-7" />
          <span className="text-white font-bold text-lg tracking-tight">PokeTracker</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearch(true)}
            className="bg-pokemon-yellow text-pokemon-dark text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1"
          >
            <Plus size={12} /> Add Card
          </button>
          <button onClick={() => setOpen(!open)} className="text-white p-1">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-40 w-64 bg-pokemon-nav flex flex-col transition-transform duration-300
          lg:translate-x-0 lg:static lg:flex
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
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
              onClick={() => setOpen(false)}
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
              onClick={() => setOpen(false)}
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
            onClick={() => { setShowSearch(true); setOpen(false); }}
            className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-2 rounded-xl text-sm flex items-center justify-center gap-1.5 transition-colors"
          >
            <Search size={14} /> Search & Add Card
          </button>
          <button
            onClick={() => { setShowBatch(true); setOpen(false); }}
            className="w-full bg-pokemon-yellow hover:bg-yellow-400 text-pokemon-dark font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Plus size={16} /> Batch Add Cards
          </button>
        </div>

        <div className="px-4 pb-3">
          <button
            onClick={() => { setShowFeedback(true); setOpen(false); }}
            className="w-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white font-medium py-2 rounded-xl text-sm flex items-center justify-center gap-1.5 transition-colors"
          >
            <MessageSquare size={14} /> Send Feedback
          </button>
        </div>

        {/* User section — replaces CollectionCode */}
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-white/40 text-xs uppercase tracking-wide font-semibold">Signed in as</p>
            <p className="text-white font-bold text-sm truncate mt-0.5">
              {profile?.username ?? '…'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="text-white/50 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {showBatch && <BatchAddModal onClose={() => setShowBatch(false)} />}
      {showSearch && <SearchAddModal onClose={() => setShowSearch(false)} />}
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </>
  );
}
