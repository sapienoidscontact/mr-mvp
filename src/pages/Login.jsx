import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { validatePin, fetchProducts } from '../lib/appsScriptClient.js';
import { cacheProducts } from '../lib/db.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';

const CACHE_TTL_DAYS = 30;

function getCachedAuth(mr_id) {
  try {
    const raw = localStorage.getItem(`mr_auth_${mr_id}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const ageDays = (Date.now() - data.ts) / 86400000;
    if (ageDays > CACHE_TTL_DAYS) return null;
    return data;
  } catch { return null; }
}

function setCachedAuth(mr_id, data) {
  localStorage.setItem(`mr_auth_${mr_id}`, JSON.stringify({ ...data, ts: Date.now() }));
}

export default function Login() {
  const [mrId, setMrId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { isOnline } = useOnlineStatus();

  const handleLogin = useCallback(async e => {
    e.preventDefault();
    setError('');

    if (!mrId.trim()) { setError('Please enter your MR ID.'); return; }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) { setError('PIN must be exactly 4 digits.'); return; }

    setLoading(true);
    try {
      let authData;

      if (!isOnline) {
        const cached = getCachedAuth(mrId.toUpperCase());
        if (cached) {
          authData = cached;
        } else {
          setError('No internet connection. Cannot login for the first time offline.');
          return;
        }
      } else {
        const result = await validatePin(mrId.toUpperCase(), pin);
        if (!result.valid) {
          setError('Invalid MR ID or PIN. Please try again.');
          return;
        }
        authData = {
          mr_id: mrId.toUpperCase(),
          mr_name: result.mr_name,
          territory: result.territory,
          reporting_manager: result.reporting_manager
        };
        setCachedAuth(mrId.toUpperCase(), authData);

        // Pre-fetch products in background
        try {
          const products = await fetchProducts();
          if (Array.isArray(products)) await cacheProducts(products);
        } catch (_) { /* non-critical */ }
      }

      localStorage.setItem('mr_session', JSON.stringify(authData));
      navigate('/home', { replace: true });
    } catch (err) {
      if (!isOnline) {
        setError('No internet. Please go online to login.');
      } else {
        setError('Login failed. Check your MR ID and PIN, or try again later.');
      }
    } finally {
      setLoading(false);
    }
  }, [mrId, pin, isOnline, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-600 to-green-800 dark:from-green-900 dark:to-gray-900 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">💊</div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">MR Tracker</h1>
          <p className="text-green-200 mt-1 text-sm">Field Visit Management</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6">
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                MR ID
              </label>
              <input
                type="text"
                value={mrId}
                onChange={e => setMrId(e.target.value.toUpperCase())}
                placeholder="e.g. MR001"
                autoCapitalize="characters"
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-lg font-mono focus:outline-none focus:border-green-500 dark:focus:border-green-400 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                4-Digit PIN
              </label>
              <input
                type="tel"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
                inputMode="numeric"
                maxLength={4}
                autoComplete="one-time-code"
                pattern="\d{4}"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-2xl tracking-[0.5em] text-center focus:outline-none focus:border-green-500 dark:focus:border-green-400 transition"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm font-medium">
                {error}
              </div>
            )}

            {!isOnline && (
              <div className="bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
                <span>📶</span>
                <span>Offline — cached credentials only</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !mrId || pin.length !== 4}
              className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-lg shadow-lg transition-all duration-150 touch-manipulation"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Verifying…
                </span>
              ) : 'Login'}
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={() => navigate('/signup')}
          className="w-full mt-4 text-center text-sm text-green-200 hover:text-white py-2 transition"
        >
          New MR? Create an account →
        </button>

        <p className="text-center text-green-300 text-xs mt-3">
          MR Tracker v1.0.0 · Contact your manager for credentials
        </p>
      </div>
    </div>
  );
}
