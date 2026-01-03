import { formatTime, formatTimeUtc, formatNumber } from "./format.js";

export const logBandDebug = (timestamps, lat, lon, dayNightBand, moonBand) => {
  if (!timestamps.length) {
    return;
  }

  const rows = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const startIso = timestamps[i];
    const endIso = timestamps[i + 1] || "";
    const dayCross = dayNightBand.crossings[i];
    const moonCross = moonBand.crossings[i];
    const startMs = Date.parse(startIso);
    const endMs = Date.parse(endIso);
    const dayCrossMs =
      Number.isFinite(dayCross) && Number.isFinite(startMs) && Number.isFinite(endMs)
        ? startMs + (endMs - startMs) * dayCross
        : null;
    const moonCrossMs =
      Number.isFinite(moonCross) && Number.isFinite(startMs) && Number.isFinite(endMs)
        ? startMs + (endMs - startMs) * moonCross
        : null;

    rows.push({
      index: i,
      startLocal: formatTime(startIso),
      endLocal: endIso ? formatTime(endIso) : "",
      startUtc: formatTimeUtc(startIso),
      endUtc: endIso ? formatTimeUtc(endIso) : "",
      solarElev: formatNumber(dayNightBand.elevations[i], 2),
      moonElev: formatNumber(moonBand.elevations[i], 2),
      solarCrossFrac: Number.isFinite(dayCross) ? formatNumber(dayCross, 3) : "",
      solarCrossLocal: dayCrossMs
        ? formatTime(new Date(dayCrossMs).toISOString())
        : "",
      solarCrossUtc: dayCrossMs
        ? formatTimeUtc(new Date(dayCrossMs).toISOString())
        : "",
      moonCrossFrac: Number.isFinite(moonCross) ? formatNumber(moonCross, 3) : "",
      moonCrossLocal: moonCrossMs
        ? formatTime(new Date(moonCrossMs).toISOString())
        : "",
      moonCrossUtc: moonCrossMs
        ? formatTimeUtc(new Date(moonCrossMs).toISOString())
        : "",
    });
  }

  console.groupCollapsed(
    `Band debug (lat ${lat.toFixed(4)}, lon ${lon.toFixed(4)})`
  );
  console.table(rows);
  console.groupEnd();
};
