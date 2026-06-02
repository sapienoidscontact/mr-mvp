import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { hashPin } from '../lib/appsScriptClient.js';

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';

const TERRITORIES = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad', 'Other'];

const inputClass = "w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-base focus:outline-none focus:border-green-500 dark:focus:border-green-400 transition";

async function submitSignUp(payload) {
  if (!APPS_SCRIPT_URL) throw new Error('App not configured — VITE_APPS_SCRIPT_URL missing in .env');
  if (!window.crypto?.subtle) throw new Error('Secure context required — open the app at https:// or localhost only');
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(payload).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url.toString(), { method: 'GET', signal: controller.signal });
    const text = await res.text();
    console.log('[SignUp] Apps Script response:', text);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Server returned non-JSON. Redeploy Code.gs with the registerMR function, then try again.');
    }
  } catch (err) {
    console.error('[SignUp] fetch error:', err);
    if (err.name === 'AbortError') throw new Error('Request timed out after 30s — try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export default function SignUp() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    mr_id: '',
    mr_name: '',
    pin: '',
    pin_confirm: '',
    territory: 'Mumbai',
    reporting_manager: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    if (!form.mr_id.trim()) return 'MR ID is required.';
    if (!/^[A-Za-z0-9]+$/.test(form.mr_id.trim())) return 'MR ID can only contain letters and numbers.';
    if (!form.mr_name.trim()) return 'Full name is required.';
    if (!/^\d{4}$/.test(form.pin)) return 'PIN must be exactly 4 digits.';
    if (form.pin !== form.pin_confirm) return 'PINs do not match.';
    if (!form.reporting_manager.trim()) return 'Reporting manager name is required.';
    return null;
  };

  const handleSubmit = useCallback(async e => {
    e.preventDefault();
    setError('');
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    try {
      const pin_hash = await hashPin(form.pin);
      const result = await submitSignUp({
        action: 'registerMR',
        mr_id: form.mr_id.trim().toUpperCase(),
        mr_name: form.mr_name.trim(),
        pin_hash,
        territory: form.territory,
        reporting_manager: form.reporting_manager.trim(),
        joined_date: new Date().toISOString().slice(0, 10)
      });

      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Unexpected error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [form]);

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-600 to-green-800 dark:from-green-900 dark:to-gray-900 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-extrabold text-gray-800 dark:text-white mb-2">Registered!</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            Your account <span className="font-bold text-green-600">{form.mr_id.toUpperCase()}</span> has been created. You can now log in.
          </p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-2xl text-lg shadow-lg transition touch-manipulation"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-600 to-green-800 dark:from-green-900 dark:to-gray-900 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">📋</div>
          <h1 className="text-2xl font-extrabold text-white">Create Account</h1>
          <p className="text-green-200 text-sm mt-1">MR Tracker — New Registration</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 space-y-4">
          {/* MR ID */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">MR ID <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.mr_id}
              onChange={e => setForm(f => ({ ...f, mr_id: e.target.value.toUpperCase().replace(/\s/g, '') }))}
              placeholder="e.g. MR001"
              autoCapitalize="characters"
              className={inputClass + " font-mono"}
            />
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Full Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.mr_name}
              onChange={set('mr_name')}
              placeholder="Rahul Sharma"
              className={inputClass}
            />
          </div>

          {/* Territory */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Territory <span className="text-red-500">*</span></label>
            <select value={form.territory} onChange={set('territory')} className={inputClass}>
              {TERRITORIES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {/* Reporting Manager */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Reporting Manager <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.reporting_manager}
              onChange={set('reporting_manager')}
              placeholder="Manager name"
              className={inputClass}
            />
          </div>

          {/* PIN */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">4-Digit PIN <span className="text-red-500">*</span></label>
            <input
              type="tel"
              value={form.pin}
              onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              placeholder="••••"
              inputMode="numeric"
              maxLength={4}
              className={inputClass + " text-2xl tracking-[0.5em] text-center"}
            />
          </div>

          {/* Confirm PIN */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Confirm PIN <span className="text-red-500">*</span></label>
            <input
              type="tel"
              value={form.pin_confirm}
              onChange={e => setForm(f => ({ ...f, pin_confirm: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              placeholder="••••"
              inputMode="numeric"
              maxLength={4}
              className={inputClass + " text-2xl tracking-[0.5em] text-center"}
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm font-medium">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-lg shadow-lg transition touch-manipulation"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Registering…
              </span>
            ) : 'Create Account'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 py-2 transition"
          >
            Already have an account? Login
          </button>
        </div>
      </div>
    </div>
  );
}
