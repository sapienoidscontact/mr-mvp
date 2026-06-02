import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { addVisit, getProducts, getDoctorSuggestions, addDoctorToCache, getLastVisitWithCoords } from '../lib/db.js';
import { isVoiceSupported, startListening, stopListening } from '../lib/voiceInput.js';
import { haversineDistance, formatDistance } from '../lib/haversine.js';
import { syncNow } from '../lib/syncEngine.js';

const DEGREES = ['MBBS', 'MD', 'DM', 'BDS', 'MDS', 'Other'];
const SPECIALTIES = ['General Practice', 'Cardiology', 'Pediatrics', 'Orthopedics', 'Gynecology', 'ENT', 'Dermatology', 'Other'];

function getAuth() {
  try { return JSON.parse(localStorage.getItem('mr_session') || 'null'); } catch { return null; }
}

function LabelInput({ label, children, required }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass = "w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-base focus:outline-none focus:border-green-500 dark:focus:border-green-400 transition";

export default function VisitForm() {
  const navigate = useNavigate();
  const { state: routeState } = useLocation();
  const auth = getAuth();

  const [form, setForm] = useState({
    doctor_name: '',
    doctor_degree: 'MBBS',
    doctor_specialty: 'General Practice',
    clinic_name: '',
    city: '',
    notes: '',
    samples_given: '',
    order_value_inr: ''
  });
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [photoBase64, setPhotoBase64] = useState(null);
  const [photoMime, setPhotoMime] = useState('image/jpeg');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [distFromLast, setDistFromLast] = useState(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const recognitionRef = useRef(null);

  const gps = {
    latitude: routeState?.latitude || null,
    longitude: routeState?.longitude || null,
    accuracy_m: routeState?.accuracy_m || null
  };

  useEffect(() => {
    getProducts().then(setProducts);
    // Distance from last visit
    if (auth?.mr_id && gps.latitude) {
      getLastVisitWithCoords(auth.mr_id).then(last => {
        if (last?.latitude && last?.longitude) {
          const d = haversineDistance(last.latitude, last.longitude, gps.latitude, gps.longitude);
          setDistFromLast(formatDistance(d));
        }
      });
    }
  }, []);

  const handleDoctorChange = useCallback(async val => {
    setForm(f => ({ ...f, doctor_name: val }));
    if (val.length >= 2) {
      const s = await getDoctorSuggestions(val);
      setSuggestions(s);
    } else {
      setSuggestions([]);
    }
  }, []);

  const selectSuggestion = useCallback(doc => {
    setForm(f => ({
      ...f,
      doctor_name: doc.doctor_name,
      clinic_name: doc.clinic_name || f.clinic_name,
      city: doc.city || f.city
    }));
    setSuggestions([]);
  }, []);

  const handlePhotoCapture = useCallback(e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      const base64 = dataUrl.split(',')[1];
      setPhotoBase64(base64);
      setPhotoMime(file.type || 'image/jpeg');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleVoice = useCallback(() => {
    if (voiceActive) {
      stopListening(recognitionRef.current);
      setVoiceActive(false);
      return;
    }
    setVoiceActive(true);
    recognitionRef.current = startListening(
      transcript => {
        setForm(f => ({ ...f, notes: (f.notes ? f.notes + ' ' : '') + transcript }));
        setVoiceActive(false);
      },
      err => {
        alert(err);
        setVoiceActive(false);
      }
    );
  }, [voiceActive]);

  const toggleProduct = useCallback(pid => {
    setSelectedProducts(prev => prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]);
  }, []);

  const validate = () => {
    const e = {};
    if (!form.doctor_name.trim()) e.doctor_name = 'Doctor name is required';
    if (!form.clinic_name.trim()) e.clinic_name = 'Clinic name is required';
    if (!form.city.trim()) e.city = 'City is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);

    const selectedProductNames = products
      .filter(p => selectedProducts.includes(p.product_id))
      .map(p => p.product_name)
      .join('|');

    const visitData = {
      visit_id: uuidv4(),
      mr_id: auth.mr_id,
      mr_name: auth.mr_name,
      timestamp_iso: new Date().toISOString(),
      event_type: routeState?.event_type || 'ARRIVED',
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracy_m: gps.accuracy_m,
      doctor_name: form.doctor_name.trim(),
      doctor_degree: form.doctor_degree,
      doctor_specialty: form.doctor_specialty,
      clinic_name: form.clinic_name.trim(),
      city: form.city.trim(),
      products_discussed: selectedProductNames,
      samples_given: parseInt(form.samples_given) || 0,
      order_value_inr: parseFloat(form.order_value_inr) || 0,
      notes: form.notes.trim(),
      day_session_id: routeState?.day_session_id || '',
      photo_base64: photoBase64 || undefined,
      photo_mime_type: photoBase64 ? photoMime : undefined,
      photo_drive_link: null
    };

    try {
      await addVisit(visitData);
      await addDoctorToCache(visitData.doctor_name, visitData.clinic_name, visitData.city);
      if (navigator.onLine) syncNow();
      navigate('/home', { replace: true });
    } catch (err) {
      alert('Failed to save visit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isDark = document.documentElement.classList.contains('dark');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-8">
      <header className="bg-green-600 dark:bg-green-900 text-white px-4 py-3 flex items-center gap-3 shadow-md sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="text-xl p-1 rounded-lg hover:bg-green-700 transition" aria-label="Go back">←</button>
        <div>
          <h1 className="text-lg font-bold">Log Visit — ARRIVED</h1>
          {gps.latitude ? (
            <p className="text-xs text-green-200">📍 GPS: {gps.latitude.toFixed(4)}, {gps.longitude.toFixed(4)} ±{gps.accuracy_m}m</p>
          ) : (
            <p className="text-xs text-amber-200">⚠ No GPS — enter location manually</p>
          )}
        </div>
      </header>

      {distFromLast && (
        <div className="mx-4 mt-3 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-xl px-4 py-2 text-sm font-medium">
          📍 Distance from last visit: {distFromLast}
        </div>
      )}

      <form onSubmit={handleSubmit} className="px-4 pt-4 space-y-4 max-w-lg mx-auto">
        {/* Doctor Name with autocomplete */}
        <LabelInput label="Doctor Name" required>
          <input
            type="text"
            value={form.doctor_name}
            onChange={e => handleDoctorChange(e.target.value)}
            placeholder="Dr. Sharma..."
            className={inputClass + (errors.doctor_name ? ' border-red-400' : '')}
          />
          {errors.doctor_name && <p className="text-red-500 text-xs mt-1">{errors.doctor_name}</p>}
          {suggestions.length > 0 && (
            <div className="mt-1 bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 shadow-lg overflow-hidden">
              {suggestions.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0 transition"
                >
                  <div className="font-medium text-gray-800 dark:text-gray-100">{s.doctor_name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{s.clinic_name} · {s.city}</div>
                </button>
              ))}
            </div>
          )}
        </LabelInput>

        {/* Degree + Specialty */}
        <div className="grid grid-cols-2 gap-3">
          <LabelInput label="Degree">
            <select value={form.doctor_degree} onChange={e => setForm(f => ({ ...f, doctor_degree: e.target.value }))} className={inputClass}>
              {DEGREES.map(d => <option key={d}>{d}</option>)}
            </select>
          </LabelInput>
          <LabelInput label="Specialty">
            <select value={form.doctor_specialty} onChange={e => setForm(f => ({ ...f, doctor_specialty: e.target.value }))} className={inputClass}>
              {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
            </select>
          </LabelInput>
        </div>

        {/* Clinic */}
        <LabelInput label="Clinic / Hospital" required>
          <input
            type="text"
            value={form.clinic_name}
            onChange={e => setForm(f => ({ ...f, clinic_name: e.target.value }))}
            placeholder="City Hospital..."
            className={inputClass + (errors.clinic_name ? ' border-red-400' : '')}
          />
          {errors.clinic_name && <p className="text-red-500 text-xs mt-1">{errors.clinic_name}</p>}
        </LabelInput>

        {/* City */}
        <LabelInput label="City" required>
          <input
            type="text"
            value={form.city}
            onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
            placeholder="Mumbai..."
            className={inputClass + (errors.city ? ' border-red-400' : '')}
          />
          {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
        </LabelInput>

        {/* Products multi-select */}
        <LabelInput label="Products Discussed">
          {products.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">No products loaded — check network connection</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {products.map(p => (
                <label
                  key={p.product_id}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border-2 cursor-pointer transition select-none touch-manipulation
                    ${selectedProducts.includes(p.product_id)
                      ? 'border-green-500 bg-green-50 dark:bg-green-950 dark:border-green-400'
                      : 'border-gray-200 bg-gray-50 dark:bg-gray-700 dark:border-gray-600'}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedProducts.includes(p.product_id)}
                    onChange={() => toggleProduct(p.product_id)}
                    className="w-5 h-5 accent-green-600 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-100 leading-tight">{p.product_name}</span>
                </label>
              ))}
            </div>
          )}
        </LabelInput>

        {/* Samples + Order */}
        <div className="grid grid-cols-2 gap-3">
          <LabelInput label="Samples Given">
            <input
              type="number"
              min="0"
              value={form.samples_given}
              onChange={e => setForm(f => ({ ...f, samples_given: e.target.value }))}
              placeholder="0"
              inputMode="numeric"
              className={inputClass}
            />
          </LabelInput>
          <LabelInput label="Order Value (₹)">
            <input
              type="number"
              min="0"
              value={form.order_value_inr}
              onChange={e => setForm(f => ({ ...f, order_value_inr: e.target.value }))}
              placeholder="0"
              inputMode="decimal"
              className={inputClass}
            />
          </LabelInput>
        </div>

        {/* Notes with voice */}
        <LabelInput label="Notes">
          <div className="relative">
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Any notes about this visit..."
              rows={3}
              className={`${inputClass} resize-none pr-14`}
            />
            {isVoiceSupported() && (
              <button
                type="button"
                onClick={handleVoice}
                className={`absolute right-3 top-3 p-2 rounded-lg transition ${voiceActive ? 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 animate-pulse' : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
                aria-label={voiceActive ? 'Stop recording' : 'Start voice input'}
              >
                🎤
              </button>
            )}
          </div>
          {voiceActive && <p className="text-xs text-red-500 mt-1 animate-pulse">Listening… speak now</p>}
        </LabelInput>

        {/* Photo */}
        <LabelInput label="Clinic Photo (optional)">
          <label className={`flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed cursor-pointer transition
            ${photoBase64 ? 'border-green-400 bg-green-50 dark:bg-green-950' : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>
            <input
              type="file"
              accept="image/*"
              capture="camera"
              className="hidden"
              onChange={handlePhotoCapture}
            />
            {photoBase64 ? (
              <>
                <img src={`data:${photoMime};base64,${photoBase64}`} alt="Clinic" className="h-24 w-full object-cover rounded-lg" />
                <span className="text-sm text-green-600 dark:text-green-400 font-medium">📸 Photo captured — tap to replace</span>
              </>
            ) : (
              <>
                <span className="text-3xl">📸</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">Tap to capture clinic photo</span>
              </>
            )}
          </label>
        </LabelInput>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white font-bold py-4 rounded-2xl text-lg shadow-lg transition touch-manipulation"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Saving…
            </span>
          ) : '✓ Log Visit'}
        </button>
      </form>
    </div>
  );
}
