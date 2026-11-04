import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronRight, Download, LogOut, MessageSquare, Shield, FileText, Loader, Users,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAccountSwitcher } from '../hooks/useAccountSwitcher';
import { FeedbackModal } from '../components/FeedbackModal';
import { exportCollection } from '../lib/exportCollection';

/**
 * The Me tab: who's signed in, switching to another account on this device,
 * and the odds and ends that lived at the bottom of the old sidebar.
 */
export function Me() {
  const { profile, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const { otherAccounts, switchAccount, error } = useAccountSwitcher();
  const [showFeedback, setShowFeedback] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  async function handleExport() {
    setExporting(true);
    setExportError('');
    try {
      await exportCollection();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const name = profile?.username ?? '…';

  return (
    <div className="space-y-6 animate-fade-in max-w-lg mx-auto">
      {/* Who's signed in */}
      <div className="flex items-center gap-4 pt-2">
        <div className="w-16 h-16 rounded-full bg-pokemon-nav text-white flex items-center justify-center text-2xl font-black shrink-0">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide font-semibold text-gray-400">Signed in as</p>
          <h1 className="text-2xl font-black text-gray-900 truncate">{name}</h1>
        </div>
      </div>

      {/* Switch account */}
      {otherAccounts.length > 0 && (
        <Group title="Switch to">
          {otherAccounts.map((account) => (
            <Row
              key={account.username}
              icon={<Avatar letter={account.username.charAt(0)} />}
              label={account.username}
              detail={account.isAdmin ? 'Needs PIN' : undefined}
              onClick={() => switchAccount(account)}
            />
          ))}
          {error && <p className="px-4 py-3 text-sm text-red-500">{error}</p>}
        </Group>
      )}

      <Group>
        <Row
          icon={<IconBox><Download size={18} /></IconBox>}
          label="Export my collection"
          detail={exporting ? <Loader size={16} className="animate-spin" /> : undefined}
          onClick={handleExport}
        />
        <Row
          icon={<IconBox><MessageSquare size={18} /></IconBox>}
          label="Send feedback"
          onClick={() => setShowFeedback(true)}
        />
        {isAdmin && (
          <Row icon={<IconBox><Shield size={18} /></IconBox>} label="Admin" to="/admin" />
        )}
        <Row icon={<IconBox><FileText size={18} /></IconBox>} label="Privacy policy" to="/privacy" />
        {exportError && <p className="px-4 py-3 text-sm text-red-500">{exportError}</p>}
      </Group>

      {otherAccounts.length === 0 && (
        <p className="text-sm text-gray-400 flex items-start gap-2 px-1">
          <Users size={16} className="shrink-0 mt-0.5" />
          Anyone else who signs in on this device will show up here, so you can switch without typing a username.
        </p>
      )}

      <button
        type="button"
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border border-gray-200 text-red-500 font-semibold"
      >
        <LogOut size={18} /> Sign out
      </button>

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </div>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section>
      {title && (
        <h2 className="px-1 mb-2 text-xs uppercase tracking-wide font-semibold text-gray-400">{title}</h2>
      )}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function Row({
  icon, label, detail, onClick, to,
}: { icon: ReactNode; label: string; detail?: ReactNode; onClick?: () => void; to?: string }) {
  const inner = (
    <>
      {icon}
      <span className="flex-1 min-w-0 truncate font-semibold text-gray-800">{label}</span>
      {detail && <span className="text-sm text-gray-400 shrink-0">{detail}</span>}
      <ChevronRight size={18} className="text-gray-300 shrink-0" />
    </>
  );
  const cls = 'w-full flex items-center gap-3 px-4 py-3.5 text-left';
  return to
    ? <Link to={to} className={cls}>{inner}</Link>
    : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

function IconBox({ children }: { children: ReactNode }) {
  return (
    <span className="w-9 h-9 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center shrink-0">
      {children}
    </span>
  );
}

function Avatar({ letter }: { letter: string }) {
  return (
    <span className="w-9 h-9 rounded-full bg-pokemon-blue text-white flex items-center justify-center font-bold shrink-0">
      {letter.toUpperCase()}
    </span>
  );
}
