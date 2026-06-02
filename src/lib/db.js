import Dexie from 'dexie';

const db = new Dexie('MRTrackerDB');

db.version(1).stores({
  visits: '&visit_id, mr_id, timestamp_iso, synced, day_session_id',
  syncQueue: '++id, visit_id, created_at, attempts, last_attempt',
  products: '&product_id, product_name, category',
  doctors: '++id, doctor_name, clinic_name, city',
  session: '&key'
});

db.version(1).upgrade(() => {
  // reserved for future migrations
});

// ─── Visits ────────────────────────────────────────────────────────────────

export async function addVisit(visitData) {
  return db.transaction('rw', db.visits, db.syncQueue, async () => {
    await db.visits.add({ ...visitData, synced: 0 });
    await db.syncQueue.add({
      visit_id: visitData.visit_id,
      created_at: new Date().toISOString(),
      attempts: 0,
      last_attempt: null
    });
  });
}

export async function getUnsyncedVisits() {
  return db.visits.where('synced').equals(0).toArray();
}

export async function markSynced(visitIds) {
  return db.transaction('rw', db.visits, db.syncQueue, async () => {
    for (const id of visitIds) {
      await db.visits.where('visit_id').equals(id).modify({ synced: 1 });
      await db.syncQueue.where('visit_id').equals(id).delete();
    }
  });
}

export async function getVisitsForDateRange(startISO, endISO) {
  return db.visits
    .where('timestamp_iso')
    .between(startISO, endISO, true, true)
    .toArray();
}

export async function getLastVisitWithCoords(mr_id) {
  const visits = await db.visits
    .where('mr_id')
    .equals(mr_id)
    .reverse()
    .toArray();
  return visits.find(v => v.latitude && v.longitude) || null;
}

// ─── Sync queue ────────────────────────────────────────────────────────────

export async function getSyncQueueEntries() {
  return db.syncQueue.toArray();
}

export async function incrementAttempt(visitId) {
  const entry = await db.syncQueue.where('visit_id').equals(visitId).first();
  if (entry) {
    await db.syncQueue.update(entry.id, {
      attempts: entry.attempts + 1,
      last_attempt: new Date().toISOString()
    });
  }
}

export async function rebuildSyncQueue() {
  const unsynced = await db.visits.where('synced').equals(0).toArray();
  const existingIds = new Set(
    (await db.syncQueue.toArray()).map(e => e.visit_id)
  );
  for (const v of unsynced) {
    if (!existingIds.has(v.visit_id)) {
      await db.syncQueue.add({
        visit_id: v.visit_id,
        created_at: new Date().toISOString(),
        attempts: 0,
        last_attempt: null
      });
    }
  }
}

// ─── Products ──────────────────────────────────────────────────────────────

export async function cacheProducts(products) {
  await db.products.bulkPut(products);
}

export async function getProducts() {
  return db.products.orderBy('product_name').toArray();
}

// ─── Doctor autocomplete ───────────────────────────────────────────────────

export async function addDoctorToCache(doctor_name, clinic_name, city) {
  const existing = await db.doctors
    .where('doctor_name')
    .equalsIgnoreCase(doctor_name)
    .first();
  if (!existing) {
    await db.doctors.add({ doctor_name, clinic_name, city });
  }
}

export async function getDoctorSuggestions(query) {
  if (!query || query.length < 2) return [];
  const lower = query.toLowerCase();
  const all = await db.doctors.toArray();
  return all
    .filter(d => d.doctor_name.toLowerCase().includes(lower))
    .slice(0, 8);
}

// ─── Session ───────────────────────────────────────────────────────────────

export async function getSession() {
  const entry = await db.session.get('current');
  return entry ? entry.value : null;
}

export async function setSession(data) {
  await db.session.put({ key: 'current', value: data });
}

export async function clearSession() {
  await db.session.delete('current');
}

export default db;
