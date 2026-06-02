export const GeoError = {
  DENIED: 'GEO_DENIED',
  UNAVAILABLE: 'GEO_UNAVAILABLE',
  TIMEOUT: 'GEO_TIMEOUT',
  UNKNOWN: 'GEO_UNKNOWN'
};

function mapError(err) {
  switch (err.code) {
    case 1: return GeoError.DENIED;
    case 2: return GeoError.UNAVAILABLE;
    case 3: return GeoError.TIMEOUT;
    default: return GeoError.UNKNOWN;
  }
}

function tryGetPosition(options) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: GeoError.UNAVAILABLE, message: 'Geolocation not supported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m: Math.round(pos.coords.accuracy),
        timestamp: new Date().toISOString()
      }),
      err => reject({ code: mapError(err), message: err.message }),
      options
    );
  });
}

export async function getCurrentPosition() {
  const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
  try {
    return await tryGetPosition(options);
  } catch (err) {
    if (err.code === GeoError.TIMEOUT) {
      // retry once with relaxed accuracy
      return tryGetPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 });
    }
    throw err;
  }
}

export function watchPosition(callback, errorCallback) {
  if (!navigator.geolocation) {
    errorCallback({ code: GeoError.UNAVAILABLE, message: 'Geolocation not supported' });
    return null;
  }
  return navigator.geolocation.watchPosition(
    pos => callback({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy_m: Math.round(pos.coords.accuracy),
      timestamp: new Date().toISOString()
    }),
    err => errorCallback({ code: mapError(err), message: err.message }),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
  );
}

export function clearWatch(watchId) {
  if (watchId !== null && watchId !== undefined) {
    navigator.geolocation.clearWatch(watchId);
  }
}
