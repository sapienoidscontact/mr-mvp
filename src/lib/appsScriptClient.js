const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';

async function sha256Hex(message) {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getRequest(params) {
  if (!APPS_SCRIPT_URL) throw new Error('VITE_APPS_SCRIPT_URL is not configured');
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal
    });
    const text = await res.text();
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function postRequest(body) {
  if (!APPS_SCRIPT_URL) throw new Error('VITE_APPS_SCRIPT_URL is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    // Content-Type must be text/plain to avoid CORS preflight on Apps Script
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

export async function hashPin(pin) {
  return sha256Hex(pin.toString());
}

export async function validatePin(mr_id, pin) {
  const pin_hash = await sha256Hex(pin.toString());
  return getRequest({ action: 'validatePin', mr_id, pin_hash });
}

export async function fetchProducts() {
  return getRequest({ action: 'getProducts' });
}

export async function postEvents(events) {
  return postRequest({ action: 'syncVisits', events });
}

export async function uploadPhoto(visit_id, base64Data, mimeType) {
  return postRequest({ action: 'uploadPhoto', visit_id, base64Data, mimeType });
}
