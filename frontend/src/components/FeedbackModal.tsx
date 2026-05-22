import { useState } from 'react'
import { X, ThumbsUp, ThumbsDown, CheckCircle } from 'lucide-react'
import { feedbackApi } from '../utils/api'

interface Props {
  onClose: () => void
}

export function FeedbackModal({ onClose }: Props) {
  const [rating, setRating] = useState<1 | -1 | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (rating === null) return
    setSubmitting(true)
    setError(null)
    try {
      await feedbackApi.submitGeneral(rating, note.trim() || undefined)
      setSubmitted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>

        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <CheckCircle size={48} className="text-green-500" />
            <h2 className="text-xl font-bold text-gray-900">Thanks for your feedback!</h2>
            <p className="text-gray-500 text-sm text-center">Your feedback helps us improve PokeTracker.</p>
            <button
              onClick={onClose}
              className="mt-2 bg-pokemon-blue text-white font-semibold px-6 py-2 rounded-xl hover:bg-blue-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Send Feedback</h2>
            <p className="text-gray-500 text-sm mb-6">How's your experience with PokeTracker?</p>

            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setRating(1)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold transition-all ${
                  rating === 1
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-500 hover:border-green-300 hover:bg-green-50 hover:text-green-600'
                }`}
              >
                <ThumbsUp size={20} />
                Loving it
              </button>
              <button
                onClick={() => setRating(-1)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-semibold transition-all ${
                  rating === -1
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600'
                }`}
              >
                <ThumbsDown size={20} />
                Needs work
              </button>
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tell us more (optional)"
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30 focus:border-pokemon-blue resize-none mb-4"
            />

            {error && (
              <p className="text-red-500 text-sm mb-3">{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={rating === null || submitting}
              className="w-full bg-pokemon-blue hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl transition-colors"
            >
              {submitting ? 'Sending…' : 'Send Feedback'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
