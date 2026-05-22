import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Shield } from 'lucide-react'
import { adminApi } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'

interface AdminUser {
  id: string
  username: string
  is_child: boolean
  created_at: string
  card_count: number
}

interface ChatFeedbackEntry {
  id: string
  user_id: string
  message: string
  reply: string
  rating: 1 | -1
  note?: string
  page_context?: object
  intent?: string
  created_at: string
  profiles?: { username: string }
}

interface GeneralFeedbackEntry {
  id: string
  user_id: string
  rating: 1 | -1
  note?: string
  created_at: string
  profiles?: { username: string }
}

type Tab = 'users' | 'chat' | 'general'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function RatingBadge({ rating }: { rating: 1 | -1 }) {
  return rating === 1
    ? <span className="flex items-center gap-1 text-green-600"><ThumbsUp size={14} /></span>
    : <span className="flex items-center gap-1 text-red-500"><ThumbsDown size={14} /></span>
}

function IntentBadge({ intent }: { intent?: string }) {
  if (!intent) return null
  return (
    <span className="inline-block bg-pokemon-blue/10 text-pokemon-blue text-xs font-semibold px-2 py-0.5 rounded-full">
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

function UsersTab() {
  const { data, isLoading, error } = useQuery<AdminUser[]>({
    queryKey: ['admin', 'users'],
    queryFn: adminApi.getUsers,
  })

  if (isLoading) return <div className="space-y-2"><SkeletonRows /></div>
  if (error) return <p className="text-red-500 text-sm">Failed to load users.</p>

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
            <th className="px-4 py-3 font-semibold">Username</th>
            <th className="px-4 py-3 font-semibold">Cards</th>
            <th className="px-4 py-3 font-semibold">Account Type</th>
            <th className="px-4 py-3 font-semibold">Joined</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((u) => (
            <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-semibold text-gray-900">{u.username}</td>
              <td className="px-4 py-3 text-gray-700">{u.card_count.toLocaleString()}</td>
              <td className="px-4 py-3">
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                  u.is_child ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {u.is_child ? 'Child' : 'Adult'}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500">{formatDate(u.created_at)}</td>
            </tr>
          ))}
          {(data ?? []).length === 0 && (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No users found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function ChatFeedbackTab() {
  const { data, isLoading, error } = useQuery<ChatFeedbackEntry[]>({
    queryKey: ['admin', 'feedback', 'chat'],
    queryFn: adminApi.getChatFeedback,
  })

  if (isLoading) return <div className="space-y-3"><SkeletonRows count={4} /></div>
  if (error) return <p className="text-red-500 text-sm">Failed to load chat feedback.</p>

  return (
    <div className="space-y-3">
      {(data ?? []).map((entry) => (
        <div key={entry.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-sm">{entry.profiles?.username ?? 'Unknown'}</span>
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
      {(data ?? []).length === 0 && (
        <p className="text-center text-gray-400 py-12">No chat feedback yet.</p>
      )}
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
      {(data ?? []).map((entry) => (
        <div key={entry.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-sm">{entry.profiles?.username ?? 'Unknown'}</span>
              <span className="text-gray-400 text-xs">{formatDateTime(entry.created_at)}</span>
            </div>
            <RatingBadge rating={entry.rating} />
          </div>
          {entry.note && (
            <p className="text-gray-600 text-sm mt-3 pt-3 border-t border-gray-100">{entry.note}</p>
          )}
        </div>
      ))}
      {(data ?? []).length === 0 && (
        <p className="text-center text-gray-400 py-12">No general feedback yet.</p>
      )}
    </div>
  )
}

export function Admin() {
  const { isAdmin, loading } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('users')

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <SkeletonRows count={3} />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Shield size={48} className="text-gray-300" />
        <h2 className="text-xl font-bold text-gray-500">Access Denied</h2>
        <p className="text-gray-400 text-sm">You don't have permission to view this page.</p>
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users', label: 'Users' },
    { id: 'chat', label: 'Chat Feedback' },
    { id: 'general', label: 'General Feedback' },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Shield size={22} className="text-pokemon-blue" />
          <h1 className="text-2xl font-black text-gray-900">Admin Dashboard</h1>
        </div>
        <p className="text-gray-400 text-sm ml-9">Manage users and view feedback.</p>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab.id
                ? 'bg-white text-pokemon-blue shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'chat' && <ChatFeedbackTab />}
      {activeTab === 'general' && <GeneralFeedbackTab />}
    </div>
  )
}
