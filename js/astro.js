import { MOON_TIME_OFFSET_MIN } from "./config.js";

const degToRad = (deg) => (deg * Math.PI) / 180;
const radToDeg = (rad) => (rad * 180) / Math.PI;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const EARTH_RADIUS_KM = 6378.14;

const normalizeDegrees = (deg) => ((deg % 360) + 360) % 360;

export const solarElevation = (date, lat, lon) => {
  const jd = date.getTime() / DAY_MS + 2440587.5;
  const t = (jd - 2451545.0) / 36525;

  const l0 = normalizeDegrees(
    280.46646 + t * (36000.76983 + t * 0.0003032)
  );
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const mRad = degToRad(m);
  const c =
    Math.sin(mRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * mRad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * mRad) * 0.000289;

  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda =
    trueLong - 0.00569 - 0.00478 * Math.sin(degToRad(omega));
  const epsilon0 =
    23 +
    (26 +
      (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) /
      60;
  const epsilon = epsilon0 + 0.00256 * Math.cos(degToRad(omega));
  const decl = Math.asin(
    Math.sin(degToRad(epsilon)) * Math.sin(degToRad(lambda))
  );

  const y = Math.tan(degToRad(epsilon) / 2);
  const y2 = y * y;
  const eqTime =
    4 *
    radToDeg(
      y2 * Math.sin(2 * degToRad(l0)) -
        2 * e * Math.sin(mRad) +
        4 * e * y2 * Math.sin(mRad) * Math.cos(2 * degToRad(l0)) -
        0.5 * y2 * y2 * Math.sin(4 * degToRad(l0)) -
        1.25 * e * e * Math.sin(2 * mRad)
    );

  const utcMinutes =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const timeOffset = eqTime + 4 * lon;
  let trueSolarTime = (utcMinutes + timeOffset) % 1440;
  if (trueSolarTime < 0) {
    trueSolarTime += 1440;
  }

  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) {
    hourAngle += 360;
  }

  const haRad = degToRad(hourAngle);
  const latRad = degToRad(lat);
  const cosZenith =
    Math.sin(latRad) * Math.sin(decl) +
    Math.cos(latRad) * Math.cos(decl) * Math.cos(haRad);
  const zenith = Math.acos(Math.min(Math.max(cosZenith, -1), 1));
  return 90 - radToDeg(zenith);
};

const toJulian = (date) => date.getTime() / DAY_MS - 0.5 + J1970;
const toDays = (date) => toJulian(date) - J2000;
const eclipticObliquity = degToRad(23.4397);

const rightAscension = (l, b) =>
  Math.atan2(
    Math.sin(l) * Math.cos(eclipticObliquity) -
      Math.tan(b) * Math.sin(eclipticObliquity),
    Math.cos(l)
  );

const declination = (l, b) =>
  Math.asin(
    Math.sin(b) * Math.cos(eclipticObliquity) +
      Math.cos(b) * Math.sin(eclipticObliquity) * Math.sin(l)
  );

const siderealTime = (d, lw) =>
  degToRad(280.16 + 360.9856235 * d) - lw;

const astroRefraction = (h) => {
  if (h < 0) {
    h = 0;
  }
  return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
};

const moonCoords = (d) => {
  const L = degToRad(218.316 + 13.176396 * d);
  const M = degToRad(134.963 + 13.064993 * d);
  const F = degToRad(93.272 + 13.229350 * d);

  const l = L + degToRad(6.289) * Math.sin(M);
  const b = degToRad(5.128) * Math.sin(F);
  const dist = 385001 - 20905 * Math.cos(M);

  return {
    ra: rightAscension(l, b),
    dec: declination(l, b),
    dist,
  };
};

export const moonElevation = (date, lat, lon) => {
  const adjusted = new Date(
    date.getTime() + MOON_TIME_OFFSET_MIN * 60 * 1000
  );
  const d = toDays(adjusted);
  const coords = moonCoords(d);
  const lw = degToRad(-lon);
  const phi = degToRad(lat);
  const H = siderealTime(d, lw) - coords.ra;

  let h = Math.asin(
    Math.sin(phi) * Math.sin(coords.dec) +
      Math.cos(phi) * Math.cos(coords.dec) * Math.cos(H)
  );

  // Parallax correction for topocentric altitude.
  const parallax = Math.asin(EARTH_RADIUS_KM / coords.dist);
  h = h - parallax * Math.cos(h);

  h += astroRefraction(h);
  return radToDeg(h);
};
