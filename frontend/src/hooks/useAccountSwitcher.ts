import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, PinRequiredError } from '../contexts/AuthContext';
import type { SavedAccount } from '../lib/accountStore';

/**
 * Switching between accounts that have signed in on this device. Used by the
 * desktop sidebar and the phone's Me tab, so both behave the same.
 */
export function useAccountSwitcher(onDone?: () => void) {
  const { profile, savedAccounts, switchTo } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const otherAccounts = savedAccounts.filter(
    (a) => a.username.toLowerCase() !== (profile?.username ?? '').toLowerCase(),
  );

  async function switchAccount(account: SavedAccount) {
    setError('');
    try {
      await switchTo(account.username);
      onDone?.();
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof PinRequiredError) {
        // Admin account, or a stored session that no longer works: send them
        // to sign-in with the username already filled in.
        onDone?.();
        navigate('/login', { state: { username: account.username } });
        return;
      }
      setError(e instanceof Error ? e.message : 'Could not switch account');
    }
  }

  return { otherAccounts, switchAccount, error };
}
