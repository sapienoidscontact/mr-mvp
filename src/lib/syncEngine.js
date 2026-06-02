import {
  getUnsyncedVisits,
  markSynced,
  incrementAttempt,
  rebuildSyncQueue
} from './db.js';
import { postEvents, uploadPhoto } from './appsScriptClient.js';

const INTERVAL_MS = 30_000;
const BACKOFF_MS = [5000, 15000, 30000, 60000, 120000];
const MAX_ATTEMPTS = 5;

let intervalId = null;
let isSyncing = false;
let backoffLevel = 0;
let backoffTimer = null;

function emit(detail) {
  window.dispatchEvent(new CustomEvent('syncStatusChange', { detail }));
}

async function handlePhotoUpload(visit) {
  if (!visit.photo_base64 || visit.photo_drive_link) return visit;
  try {
    const result = await uploadPhoto(
      visit.visit_id,
      visit.photo_base64,
      visit.photo_mime_type || 'image/jpeg'
    );
    if (result.success && result.drive_link) {
      return { ...visit, photo_drive_link: result.drive_link, photo_base64: undefined };
    }
  } catch (_) {
    // If photo upload fails, sync visit without photo
  }
  return { ...visit, photo_base64: undefined };
}

export async function syncNow() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    // On every run, ensure queue is consistent with visits table
    await rebuildSyncQueue();

    const unsynced = await getUnsyncedVisits();
    if (unsynced.length === 0) {
      emit({ pending: 0, syncing: false, error: null });
      return;
    }

    emit({ pending: unsynced.length, syncing: true, error: null });

    // Filter out visits that have exceeded max attempts
    const eligible = unsynced.filter(v => (v._attempts || 0) < MAX_ATTEMPTS);
    if (eligible.length === 0) {
      emit({ pending: unsynced.length, syncing: false, error: 'Max retry attempts reached for some visits' });
      return;
    }

    // Upload any pending photos first
    const prepared = await Promise.all(eligible.map(handlePhotoUpload));

    // Increment attempt counters
    for (const v of eligible) {
      await incrementAttempt(v.visit_id);
    }

    const result = await postEvents(prepared);

    if (result && result.success && Array.isArray(result.synced_ids)) {
      await markSynced(result.synced_ids);
      backoffLevel = 0;
      const remaining = unsynced.length - result.synced_ids.length;
      emit({ pending: remaining, syncing: false, error: result.errors?.length ? result.errors.join(', ') : null });
    } else {
      throw new Error(result?.error || 'Unexpected response from server');
    }
  } catch (err) {
    const delay = BACKOFF_MS[Math.min(backoffLevel, BACKOFF_MS.length - 1)];
    backoffLevel = Math.min(backoffLevel + 1, BACKOFF_MS.length - 1);

    const unsynced = await getUnsyncedVisits();
    emit({ pending: unsynced.length, syncing: false, error: err.message });

    if (backoffTimer) clearTimeout(backoffTimer);
    backoffTimer = setTimeout(() => {
      if (navigator.onLine) syncNow();
    }, delay);
  } finally {
    isSyncing = false;
  }
}

function onOnline() {
  if (backoffTimer) { clearTimeout(backoffTimer); backoffTimer = null; }
  syncNow();
}

export function start() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    if (navigator.onLine) syncNow();
  }, INTERVAL_MS);
  window.addEventListener('online', onOnline);
  // Trigger an immediate sync on start to catch anything from a previous session
  if (navigator.onLine) setTimeout(syncNow, 1000);
}

export function stop() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  window.removeEventListener('online', onOnline);
  if (backoffTimer) { clearTimeout(backoffTimer); backoffTimer = null; }
}

export async function getPendingCount() {
  const unsynced = await getUnsyncedVisits();
  return unsynced.length;
}
