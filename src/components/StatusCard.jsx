import { useEffect, useState } from 'react';

const STATE_CONFIG = {
  IDLE: {
    label: 'Not Started',
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-600 dark:text-gray-300',
    icon: '🌅',
    border: 'border-gray-300 dark:border-gray-600'
  },
  ON_FIELD: {
    label: 'On Field',
    bg: 'bg-green-50 dark:bg-green-950',
    text: 'text-green-700 dark:text-green-300',
    icon: '🟢',
    border: 'border-green-400 dark:border-green-700'
  },
  ON_BREAK: {
    label: 'On Break',
    bg: 'bg-amber-50 dark:bg-amber-950',
    text: 'text-amber-700 dark:text-amber-300',
    icon: '☕',
    border: 'border-amber-400 dark:border-amber-700'
  },
  DAY_ENDED: {
    label: 'Day Ended',
    bg: 'bg-blue-50 dark:bg-blue-950',
    text: 'text-blue-700 dark:text-blue-300',
    icon: '✅',
    border: 'border-blue-400 dark:border-blue-700'
  }
};

function formatDuration(ms) {
  if (!ms || ms < 0) return '0h 0m';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

export default function StatusCard({ state = 'IDLE', sessionStart, visitsToday = 0, totalOrderValue = 0, fieldHoursMs = 0, lastPosition = null }) {
  const [elapsed, setElapsed] = useState(0);
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.IDLE;

  useEffect(() => {
    if (!sessionStart || state === 'IDLE' || state === 'DAY_ENDED') {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Date.now() - new Date(sessionStart).getTime());
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [sessionStart, state]);

  return (
    <div className={`rounded-2xl border-2 ${cfg.border} ${cfg.bg} p-4 shadow-sm`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{cfg.icon}</span>
          <span className={`text-xl font-bold ${cfg.text}`}>{cfg.label}</span>
        </div>
        {sessionStart && state !== 'IDLE' && (
          <span className={`text-sm font-mono ${cfg.text} opacity-80`}>
            {formatDuration(elapsed)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-2 shadow-sm">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{visitsToday}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Visits</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-2 shadow-sm">
          <div className="text-lg font-bold text-gray-800 dark:text-gray-100">{formatDuration(fieldHoursMs)}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Field Time</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-2 shadow-sm">
          <div className="text-lg font-bold text-gray-800 dark:text-gray-100">
            ₹{totalOrderValue >= 1000 ? `${(totalOrderValue / 1000).toFixed(1)}k` : totalOrderValue}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Orders</div>
        </div>
      </div>

      {lastPosition && (
        <div className="mt-2 text-xs text-gray-400 dark:text-gray-500 font-mono text-center">
          GPS: {lastPosition.latitude.toFixed(5)}, {lastPosition.longitude.toFixed(5)} ±{lastPosition.accuracy_m}m
        </div>
      )}
    </div>
  );
}
