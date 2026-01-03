export const refineCrossing = (startMs, endMs, lat, lon, elevationFn) => {
  let lo = startMs;
  let hi = endMs;
  let elevLo = elevationFn(new Date(lo), lat, lon);
  let elevHi = elevationFn(new Date(hi), lat, lon);

  if (!Number.isFinite(elevLo) || !Number.isFinite(elevHi)) {
    return (startMs + endMs) / 2;
  }

  if (elevLo === 0) {
    return lo;
  }

  if (elevHi === 0) {
    return hi;
  }

  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    const elevMid = elevationFn(new Date(mid), lat, lon);
    if (!Number.isFinite(elevMid)) {
      break;
    }
    if (Math.sign(elevLo) === Math.sign(elevMid)) {
      lo = mid;
      elevLo = elevMid;
    } else {
      hi = mid;
      elevHi = elevMid;
    }
  }

  return (lo + hi) / 2;
};

export const buildBandData = (timestamps, lat, lon, elevationFn, horizonDeg = 0) => {
  const elevationAt = (date) => elevationFn(date, lat, lon) - horizonDeg;
  const elevations = timestamps.map((iso) => elevationAt(new Date(iso)));
  const crossings = [];

  for (let i = 0; i < elevations.length - 1; i += 1) {
    const elevA = elevations[i];
    const elevB = elevations[i + 1];
    if (!Number.isFinite(elevA) || !Number.isFinite(elevB)) {
      crossings[i] = null;
      continue;
    }

    if (elevA === 0) {
      crossings[i] = 0;
      continue;
    }

    if (elevB === 0) {
      crossings[i] = 1;
      continue;
    }

    if (Math.sign(elevA) !== Math.sign(elevB)) {
      const startMs = Date.parse(timestamps[i]);
      const endMs = Date.parse(timestamps[i + 1]);
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
        const crossMs = refineCrossing(startMs, endMs, lat, lon, (d) =>
          elevationAt(d)
        );
        crossings[i] = (crossMs - startMs) / (endMs - startMs);
      } else {
        crossings[i] = null;
      }
    } else {
      crossings[i] = null;
    }
  }

  return { elevations, crossings };
};
