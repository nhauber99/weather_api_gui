import { TIMEZONE } from "./config.js";

export const formatTime = (iso) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export const formatTimeUtc = (iso) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export const getLocalHour = (iso) => {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return Number.parseInt(hour, 10);
};

export const formatEvenHourTick = (iso) => {
  const hour = getLocalHour(iso);
  if (!Number.isFinite(hour) || hour % 2 !== 0) {
    return "";
  }
  return String(hour).padStart(2, "0");
};

export const toPercent = (value) => Math.round(value * 100);

export const formatNumber = (value, digits) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : value;
};

export const seriesMax = (...series) => {
  const values = series.flat().filter((value) => Number.isFinite(value));
  if (!values.length) {
    return null;
  }
  return Math.max(...values);
};
