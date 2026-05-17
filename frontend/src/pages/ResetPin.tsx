import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Delete } from 'lucide-react';
import { supabase } from '../lib/supabase';

const PIN_LENGTH = 6;

const NUMPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'back'],
];

export function ResetPin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    async function verifyToken() {
      const token_hash = searchParams.get('token_hash');
      const type = searchParams.get('type') as 'recovery' | null;

      if (!token_hash || type !== 'recovery') {
        setError('Invalid or expired reset link. Please request a new one.');
        setVerifying(false);
        return;
      }

      const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'recovery' });
      if (error) {
        setError('This reset link has expired or already been used. Please request a new one.');
      } else {
        setVerified(true);
      }
      setVerifying(false);
    }

    verifyToken();
  }, [searchParams]);

  function handleKey(key: string) {
    const current = pinStep === 'enter' ? pin : confirmPin;
    const setter = pinStep === 'enter' ? setPin : setConfirmPin;
    if (key === 'back') setter((p) => p.slice(0, -1));
    else if (current.length < PIN_LENGTH) setter((p) => p + key);
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
    setError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pin });
      if (error) throw new Error(error.message);
      setDone(true);
      // Sign out so the user logs in fresh with their new PIN
      await supabase.auth.signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update PIN');
    } finally {
      setLoading(false);
    }
  }

  const currentPin = pinStep === 'enter' ? pin : confirmPin;

  if (verifying) {
    return (
      <div className="min-h-screen bg-[#378ADD] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#378ADD] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <img src="/pokeball.svg" alt="Pokéball" className="w-14 h-14 mb-3" />
          <h1 className="text-white font-black text-2xl tracking-tight">New PIN</h1>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6">
          {done ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">✅</div>
              <p className="text-gray-700 font-semibold">PIN updated!</p>
              <p className="text-gray-500 text-sm">You can now sign in with your new PIN.</p>
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="block w-full bg-[#378ADD] text-white font-bold py-3 rounded-2xl text-center hover:bg-blue-600 transition-colors"
              >
                Sign In
              </button>
            </div>
          ) : !verified ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">⚠️</div>
              <p className="text-gray-700 font-semibold">Link invalid</p>
              <p className="text-gray-500 text-sm">{error}</p>
              <Link
                to="/forgot-pin"
                className="block w-full bg-[#378ADD] text-white font-bold py-3 rounded-2xl text-center hover:bg-blue-600 transition-colors"
              >
                Request New Link
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {pinStep === 'enter' ? 'Choose a new 6-digit PIN' : 'Confirm your new PIN'}
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
                        onClick={() => handleKey(key)}
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
              </div>

              {error && <p className="text-red-500 text-sm text-center">{error}</p>}

              {pinStep === 'enter' ? (
                <button
                  type="button"
                  onClick={advancePin}
                  disabled={pin.length !== PIN_LENGTH}
                  className="w-full bg-[#378ADD] text-white font-bold py-3.5 rounded-2xl text-base hover:bg-blue-600 transition-colors disabled:opacity-40"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || confirmPin.length !== PIN_LENGTH}
                  className="w-full bg-[#378ADD] text-white font-bold py-3.5 rounded-2xl text-base hover:bg-blue-600 transition-colors disabled:opacity-40"
                >
                  {loading ? 'Saving…' : 'Save New PIN'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
