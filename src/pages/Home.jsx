import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import StatusCard from '../components/StatusCard.jsx';
import SyncIndicator from '../components/SyncIndicator.jsx';
import BigButton from '../components/BigButton.jsx';
import { addVisit, getSession, setSession, getVisitsForDateRange, getLastVisitWithCoords } from '../lib/db.js';
import { getCurrentPosition } from '../lib/geolocation.js';
import { haversineDistance, formatDistance } from '../lib/haversine.js';
import { syncNow } from '../lib/syncEngine.js';

function getAuth() {
  try { return JSON.parse(localStorage.getItem('mr_session') || 'null'); } catch { return null; }
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function getStreak(mr_id) {
  try {
    const raw = localStorage.getItem(`mr_streak_${mr_id}`);
    if (!raw) return { count: 0, lastDate: null };
    return JSON.parse(raw);
  } catch { return { count: 0, lastDate: null }; }
}

function updateStreak(mr_id) {
  const today = todayISO();
  const streak = getStreak(mr_id);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let count = streak.lastDate === today ? streak.count : streak.lastDate === yesterday ? streak.count + 1 : 1;
  localStorage.setItem(`mr_streak_${mr_id}`, JSON.stringify({ count, lastDate: today }));
  return count;
}

function formatTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Home() {
  const navigate = useNavigate();
  const auth = getAuth();
  const [session, setSessionState] = useState(null);
  const [todayVisits, setTodayVisits] = useState([]);
  const [weekVisits, setWeekVisits] = useState([]);
  const [fieldHoursMs, setFieldHoursMs] = useState(0);
  const [toast, setToast] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('darkMode');
    if (stored !== null) return stored === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [streak, setStreak] = useState(0);
  const reminderRef = useRef(null);
  const lastGpsRef = useRef(null);
  const lastGpsTimeRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  const loadData = useCallback(async () => {
    const todayStart = `${todayISO()}T00:00:00.000Z`;
    const todayEnd = `${todayISO()}T23:59:59.999Z`;
    const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();
    const [visits, week, sess] = await Promise.all([
      getVisitsForDateRange(todayStart, todayEnd),
      getVisitsForDateRange(weekStart, new Date().toISOString()),
      getSession()
    ]);
    setTodayVisits(visits);
    setWeekVisits(week);
    setSessionState(sess);

    // Calculate field hours from ARRIVED/LEFT pairs
    const arrivals = visits.filter(v => v.event_type === 'ARRIVED').sort((a, b) => a.timestamp_iso.localeCompare(b.timestamp_iso));
    const lefts = visits.filter(v => v.event_type === 'LEFT').sort((a, b) => a.timestamp_iso.localeCompare(b.timestamp_iso));
    let ms = 0;
    arrivals.forEach((arr, i) => {
      const left = lefts[i];
      if (left) ms += new Date(left.timestamp_iso) - new Date(arr.timestamp_iso);
    });
    setFieldHoursMs(ms);

    if (auth?.mr_id) {
      setStreak(getStreak(auth.mr_id).count);
    }
  }, [auth?.mr_id]);

  useEffect(() => { loadData(); }, [loadData]);

  // 30-min reminder: if GPS hasn't changed and no ARRIVED logged recently
  useEffect(() => {
    if (!session || session.state === 'IDLE' || session.state === 'DAY_ENDED') return;
    const REMINDER_MS = 30 * 60 * 1000;
    reminderRef.current = setInterval(async () => {
      const todayStart = `${todayISO()}T00:00:00.000Z`;
      const todayEnd = `${todayISO()}T23:59:59.999Z`;
      const visits = await getVisitsForDateRange(todayStart, todayEnd);
      const lastArrived = visits.filter(v => v.event_type === 'ARRIVED').slice(-1)[0];
      if (!lastArrived) return;
      const msSinceLast = Date.now() - new Date(lastArrived.timestamp_iso).getTime();
      if (msSinceLast > REMINDER_MS && Notification.permission === 'granted') {
        new Notification('MR Tracker Reminder', {
          body: `You've been at ${lastArrived.clinic_name || 'a location'} for over 30 minutes. Did you forget to log your visit?`,
          icon: '/icons/icon-192.png'
        });
      }
    }, REMINDER_MS);
    return () => clearInterval(reminderRef.current);
  }, [session]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function captureGps() {
    setGpsLoading(true);
    try {
      const pos = await getCurrentPosition();
      lastGpsRef.current = pos;
      lastGpsTimeRef.current = Date.now();
      return pos;
    } finally {
      setGpsLoading(false);
    }
  }

  async function logSimpleEvent(event_type) {
    let pos = null;
    try { pos = await captureGps(); } catch (err) {
      showToast(`GPS error: ${err.message || err.code}. Event logged without location.`, 'warning');
    }

    const visitData = {
      visit_id: uuidv4(),
      mr_id: auth.mr_id,
      mr_name: auth.mr_name,
      timestamp_iso: new Date().toISOString(),
      event_type,
      latitude: pos?.latitude || null,
      longitude: pos?.longitude || null,
      accuracy_m: pos?.accuracy_m || null,
      doctor_name: '', doctor_degree: '', doctor_specialty: '',
      clinic_name: '', city: '', products_discussed: '',
      samples_given: 0, order_value_inr: 0, notes: '',
      day_session_id: session?.day_session_id || ''
    };

    await addVisit(visitData);
    if (navigator.onLine) syncNow();

    // Distance from last visit for LEFT events
    if (event_type === 'LEFT' && pos) {
      const lastVisit = await getLastVisitWithCoords(auth.mr_id);
      if (lastVisit && lastVisit.visit_id !== visitData.visit_id && lastVisit.latitude && lastVisit.longitude) {
        const dist = haversineDistance(lastVisit.latitude, lastVisit.longitude, pos.latitude, pos.longitude);
        showToast(`LEFT logged. Distance from last visit: ${formatDistance(dist)}`);
      } else {
        showToast('LEFT logged ✓');
      }
    } else {
      showToast(`${event_type.replace('_', ' ')} logged ✓`);
    }

    await loadData();
  }

  async function handleArrived() {
    if (!session || session.state === 'IDLE') {
      showToast('Please Start Your Day first.', 'error'); return;
    }
    let pos = null;
    setGpsLoading(true);
    try {
      pos = await getCurrentPosition();
    } catch (err) {
      showToast(`GPS: ${err.message || err.code}. Continuing without GPS.`, 'warning');
    } finally {
      setGpsLoading(false);
    }
    navigate('/visit-form', {
      state: {
        event_type: 'ARRIVED',
        latitude: pos?.latitude || null,
        longitude: pos?.longitude || null,
        accuracy_m: pos?.accuracy_m || null,
        day_session_id: session.day_session_id
      }
    });
  }

  async function handleStartDay() {
    if (session && session.state !== 'IDLE' && session.state !== 'DAY_ENDED') {
      showToast('Day already started.', 'warning'); return;
    }
    const newSession = {
      day_session_id: uuidv4(),
      state: 'ON_FIELD',
      session_start: new Date().toISOString()
    };
    await setSession(newSession);
    setSessionState(newSession);
    if (auth?.mr_id) updateStreak(auth.mr_id);
    if (Notification.permission === 'default') Notification.requestPermission();
    showToast('Day started! Go get those visits 💪');
  }

  async function handleEndDay() {
    const updated = { ...session, state: 'DAY_ENDED' };
    await setSession(updated);
    setSessionState(updated);
    showToast('Day ended. Great work today! 🎉');
    await loadData();
  }

  async function handleBreakStart() {
    await logSimpleEvent('BREAK_START');
    const updated = { ...session, state: 'ON_BREAK' };
    await setSession(updated);
    setSessionState(updated);
  }

  async function handleBreakEnd() {
    await logSimpleEvent('BREAK_END');
    const updated = { ...session, state: 'ON_FIELD' };
    await setSession(updated);
    setSessionState(updated);
  }

  const totalOrderToday = todayVisits.reduce((sum, v) => sum + (v.order_value_inr || 0), 0);
  const visitsToday = todayVisits.filter(v => v.event_type === 'ARRIVED').length;

  // Weekly stats
  const weekArrivals = weekVisits.filter(v => v.event_type === 'ARRIVED');
  const weekOrder = weekVisits.reduce((s, v) => s + (v.order_value_inr || 0), 0);
  const uniqueDays = new Set(weekArrivals.map(v => v.timestamp_iso.slice(0, 10))).size;

  const sessionState = session?.state || 'IDLE';
  const isDayStarted = sessionState !== 'IDLE' && sessionState !== 'DAY_ENDED';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      {/* Header */}
      <header className="bg-green-600 dark:bg-green-900 text-white px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold">MR Tracker</h1>
          <p className="text-xs text-green-200">{auth?.mr_name || auth?.mr_id}</p>
        </div>
        <div className="flex items-center gap-3">
          <SyncIndicator />
          <button
            onClick={() => setDarkMode(d => !d)}
            className="text-xl p-1 rounded-lg hover:bg-green-700 transition"
            aria-label="Toggle dark mode"
          >
            {darkMode ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">
        {/* Status Card */}
        <StatusCard
          state={sessionState}
          sessionStart={session?.session_start}
          visitsToday={visitsToday}
          totalOrderValue={totalOrderToday}
          fieldHoursMs={fieldHoursMs}
          lastPosition={lastGpsRef.current}
        />

        {/* Session control */}
        {!isDayStarted ? (
          <BigButton
            label="Start Day"
            icon="🌅"
            color="green"
            onClick={handleStartDay}
          />
        ) : (
          <BigButton
            label="End Day"
            icon="🏁"
            color="blue"
            onClick={handleEndDay}
            confirmRequired
          />
        )}

        {/* GPS loading indicator */}
        {gpsLoading && (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-1">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Getting GPS location…
          </div>
        )}

        {/* Four main action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <BigButton
            label="ARRIVED"
            icon="🟢"
            color="green"
            onClick={handleArrived}
            disabled={!isDayStarted || gpsLoading}
            loading={gpsLoading}
          />
          <BigButton
            label="LEFT"
            icon="🔴"
            color="red"
            onClick={() => logSimpleEvent('LEFT')}
            disabled={!isDayStarted || gpsLoading}
            loading={gpsLoading}
          />
          <BigButton
            label="BREAK START"
            icon="☕"
            color="amber"
            onClick={handleBreakStart}
            disabled={!isDayStarted || sessionState === 'ON_BREAK' || gpsLoading}
          />
          <BigButton
            label="BREAK END"
            icon="✅"
            color="blue"
            onClick={handleBreakEnd}
            disabled={!isDayStarted || sessionState !== 'ON_BREAK' || gpsLoading}
          />
        </div>

        {/* Weekly stats */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-800 dark:text-gray-100">📊 This Week</h2>
            {streak > 0 && (
              <span className="bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-xs font-bold px-2 py-1 rounded-full">
                🏆 {streak} day streak
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{weekArrivals.length}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Visits</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">
                ₹{weekOrder >= 1000 ? `${(weekOrder / 1000).toFixed(1)}k` : weekOrder}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Orders</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {uniqueDays > 0 ? (weekArrivals.length / uniqueDays).toFixed(1) : '0'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Avg/day</div>
            </div>
          </div>
        </div>

        {/* Today's visits quick list */}
        {visitsToday > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">Today's Visits ({visitsToday})</h2>
            <div className="space-y-2">
              {todayVisits.filter(v => v.event_type === 'ARRIVED').slice(-3).map(v => (
                <div key={v.visit_id} className="flex justify-between items-center text-sm py-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <div>
                    <span className="font-medium text-gray-800 dark:text-gray-100">{v.doctor_name || '—'}</span>
                    <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs">{v.clinic_name}</span>
                  </div>
                  <div className="text-right">
                    {v.order_value_inr > 0 && <div className="text-green-600 dark:text-green-400 font-medium">₹{v.order_value_inr}</div>}
                    <div className="text-xs text-gray-400">{new Date(v.timestamp_iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-medium z-50 max-w-xs text-center transition-all
          ${toast.type === 'error' ? 'bg-red-600' : toast.type === 'warning' ? 'bg-amber-600' : 'bg-green-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
