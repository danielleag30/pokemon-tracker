import { useState } from 'react';
import { Link } from 'react-router-dom';

const API = (import.meta.env.VITE_API_URL || '') + '/functions/v1';

export function ForgotPin() {
  const [username, setUsername] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) { setError('Enter your username'); return; }
    setError('');
    setLoading(true);
    try {
      await fetch(`${API}/auth/forgot-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      // Always show success — don't reveal whether username exists
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#378ADD] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <img src="/pokeball.svg" alt="Pokéball" className="w-14 h-14 mb-3" />
          <h1 className="text-white font-black text-2xl tracking-tight">Reset PIN</h1>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">📬</div>
              <p className="text-gray-700 font-semibold">Reset link sent</p>
              <p className="text-gray-500 text-sm leading-snug">
                If that username exists, a PIN reset link has been sent to the email on file. Check your inbox (or spam folder).
              </p>
              <Link
                to="/login"
                className="block w-full bg-[#378ADD] text-white font-bold py-3 rounded-2xl text-center hover:bg-blue-600 transition-colors"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-gray-600 text-sm leading-snug">
                Enter your username and we'll send a PIN reset link to the email on file.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your username"
                  autoComplete="username"
                  autoCapitalize="none"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#378ADD]"
                />
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#378ADD] text-white font-bold py-3.5 rounded-2xl text-base hover:bg-blue-600 transition-colors disabled:opacity-40"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>

              <Link
                to="/login"
                className="block text-center text-sm text-gray-400 hover:text-[#378ADD] transition-colors"
              >
                ← Back to Sign In
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
