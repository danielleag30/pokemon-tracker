import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Delete, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const PIN_LENGTH = 6;

const NUMPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'back'],
];

export function Login() {
  const { login, profile } = useAuth();
  const navigate = useNavigate();

  // A switch into an admin account routes here for the PIN and passes the
  // username along, so only the PIN has to be typed.
  const prefill = (useLocation().state as { username?: string } | null)?.username ?? '';
  const [username, setUsername] = useState(prefill);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleKey(key: string) {
    if (key === 'back') {
      setPin((p) => p.slice(0, -1));
    } else if (pin.length < PIN_LENGTH) {
      setPin((p) => p + key);
    }
  }

  async function handleSubmit() {
    if (!username.trim()) { setError('Enter your username'); return; }
    if (pin.length !== PIN_LENGTH) { setError('Enter your full 6-digit PIN'); return; }
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), pin);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  const forgotText = profile?.is_child
    ? 'Forgot PIN? Ask a parent to reset it →'
    : 'Forgot PIN?';

  return (
    <div className="min-h-screen bg-pokemon-nav flex items-center justify-center px-4 safe-y relative overflow-x-hidden">
      {/* Pokéball watermark */}
      <div
        className="absolute inset-0 pointer-events-none select-none"
        aria-hidden="true"
        style={{
          backgroundImage: `url('/pokeball.svg')`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundSize: '70vmin',
          opacity: 0.08,
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <img src="/pokeball.svg" alt="Pokéball" className="w-16 h-16 mb-3" />
          <h1 className="text-white font-black text-3xl tracking-tight">PokéTracker</h1>
          <p className="text-white/70 text-sm mt-1">Sign in to your collection</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-3xl shadow-2xl p-6">
          {/* Username */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && pin.length === PIN_LENGTH && handleSubmit()}
              placeholder="Your username"
              autoComplete="username"
              autoCapitalize="none"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/40 focus:border-pokemon-blue"
            />
          </div>

          {/* PIN display */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                PIN
              </label>
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-pokemon-blue transition-colors"
              >
                {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                {showPin ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="flex gap-2 justify-center">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={`w-10 h-12 rounded-xl border-2 flex items-center justify-center transition-colors ${
                    i < pin.length
                      ? 'border-pokemon-blue bg-pokemon-blue/10'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  {i < pin.length && (
                    showPin
                      ? <span className="text-pokemon-blue font-bold text-lg">{pin[i]}</span>
                      : <div className="w-3 h-3 rounded-full bg-pokemon-blue" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Custom numpad */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {NUMPAD.flat().map((key, idx) => {
              if (key === '') return <div key={idx} />;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleKey(key)}
                  disabled={loading}
                  className={`h-14 rounded-2xl text-lg font-bold transition-all active:scale-95 disabled:opacity-50 ${
                    key === 'back'
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center'
                      : 'bg-gray-100 text-gray-800 hover:bg-pokemon-blue/10 hover:text-pokemon-blue'
                  }`}
                >
                  {key === 'back' ? <Delete size={20} /> : key}
                </button>
              );
            })}
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-500 text-sm text-center mb-4">{error}</p>
          )}

          {/* Sign in button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !username.trim() || pin.length !== PIN_LENGTH}
            className="w-full bg-pokemon-yellow text-pokemon-dark font-bold py-3.5 rounded-2xl text-base hover:bg-yellow-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          {/* Forgot PIN */}
          <div className="text-center mt-4">
            <Link
              to="/forgot-pin"
              className="text-sm text-gray-400 hover:text-pokemon-blue transition-colors"
            >
              {forgotText}
            </Link>
          </div>
        </div>

        {/* Register + Privacy footer */}
        <div className="text-center mt-5 space-y-1">
          <p className="text-white/80 text-sm">
            New here?{' '}
            <Link to="/register" className="text-white font-bold underline">
              Create an account
            </Link>
          </p>
          <Link to="/privacy" className="text-white/50 text-xs hover:text-white/80 transition-colors">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}
