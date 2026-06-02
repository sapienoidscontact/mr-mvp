import { useState, useEffect } from 'react';
import { getVisitsForDateRange } from '../lib/db.js';

function todayISO() { return new Date().toISOString().slice(0, 10); }

function formatMs(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function StatBox({ icon, value, label, sub }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-center">
      <div className="text-3xl mb-1">{icon}</div>
      <div className="text-2xl font-extrabold text-gray-800 dark:text-gray-100">{value}</div>
      <div className="text-sm font-semibold text-gray-600 dark:text-gray-300">{label}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function DailySummary() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const start = `${todayISO()}T00:00:00.000Z`;
    const end = `${todayISO()}T23:59:59.999Z`;
    getVisitsForDateRange(start, end)
      .then(setVisits)
      .finally(() => setLoading(false));
  }, []);

  const arrivals = visits.filter(v => v.event_type === 'ARRIVED').sort((a, b) => a.timestamp_iso.localeCompare(b.timestamp_iso));
  const lefts = visits.filter(v => v.event_type === 'LEFT').sort((a, b) => a.timestamp_iso.localeCompare(b.timestamp_iso));

  let fieldMs = 0;
  arrivals.forEach((arr, i) => {
    const left = lefts[i];
    if (left) fieldMs += new Date(left.timestamp_iso) - new Date(arr.timestamp_iso);
  });

  const totalOrder = arrivals.reduce((s, v) => s + (v.order_value_inr || 0), 0);
  const totalSamples = arrivals.reduce((s, v) => s + (v.samples_given || 0), 0);

  // Product frequency
  const productFreq = {};
  arrivals.forEach(v => {
    (v.products_discussed || '').split(',').map(p => p.trim()).filter(Boolean).forEach(p => {
      productFreq[p] = (productFreq[p] || 0) + 1;
    });
  });
  const productList = Object.entries(productFreq).sort((a, b) => b[1] - a[1]);
  const maxFreq = productList[0]?.[1] || 1;

  const cities = [...new Set(arrivals.map(v => v.city).filter(Boolean))];

  const shareText = [
    `📊 MR Tracker — Daily Summary (${new Date().toLocaleDateString('en-IN')})`,
    `👨‍⚕️ Total Visits: ${arrivals.length}`,
    `⏱ Field Time: ${formatMs(fieldMs)}`,
    `💰 Total Orders: ₹${totalOrder}`,
    `💊 Samples Given: ${totalSamples}`,
    cities.length ? `📍 Cities: ${cities.join(', ')}` : '',
    productList.length ? `🧪 Products: ${productList.map(([p, c]) => `${p} (${c})`).join(', ')}` : ''
  ].filter(Boolean).join('\n');

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'MR Tracker Summary', text: shareText }); }
      catch (_) {}
    } else {
      try { await navigator.clipboard.writeText(shareText); alert('Summary copied to clipboard!'); }
      catch (_) { alert(shareText); }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <header className="bg-green-600 dark:bg-green-900 text-white px-4 py-3 shadow-md sticky top-0 z-10">
        <h1 className="text-lg font-bold">Daily Summary</h1>
        <p className="text-xs text-green-200">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </header>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">
        {loading ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2">⏳</div>
            Calculating…
          </div>
        ) : (
          <>
            {/* Key stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatBox icon="👨‍⚕️" value={arrivals.length} label="Total Visits" />
              <StatBox icon="⏱" value={formatMs(fieldMs)} label="Field Time" />
              <StatBox icon="💰" value={`₹${totalOrder}`} label="Total Orders" sub={arrivals.length > 0 ? `₹${Math.round(totalOrder / arrivals.length)}/visit avg` : undefined} />
              <StatBox icon="💊" value={totalSamples} label="Samples Given" />
            </div>

            {/* Products bar chart */}
            {productList.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
                <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-3">🧪 Products Discussed</h2>
                <div className="space-y-2.5">
                  {productList.map(([product, count]) => (
                    <div key={product}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 dark:text-gray-300 font-medium">{product}</span>
                        <span className="text-gray-500 dark:text-gray-400">{count}×</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 dark:bg-green-400 rounded-full transition-all"
                          style={{ width: `${(count / maxFreq) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cities */}
            {cities.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
                <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2">📍 Cities Visited</h2>
                <div className="flex flex-wrap gap-2">
                  {cities.map(city => (
                    <span key={city} className="px-3 py-1 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                      {city}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Visit timeline */}
            {arrivals.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4">
                <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-3">📋 Visit Timeline</h2>
                <div className="space-y-2">
                  {arrivals.map((v, i) => (
                    <div key={v.visit_id} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-green-500 dark:bg-green-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-800 dark:text-gray-100 text-sm">{v.doctor_name || 'Unknown'}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{v.clinic_name} · {new Date(v.timestamp_iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      {v.order_value_inr > 0 && (
                        <div className="text-green-600 dark:text-green-400 text-sm font-semibold">₹{v.order_value_inr}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {arrivals.length === 0 && (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                <div className="text-4xl mb-2">🌅</div>
                <p>No visits logged today yet.</p>
                <p className="text-sm mt-1">Go to Home and start your day!</p>
              </div>
            )}

            {/* Share button */}
            <button
              onClick={handleShare}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-2xl shadow-lg transition touch-manipulation flex items-center justify-center gap-2"
            >
              <span>📤</span>
              <span>Share Summary</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
