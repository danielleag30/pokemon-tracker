import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Delete, User, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const PIN_LENGTH = 6;
const API = (import.meta.env.VITE_API_URL || '') + '/functions/v1';

const NUMPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'back'],
];

export function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [isChild, setIsChild] = useState(false);
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'taken' | 'available'>('idle');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleNumKey(key: string) {
    const current = pinStep === 'enter' ? pin : confirmPin;
    const setter = pinStep === 'enter' ? setPin : setConfirmPin;
    if (key === 'back') setter((p) => p.slice(0, -1));
    else if (current.length < PIN_LENGTH) setter((p) => p + key);
  }

  async function checkUsername(value: string) {
    if (value.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    const res = await fetch(`${API}/auth/check?username=${encodeURIComponent(value)}`);
    const body = await res.json();
    setUsernameStatus(body.available ? 'available' : 'taken');
  }

  function handleUsernameChange(value: string) {
    const clean = value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
    setUsername(clean);
    setUsernameStatus('idle');
    if (clean.length >= 3) {
      const t = setTimeout(() => checkUsername(clean), 500);
      return () => clearTimeout(t);
    }
  }

  function advancePin() {
    if (pin.length !== PIN_LENGTH) { setError('Enter all 6 digits'); return; }
    setError('');
    setPinStep('confirm');
  }

  async function handleSubmit() {
    if (pin !== confirmPin) {
      setError('PINs do not match — try again');
      setConfirmPin('');
      setPinStep('enter');
      setPin('');
      return;
    }
    if (!email.trim()) { setError('Email is required'); return; }
    if (usernameStatus !== 'available') { setError('Choose a valid, available username'); return; }

    setError('');
    setLoading(true);
    try {
      await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin, realEmail: email.trim(), isChild }),
      }).then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Registration failed');
      });

      // Auto-login after registration
      await login(username, pin);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const currentPin = pinStep === 'enter' ? pin : confirmPin;

  return (
    <div className="min-h-screen bg-[#378ADD] flex items-center justify-center p-4 relative overflow-hidden">
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
        <div className="flex flex-col items-center mb-6">
          <img src="/pokeball.svg" alt="Pokéball" className="w-14 h-14 mb-3" />
          <h1 className="text-white font-black text-2xl tracking-tight">Create Account</h1>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6 space-y-5">
          {/* Account type toggle */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Account type</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsChild(false)}
                className={`flex items-center justify-center gap-2 py-3 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                  !isChild ? 'border-[#378ADD] bg-[#378ADD]/10 text-[#378ADD]' : 'border-gray-200 text-gray-500'
                }`}
              >
                <User size={16} /> Adult / Teen (13+)
              </button>
              <button
                type="button"
                onClick={() => setIsChild(true)}
                className={`flex items-center justify-center gap-2 py-3 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                  isChild ? 'border-[#378ADD] bg-[#378ADD]/10 text-[#378ADD]' : 'border-gray-200 text-gray-500'
                }`}
              >
                <Users size={16} /> Child (under 13)
              </button>
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              placeholder="PikachuFan99"
              autoComplete="username"
              autoCapitalize="none"
              maxLength={20}
              className={`w-full border-2 rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors ${
                usernameStatus === 'taken'
                  ? 'border-red-400 focus:border-red-500'
                  : usernameStatus === 'available'
                  ? 'border-green-400 focus:border-green-500'
                  : 'border-gray-200 focus:border-[#378ADD]'
              }`}
            />
            <p className={`text-xs mt-1 ${
              usernameStatus === 'taken' ? 'text-red-500' :
              usernameStatus === 'available' ? 'text-green-600' : 'text-gray-400'
            }`}>
              {usernameStatus === 'taken' && 'That username is taken'}
              {usernameStatus === 'available' && 'Username is available ✓'}
              {usernameStatus === 'checking' && 'Checking…'}
              {usernameStatus === 'idle' && '3–20 chars: letters, numbers, underscore'}
            </p>
          </div>

          {/* PIN entry */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              {pinStep === 'enter' ? 'Choose a 6-digit PIN' : 'Confirm your PIN'}
            </label>
            <div className="flex gap-2 justify-center mb-3">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={`w-9 h-11 rounded-xl border-2 flex items-center justify-center transition-colors ${
                    i < currentPin.length
                      ? 'border-[#378ADD] bg-[#378ADD]/10'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  {i < currentPin.length && (
                    <div className="w-2.5 h-2.5 rounded-full bg-[#378ADD]" />
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {NUMPAD.flat().map((key, idx) => {
                if (key === '') return <div key={idx} />;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleNumKey(key)}
                    disabled={loading}
                    className={`h-12 rounded-2xl text-base font-bold transition-all active:scale-95 disabled:opacity-50 ${
                      key === 'back'
                        ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center'
                        : 'bg-gray-100 text-gray-800 hover:bg-[#378ADD]/10 hover:text-[#378ADD]'
                    }`}
                  >
                    {key === 'back' ? <Delete size={18} /> : key}
                  </button>
                );
              })}
            </div>

            {pinStep === 'enter' && (
              <button
                type="button"
                onClick={advancePin}
                disabled={pin.length !== PIN_LENGTH}
                className="w-full mt-3 bg-gray-100 text-gray-700 font-semibold py-2.5 rounded-2xl text-sm hover:bg-gray-200 transition-colors disabled:opacity-40"
              >
                Next →
              </button>
            )}
          </div>

          {/* Email — only shown after PIN step */}
          {pinStep === 'confirm' && confirmPin.length === PIN_LENGTH && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {isChild ? 'Parent email' : 'Your email'}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isChild ? "parent@example.com" : "you@example.com"}
                autoComplete="email"
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#378ADD]"
              />
              {isChild && (
                <p className="text-xs text-gray-400 mt-1 leading-snug">
                  We'll send account and PIN reset emails here. Your child's PIN is the only login required.
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          {/* Submit — only shown once email step is reached */}
          {pinStep === 'confirm' && confirmPin.length === PIN_LENGTH && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !email.trim() || usernameStatus !== 'available'}
              className="w-full bg-[#378ADD] text-white font-bold py-3.5 rounded-2xl text-base hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          )}

          <p className="text-center text-xs text-gray-400 leading-snug">
            By creating an account you agree to our{' '}
            <Link to="/privacy" className="underline hover:text-[#378ADD]">Privacy Policy</Link>.
          </p>
        </div>

        <p className="text-center text-white/80 text-sm mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-white font-bold underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
