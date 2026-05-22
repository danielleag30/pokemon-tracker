import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Shield,
  Users, MessageSquare, BarChart2, Plus, Trash2, KeyRound, X, RefreshCw,
} from 'lucide-react'
import { adminApi } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string
  username: string
  is_child: boolean
  created_at: string
  card_count: number
}

interface ChatFeedbackEntry {
  id: string
  username: string
  message: string
  reply: string
  rating: 1 | -1
  note?: string
  page_context?: object
  intent?: string
  created_at: string
}

interface GeneralFeedbackEntry {
  id: string
  username: string
  rating: 1 | -1
  note?: string
  created_at: string
}

interface ChatLogEntry {
  id: string
  username: string
  message: string
  reply: string
  intent?: string
  latency_ms?: number
  prompt_tokens?: number
  completion_tokens?: number
  context_card_count?: number
  created_at: string
}

interface Metrics {
  total_users: number
  total_chats: number
  chats_today: number
  chats_this_week: number
  avg_latency_ms: number | null
  thumbs_up_count: number
  thumbs_down_count: number
  total_cards_indexed: number
}

interface VolumeEntry { day: string; count: number }
interface IntentEntry { intent: string; count: number }

interface UserChatLog {
  id: string
  message: string
  reply: string
  intent?: string
  latency_ms?: number
  created_at: string
}

type Tab = 'users' | 'logs' | 'charts' | 'chat' | 'general'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ── Shared components ──────────────────────────────────────────────────────────

function RatingBadge({ rating }: { rating: 1 | -1 }) {
  return rating === 1
    ? <span className="flex items-center gap-1 text-green-600"><ThumbsUp size={14} /></span>
    : <span className="flex items-center gap-1 text-red-500"><ThumbsDown size={14} /></span>
}

function IntentBadge({ intent }: { intent?: string }) {
  if (!intent) return null
  return (
    <span className="inline-block bg-pokemon-blue/10 text-pokemon-blue text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
      {intent}
    </span>
  )
}

function ExpandableText({ text, maxLen = 200 }: { text: string; maxLen?: number }) {
  const [expanded, setExpanded] = useState(false)
  if (text.length <= maxLen) return <p className="text-gray-600 text-sm">{text}</p>
  return (
    <div>
      <p className="text-gray-600 text-sm">{expanded ? text : text.slice(0, maxLen) + '…'}</p>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-pokemon-blue text-xs font-medium flex items-center gap-0.5 mt-1 hover:underline"
      >
        {expanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show more</>}
      </button>
    </div>
  )
}

function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 animate-pulse">
          <div className="flex gap-3">
            <div className="w-24 h-4 bg-gray-200 rounded" />
            <div className="flex-1 h-4 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </>
  )
}

// ── SVG Bar chart ──────────────────────────────────────────────────────────────

function BarChart({ data, xKey, yKey, color = '#378ADD' }: {
  data: Record<string, unknown>[]
  xKey: string
  yKey: string
  color?: string
}) {
  if (!data.length) return <p className="text-gray-400 text-sm text-center py-10">No data yet.</p>
  const H = 120
  const values = data.map(d => Number(d[yKey]))
  const maxVal = Math.max(...values, 1)
  const barW = Math.max(10, Math.min(40, Math.floor(600 / data.length) - 6))
  const totalW = data.length * (barW + 6)
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${totalW} ${H + 28}`} style={{ minWidth: totalW, height: H + 28 }}>
        {data.map((d, i) => {
          const barH = Math.max(2, Math.round((values[i] / maxVal) * H))
          const x = i * (barW + 6) + 3
          return (
            <g key={i}>
              <rect x={x} y={H - barH} width={barW} height={barH} fill={color} rx={3} opacity={0.85} />
              <text x={x + barW / 2} y={H + 15} textAnchor="middle" fontSize={9} fill="#9ca3af">
                {String(d[xKey])}
              </text>
              {values[i] > 0 && (
                <text x={x + barW / 2} y={H - barH - 4} textAnchor="middle" fontSize={9} fill="#6b7280">
                  {values[i]}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Metrics strip ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-1">
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function MetricsStrip() {
  const { data } = useQuery<Metrics>({
    queryKey: ['admin', 'metrics'],
    queryFn: adminApi.getMetrics,
    refetchInterval: 30_000,
  })
  if (!data) return null
  const total = data.thumbs_up_count + data.thumbs_down_count
  const upRate = total > 0 ? Math.round((data.thumbs_up_count / total) * 100) : null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      <MetricCard label="Total Users" value={data.total_users} />
      <MetricCard label="Chats Today" value={data.chats_today} sub={`${data.chats_this_week} this week`} />
      <MetricCard label="Total Chats" value={data.total_chats.toLocaleString()} />
      <MetricCard label="Avg Latency" value={data.avg_latency_ms != null ? `${data.avg_latency_ms}ms` : '—'} />
      <MetricCard label="👍 Rate" value={upRate != null ? `${upRate}%` : '—'} sub={total > 0 ? `${total} rated` : 'no ratings yet'} />
      <MetricCard label="Cards Indexed" value={data.total_cards_indexed.toLocaleString()} />
    </div>
  )
}

// ── Modals ─────────────────────────────────────────────────────────────────────

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function CreateUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [realEmail, setRealEmail] = useState('')
  const [isChild, setIsChild] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setError('')
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) { setError('Username: 3–20 chars, letters/numbers/underscore'); return }
    if (!/^\d{6}$/.test(pin)) { setError('PIN must be exactly 6 digits'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(realEmail)) { setError('Valid email required'); return }
    setLoading(true)
    try {
      await adminApi.createUser({ username, pin, realEmail, isChild })
      onSuccess()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-black text-gray-900">Create User</h3>
        <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Username</label>
          <input
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
            value={username} onChange={e => setUsername(e.target.value)} placeholder="trainer_name"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">6-digit PIN</label>
          <input
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
            value={pin} onChange={e => setPin(e.target.value)} placeholder="123456" maxLength={6} type="password"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recovery Email</label>
          <input
            className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
            value={realEmail} onChange={e => setRealEmail(e.target.value)} placeholder="parent@example.com" type="email"
          />
        </div>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            className={`w-10 h-6 rounded-full transition-colors relative ${isChild ? 'bg-yellow-400' : 'bg-gray-200'}`}
            onClick={() => setIsChild(!isChild)}
          >
            <div
              className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
              style={{ transform: isChild ? 'translateX(18px)' : 'translateX(2px)' }}
            />
          </div>
          <span className="text-sm text-gray-700">Child account</span>
        </label>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          onClick={submit} disabled={loading}
          className="w-full bg-pokemon-blue text-white rounded-xl py-2.5 font-bold text-sm hover:bg-pokemon-blue/90 disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create User'}
        </button>
      </div>
    </Modal>
  )
}

function ResetPinModal({ user, onClose, onSuccess }: { user: AdminUser; onClose: () => void; onSuccess: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setError('')
    if (!/^\d{6}$/.test(pin)) { setError('PIN must be exactly 6 digits'); return }
    setLoading(true)
    try {
      await adminApi.resetUserPin(user.id, pin)
      onSuccess()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Failed to reset PIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-black text-gray-900">Reset PIN</h3>
        <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
      </div>
      <p className="text-sm text-gray-500 mb-4">Set a new 6-digit PIN for <strong>{user.username}</strong>.</p>
      <div className="space-y-3">
        <input
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
          value={pin} onChange={e => setPin(e.target.value)}
          placeholder="New 6-digit PIN" maxLength={6} type="password"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          onClick={submit} disabled={loading}
          className="w-full bg-pokemon-blue text-white rounded-xl py-2.5 font-bold text-sm hover:bg-pokemon-blue/90 disabled:opacity-50"
        >
          {loading ? 'Resetting…' : 'Reset PIN'}
        </button>
      </div>
    </Modal>
  )
}

function DeleteUserModal({ user, onClose, onSuccess }: { user: AdminUser; onClose: () => void; onSuccess: () => void }) {
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (confirm !== user.username) return
    setLoading(true)
    try {
      await adminApi.deleteUser(user.id)
      onSuccess()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Failed to delete user')
      setLoading(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-black text-red-600">Delete User</h3>
        <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
      </div>
      <p className="text-sm text-gray-600 mb-2">
        This permanently deletes <strong>{user.username}</strong> and all their data — collection, chat history, and feedback. Cannot be undone.
      </p>
      <p className="text-sm text-gray-500 mb-4">Type <strong>{user.username}</strong> to confirm:</p>
      <div className="space-y-3">
        <input
          className="w-full border border-red-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
          value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={user.username}
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          onClick={submit}
          disabled={confirm !== user.username || loading}
          className="w-full bg-red-500 text-white rounded-xl py-2.5 font-bold text-sm hover:bg-red-600 disabled:opacity-40"
        >
          {loading ? 'Deleting…' : 'Delete Permanently'}
        </button>
      </div>
    </Modal>
  )
}

function UserLogsModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { data, isLoading } = useQuery<UserChatLog[]>({
    queryKey: ['admin', 'user-logs', user.id],
    queryFn: () => adminApi.getUserChatLogs(user.id),
  })

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-black text-gray-900">{user.username} — Chat History</h3>
        <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
      </div>
      <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
        {isLoading && <p className="text-gray-400 text-sm text-center py-4">Loading…</p>}
        {!isLoading && !data?.length && <p className="text-gray-400 text-sm text-center py-4">No chat history yet.</p>}
        {(data ?? []).map(log => (
          <div key={log.id} className="bg-gray-50 rounded-xl p-3 text-sm">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs text-gray-400">{formatDateTime(log.created_at)}</span>
              <IntentBadge intent={log.intent} />
              {log.latency_ms != null && <span className="text-xs text-gray-400">{log.latency_ms}ms</span>}
            </div>
            <p className="text-gray-800 font-medium mb-1">{log.message}</p>
            <ExpandableText text={log.reply} maxLen={120} />
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── Users Tab ──────────────────────────────────────────────────────────────────

function UsersTab() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [resetPin, setResetPin] = useState<AdminUser | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null)
  const [viewLogs, setViewLogs] = useState<AdminUser | null>(null)

  const { data, isLoading, error } = useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn: adminApi.getUsers,
  })

  const toggleType = useMutation({
    mutationFn: ({ id, isChild }: { id: string; isChild: boolean }) => adminApi.toggleUserType(id, isChild),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  function handleSuccess() {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'metrics'] })
    setCreateOpen(false)
    setResetPin(null)
    setConfirmDelete(null)
  }

  if (isLoading) return <div className="space-y-2"><SkeletonRows /></div>
  if (error) return <p className="text-red-500 text-sm">Failed to load users.</p>

  return (
    <>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-pokemon-blue text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-pokemon-blue/90"
        >
          <Plus size={15} /> New User
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 font-semibold">Username</th>
              <th className="px-4 py-3 font-semibold">Cards</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map(u => (
              <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <button
                    onClick={() => setViewLogs(u)}
                    className="font-semibold text-gray-900 hover:text-pokemon-blue hover:underline text-left"
                  >
                    {u.username}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-700">{u.card_count.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleType.mutate({ id: u.id, isChild: !u.is_child })}
                    className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full cursor-pointer hover:opacity-75 transition-opacity ${
                      u.is_child ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                    }`}
                    title="Click to toggle"
                  >
                    {u.is_child ? 'Child' : 'Adult'}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-500">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setResetPin(u)}
                      title="Reset PIN"
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-pokemon-blue transition-colors"
                    >
                      <KeyRound size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(u)}
                      title="Delete user"
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!(data ?? []).length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createOpen    && <CreateUserModal onClose={() => setCreateOpen(false)} onSuccess={handleSuccess} />}
      {resetPin      && <ResetPinModal user={resetPin} onClose={() => setResetPin(null)} onSuccess={handleSuccess} />}
      {confirmDelete && <DeleteUserModal user={confirmDelete} onClose={() => setConfirmDelete(null)} onSuccess={handleSuccess} />}
      {viewLogs      && <UserLogsModal user={viewLogs} onClose={() => setViewLogs(null)} />}
    </>
  )
}

// ── LLM Logs Tab ───────────────────────────────────────────────────────────────

function LLMLogsTab() {
  const LIMIT = 50
  const [offset, setOffset] = useState(0)
  const [intentFilter, setIntentFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data, isLoading, error } = useQuery<ChatLogEntry[]>({
    queryKey: ['admin', 'logs', offset],
    queryFn: () => adminApi.getChatLogs(LIMIT, offset),
  })

  function toggle(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const filtered = intentFilter ? (data ?? []).filter(l => l.intent === intentFilter) : (data ?? [])
  const intents = [...new Set((data ?? []).map(l => l.intent).filter((x): x is string => !!x))]

  if (isLoading) return <div className="space-y-2"><SkeletonRows count={6} /></div>
  if (error) return <p className="text-red-500 text-sm">Failed to load logs.</p>

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <select
          value={intentFilter}
          onChange={e => setIntentFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
        >
          <option value="">All intents</option>
          {intents.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <span className="text-xs text-gray-400">{filtered.length} exchanges</span>
      </div>

      <div className="space-y-2">
        {filtered.map(log => (
          <div key={log.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
              onClick={() => toggle(log.id)}
            >
              <span className="text-xs text-gray-400 w-28 shrink-0">{formatDateTime(log.created_at)}</span>
              <span className="font-semibold text-gray-700 text-sm w-24 shrink-0 truncate">{log.username}</span>
              <span className="shrink-0"><IntentBadge intent={log.intent} /></span>
              <span className="flex-1 text-gray-600 text-sm truncate">{log.message}</span>
              <div className="flex items-center gap-2 shrink-0">
                {log.latency_ms != null && <span className="text-xs text-gray-400">{log.latency_ms}ms</span>}
                {log.prompt_tokens != null && (
                  <span className="text-xs text-gray-400">
                    {((log.prompt_tokens ?? 0) + (log.completion_tokens ?? 0)).toLocaleString()} tok
                  </span>
                )}
                {expanded.has(log.id) ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
              </div>
            </button>
            {expanded.has(log.id) && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">
                <div className="bg-gray-50 rounded-xl px-4 py-3 border-l-4 border-pokemon-blue/30">
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">User message</p>
                  <p className="text-gray-700 text-sm">{log.message}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase font-semibold mb-1">AI reply</p>
                  <ExpandableText text={log.reply} />
                </div>
                <div className="flex gap-4 text-xs text-gray-400 flex-wrap">
                  {log.context_card_count != null && <span>Context cards: {log.context_card_count}</span>}
                  {log.prompt_tokens != null && <span>Prompt tokens: {log.prompt_tokens}</span>}
                  {log.completion_tokens != null && <span>Completion tokens: {log.completion_tokens}</span>}
                </div>
              </div>
            )}
          </div>
        ))}
        {!filtered.length && <p className="text-center text-gray-400 py-12">No logs yet.</p>}
      </div>

      <div className="flex justify-between mt-4">
        <button
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - LIMIT))}
          className="text-sm text-pokemon-blue disabled:text-gray-300 font-semibold"
        >
          ← Previous
        </button>
        <span className="text-xs text-gray-400 self-center">
          {offset + 1}–{offset + (data?.length ?? 0)}
        </span>
        <button
          disabled={(data?.length ?? 0) < LIMIT}
          onClick={() => setOffset(offset + LIMIT)}
          className="text-sm text-pokemon-blue disabled:text-gray-300 font-semibold"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

// ── Charts Tab ─────────────────────────────────────────────────────────────────

function ChartsTab() {
  const volume  = useQuery<VolumeEntry[]>({ queryKey: ['admin', 'logs', 'volume'],   queryFn: adminApi.getChatVolume })
  const intents = useQuery<IntentEntry[]>({ queryKey: ['admin', 'logs', 'intents'],  queryFn: adminApi.getIntentBreakdown })

  const volumeData = (volume.data ?? []).map(d => ({
    day:   new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    count: Number(d.count),
  }))

  const intentData = (intents.data ?? []).slice(0, 10).map(d => ({
    intent: d.intent.replace(/_/g, ' '),
    count:  Number(d.count),
  }))

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <BarChart2 size={16} className="text-pokemon-blue" /> Chats per day — last 30 days
        </h3>
        {volume.isLoading
          ? <div className="h-32 bg-gray-100 rounded animate-pulse" />
          : <BarChart data={volumeData} xKey="day" yKey="count" />
        }
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <MessageSquare size={16} className="text-pokemon-blue" /> Intent breakdown
        </h3>
        {intents.isLoading
          ? <div className="h-32 bg-gray-100 rounded animate-pulse" />
          : <BarChart data={intentData} xKey="intent" yKey="count" color="#f59e0b" />
        }
      </div>
    </div>
  )
}

// ── Feedback Tabs ──────────────────────────────────────────────────────────────

function ChatFeedbackTab() {
  const { data, isLoading, error } = useQuery<ChatFeedbackEntry[]>({
    queryKey: ['admin', 'feedback', 'chat'],
    queryFn: adminApi.getChatFeedback,
  })
  if (isLoading) return <div className="space-y-3"><SkeletonRows count={4} /></div>
  if (error) return <p className="text-red-500 text-sm">Failed to load chat feedback.</p>
  return (
    <div className="space-y-3">
      {(data ?? []).map(entry => (
        <div key={entry.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-sm">{entry.username}</span>
              <span className="text-gray-400 text-xs">{formatDateTime(entry.created_at)}</span>
              <IntentBadge intent={entry.intent} />
            </div>
            <RatingBadge rating={entry.rating} />
          </div>
          <div className="bg-gray-50 rounded-xl px-4 py-3 mb-3 border-l-4 border-pokemon-blue/30">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">User message</p>
            <p className="text-gray-700 text-sm">{entry.message}</p>
          </div>
          <div className="mb-2">
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">AI reply</p>
            <ExpandableText text={entry.reply} />
          </div>
          {entry.note && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Note</p>
              <p className="text-gray-600 text-sm italic">{entry.note}</p>
            </div>
          )}
        </div>
      ))}
      {!(data ?? []).length && <p className="text-center text-gray-400 py-12">No chat feedback yet.</p>}
    </div>
  )
}

function GeneralFeedbackTab() {
  const { data, isLoading, error } = useQuery<GeneralFeedbackEntry[]>({
    queryKey: ['admin', 'feedback', 'general'],
    queryFn: adminApi.getGeneralFeedback,
  })
  if (isLoading) return <div className="space-y-3"><SkeletonRows count={4} /></div>
  if (error) return <p className="text-red-500 text-sm">Failed to load general feedback.</p>
  return (
    <div className="space-y-3">
      {(data ?? []).map(entry => (
        <div key={entry.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-sm">{entry.username}</span>
              <span className="text-gray-400 text-xs">{formatDateTime(entry.created_at)}</span>
            </div>
            <RatingBadge rating={entry.rating} />
          </div>
          {entry.note && <p className="text-gray-600 text-sm mt-3 pt-3 border-t border-gray-100">{entry.note}</p>}
        </div>
      ))}
      {!(data ?? []).length && <p className="text-center text-gray-400 py-12">No general feedback yet.</p>}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function Admin() {
  const { isAdmin, loading } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('users')

  if (loading) return <div className="p-6 space-y-3"><SkeletonRows count={3} /></div>

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Shield size={48} className="text-gray-300" />
        <h2 className="text-xl font-bold text-gray-500">Access Denied</h2>
        <p className="text-gray-400 text-sm">You don't have permission to view this page.</p>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'users',   label: 'Users',            icon: <Users size={14} /> },
    { id: 'logs',    label: 'LLM Logs',         icon: <MessageSquare size={14} /> },
    { id: 'charts',  label: 'Charts',           icon: <BarChart2 size={14} /> },
    { id: 'chat',    label: 'Chat Feedback',    icon: <ThumbsUp size={14} /> },
    { id: 'general', label: 'General Feedback', icon: <RefreshCw size={14} /> },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <Shield size={22} className="text-pokemon-blue" />
          <h1 className="text-2xl font-black text-gray-900">Admin Dashboard</h1>
        </div>
        <p className="text-gray-400 text-sm ml-9">Manage users, monitor LLM usage, view feedback.</p>
      </div>

      <MetricsStrip />

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.id ? 'bg-white text-pokemon-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users'   && <UsersTab />}
      {activeTab === 'logs'    && <LLMLogsTab />}
      {activeTab === 'charts'  && <ChartsTab />}
      {activeTab === 'chat'    && <ChatFeedbackTab />}
      {activeTab === 'general' && <GeneralFeedbackTab />}
    </div>
  )
}
