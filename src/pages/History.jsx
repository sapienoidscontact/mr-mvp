import { useState, useEffect } from 'react';
import { getVisitsForDateRange } from '../lib/db.js';

const EVENT_BADGE = {
  ARRIVED: { label: 'ARRIVED', cls: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  LEFT: { label: 'LEFT', cls: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  BREAK_START: { label: 'BREAK', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  BREAK_END: { label: 'BACK', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' }
};

function groupByDate(visits) {
  const groups = {};
  visits.forEach(v => {
    const date = v.timestamp_iso.slice(0, 10);
    if (!groups[date]) groups[date] = [];
    groups[date].push(v);
  });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function formatDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const today = new Date().toISOString().slice(0, 10);
  if (isoDate === today) return 'Today';
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (isoDate === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}

function VisitCard({ visit }) {
  const [expanded, setExpanded] = useState(false);
  const badge = EVENT_BADGE[visit.event_type] || EVENT_BADGE.ARRIVED;
  const time = new Date(visit.timestamp_iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
            {visit.doctor_name && <span className="font-semibold text-gray-800 dark:text-gray-100 truncate">{visit.doctor_name}</span>}
          </div>
          {visit.clinic_name && (
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {visit.clinic_name}{visit.city ? ` · ${visit.city}` : ''}
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          {visit.order_value_inr > 0 && (
            <div className="text-green-600 dark:text-green-400 font-bold text-sm">₹{visit.order_value_inr}</div>
          )}
          <div className="text-xs text-gray-400">{time}</div>
          <div className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">{expanded ? '▲' : '▼'}</div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-gray-100 dark:border-gray-700 pt-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            {visit.doctor_degree && <Info label="Degree" value={visit.doctor_degree} />}
            {visit.doctor_specialty && <Info label="Specialty" value={visit.doctor_specialty} />}
            {visit.samples_given > 0 && <Info label="Samples" value={visit.samples_given} />}
            {visit.order_value_inr > 0 && <Info label="Order" value={`₹${visit.order_value_inr}`} />}
          </div>
          {visit.products_discussed && (
            <div>
              <span className="font-semibold text-gray-600 dark:text-gray-400">Products: </span>
              <span className="text-gray-800 dark:text-gray-200">{visit.products_discussed}</span>
            </div>
          )}
          {visit.latitude && (
            <div className="font-mono text-xs text-gray-400 dark:text-gray-500">
              GPS: {visit.latitude.toFixed(5)}, {visit.longitude.toFixed(5)} ±{visit.accuracy_m}m
            </div>
          )}
          {visit.notes && (
            <div>
              <span className="font-semibold text-gray-600 dark:text-gray-400">Notes: </span>
              <span className="text-gray-800 dark:text-gray-200">{visit.notes}</span>
            </div>
          )}
          {visit.photo_drive_link && (
            <a href={visit.photo_drive_link} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline text-xs">
              📸 View photo
            </a>
          )}
          {visit.photo_base64 && !visit.photo_drive_link && (
            <img src={`data:${visit.photo_mime_type || 'image/jpeg'};base64,${visit.photo_base64}`} alt="Clinic" className="w-full h-32 object-cover rounded-xl" />
          )}
          <div className="text-xs text-gray-400 font-mono">
            {new Date(visit.timestamp_iso).toLocaleString('en-IN')}
          </div>
          <div className={`text-xs font-medium ${visit.synced ? 'text-green-500' : 'text-amber-500'}`}>
            {visit.synced ? '✓ Synced' : '↻ Pending sync'}
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <span className="text-gray-500 dark:text-gray-400 text-xs">{label}: </span>
      <span className="text-gray-800 dark:text-gray-200 font-medium">{value}</span>
    </div>
  );
}

export default function History() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    const start = new Date(Date.now() - 7 * 86400000).toISOString();
    const end = new Date().toISOString();
    getVisitsForDateRange(start, end)
      .then(visits => setGroups(groupByDate(visits)))
      .finally(() => setLoading(false));
  }, []);

  const filters = ['ALL', 'ARRIVED', 'LEFT', 'BREAK_START'];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <header className="bg-green-600 dark:bg-green-900 text-white px-4 py-3 shadow-md sticky top-0 z-10">
        <h1 className="text-lg font-bold">Visit History</h1>
        <p className="text-xs text-green-200">Last 7 days</p>
      </header>

      {/* Filter tabs */}
      <div className="flex gap-2 px-4 pt-3 overflow-x-auto pb-1">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition flex-shrink-0
              ${filter === f ? 'bg-green-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'}`}
          >
            {f === 'ALL' ? 'All Events' : f === 'ARRIVED' ? 'Visits' : f === 'LEFT' ? 'Left' : 'Breaks'}
          </button>
        ))}
      </div>

      <div className="px-4 pt-3 space-y-4 max-w-lg mx-auto">
        {loading && (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2">⏳</div>
            Loading history…
          </div>
        )}
        {!loading && groups.length === 0 && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <div className="text-4xl mb-2">📭</div>
            <p>No visits recorded yet.</p>
            <p className="text-sm mt-1">Start your day and log your first visit!</p>
          </div>
        )}
        {!loading && groups.map(([date, visits]) => {
          const filtered = filter === 'ALL' ? visits : visits.filter(v => v.event_type === filter);
          if (filtered.length === 0) return null;
          return (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="font-bold text-gray-700 dark:text-gray-300">{formatDate(date)}</h2>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {filtered.filter(v => v.event_type === 'ARRIVED').length} visits
                </span>
              </div>
              <div className="space-y-2">
                {filtered.map(v => <VisitCard key={v.visit_id} visit={v} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
