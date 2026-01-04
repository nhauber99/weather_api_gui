import {
  API_BASE,
  OPEN_METEO_BASE,
  METEOSOURCE_BASE,
  OPENWEATHER_BASE,
  METEOBLUE_BASE,
  TIMEZONE,
} from "./config.js";
import { getApiKey } from "./keys.js";

export const buildParamIndex = (metadata) => {
  if (!metadata?.parameters?.length) {
    return null;
  }

  const map = new Map();
  metadata.parameters.forEach((param) => {
    map.set(param.name, param);
  });
  return map;
};

export const getParamSet = (paramIndex, base) => {
  if (!paramIndex) {
    return null;
  }

  const p10 = `${base}_p10`;
  const p50 = `${base}_p50`;
  const p90 = `${base}_p90`;
  if (!paramIndex.has(p10) || !paramIndex.has(p50) || !paramIndex.has(p90)) {
    return null;
  }

  const unit = paramIndex.get(p50)?.unit || paramIndex.get(p10)?.unit || "";
  return { p10, p50, p90, unit };
};

export const getDeterministicParam = (paramIndex, name) => {
  if (!paramIndex || !paramIndex.has(name)) {
    return null;
  }
  const unit = paramIndex.get(name)?.unit || "";
  return { name, unit };
};

export const extractSeries = (params, set) => {
  if (!set) {
    return null;
  }

  return {
    p10: params[set.p10]?.data || [],
    p50: params[set.p50]?.data || [],
    p90: params[set.p90]?.data || [],
  };
};

export const extractDeterministicSeries = (params, set) => {
  if (!set) {
    return null;
  }
  return params[set.name]?.data || [];
};

export const buildWindSpeedSeries = (uSeries, vSeries) => {
  if (!uSeries || !vSeries) {
    return null;
  }

  const length = Math.min(
    uSeries.p50.length,
    vSeries.p50.length,
    uSeries.p10.length,
    vSeries.p10.length,
    uSeries.p90.length,
    vSeries.p90.length
  );

  const speed = {
    p10: [],
    p50: [],
    p90: [],
  };

  for (let i = 0; i < length; i += 1) {
    const u10 = uSeries.p10[i];
    const v10 = vSeries.p10[i];
    const u50 = uSeries.p50[i];
    const v50 = vSeries.p50[i];
    const u90 = uSeries.p90[i];
    const v90 = vSeries.p90[i];
    const s10 = Math.sqrt(u10 * u10 + v10 * v10);
    const s50 = Math.sqrt(u50 * u50 + v50 * v50);
    const s90 = Math.sqrt(u90 * u90 + v90 * v90);
    // Keep percentile bands ordered when derived from component percentiles.
    const ordered = [s10, s50, s90].sort((a, b) => a - b);
    speed.p10.push(ordered[0]);
    speed.p50.push(ordered[1]);
    speed.p90.push(ordered[2]);
  }

  return speed;
};

export const buildWindSpeedDeterministic = (uSeries, vSeries) => {
  if (!uSeries || !vSeries) {
    return null;
  }

  const length = Math.min(uSeries.length, vSeries.length);
  const speed = [];
  for (let i = 0; i < length; i += 1) {
    const u = uSeries[i];
    const v = vSeries[i];
    speed.push(Math.sqrt(u * u + v * v));
  }
  return speed;
};

export const fetchForecast = async (lat, lon, datasetId, paramSets) => {
  if (!paramSets) {
    throw new Error("Missing parameter sets.");
  }

  const parameterNames = new Set([
    paramSets.cloud.p10,
    paramSets.cloud.p50,
    paramSets.cloud.p90,
    paramSets.precip.p10,
    paramSets.precip.p50,
    paramSets.precip.p90,
    paramSets.temp.p10,
    paramSets.temp.p50,
    paramSets.temp.p90,
    paramSets.windU.p10,
    paramSets.windU.p50,
    paramSets.windU.p90,
    paramSets.windV.p10,
    paramSets.windV.p50,
    paramSets.windV.p90,
  ]);

  const query = new URLSearchParams({
    lat_lon: `${lat},${lon}`,
    parameters: Array.from(parameterNames).join(","),
  });

  const response = await fetch(
    `${API_BASE}/timeseries/forecast/${datasetId}?${query.toString()}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Forecast request failed (${response.status}).`);
  }

  return response.json();
};

export const fetchForecastDeterministic = async (lat, lon, datasetId, params) => {
  if (!params) {
    throw new Error("Missing deterministic params.");
  }

  const parameterNames = new Set([
    params.cloud.name,
    params.precip.name,
    params.temp.name,
    params.windU.name,
    params.windV.name,
  ]);

  const query = new URLSearchParams({
    lat_lon: `${lat},${lon}`,
    parameters: Array.from(parameterNames).join(","),
  });

  const response = await fetch(
    `${API_BASE}/timeseries/forecast/${datasetId}?${query.toString()}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Forecast request failed (${response.status}).`);
  }

  return response.json();
};

export const fetchOpenMeteo = async (lat, lon) => {
  const query = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: "temperature_2m,precipitation,wind_speed_10m,cloud_cover",
    forecast_days: "3",
    wind_speed_unit: "ms",
    timezone: TIMEZONE,
  });

  const response = await fetch(`${OPEN_METEO_BASE}?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed (${response.status}).`);
  }
  return response.json();
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const fetchMeteosource = async (lat, lon) => {
  const key = getApiKey("meteosource");
  if (!key) {
    return null;
  }

  const query = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    sections: "hourly",
    timezone: TIMEZONE,
    language: "en",
    units: "metric",
    key,
  });

  const response = await fetch(`${METEOSOURCE_BASE}?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Meteosource request failed (${response.status}).`);
  }
  return response.json();
};

export const parseMeteosourceHourly = (meteosourceData) => {
  const hourly = meteosourceData?.hourly?.data || [];
  const times = [];
  const temp = [];
  const precip = [];
  const wind = [];
  const cloud = [];

  hourly.forEach((entry) => {
    times.push(entry?.date || "");
    temp.push(toNumber(entry?.temperature));
    precip.push(toNumber(entry?.precipitation?.total));
    wind.push(toNumber(entry?.wind?.speed));
    cloud.push(toNumber(entry?.cloud_cover?.total));
  });

  return { times, temp, precip, wind, cloud };
};

export const fetchOpenWeather = async (lat, lon) => {
  const key = getApiKey("openweather");
  if (!key) {
    return null;
  }

  const query = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    units: "metric",
    appid: key,
  });

  const response = await fetch(`${OPENWEATHER_BASE}?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`OpenWeather request failed (${response.status}).`);
  }
  return response.json();
};

export const parseOpenWeatherHourly = (openWeatherData) => {
  const hourly = openWeatherData?.list || [];
  const baseTimes = [];
  const baseTemp = [];
  const basePrecip = [];
  const baseWind = [];
  const baseCloud = [];

  hourly.forEach((entry) => {
    const epoch = Number(entry?.dt);
    if (!Number.isFinite(epoch)) {
      return;
    }
    baseTimes.push(epoch);
    baseTemp.push(toNumber(entry?.main?.temp));
    baseWind.push(toNumber(entry?.wind?.speed));
    baseCloud.push(toNumber(entry?.clouds?.all));

    const rain = toNumber(entry?.rain?.["3h"]);
    const snow = toNumber(entry?.snow?.["3h"]);
    if (rain === null && snow === null) {
      basePrecip.push(null);
    } else {
      basePrecip.push((rain ?? 0) + (snow ?? 0));
    }
  });

  if (baseTimes.length < 2) {
    return {
      times: baseTimes,
      temp: baseTemp,
      precip: basePrecip,
      wind: baseWind,
      cloud: baseCloud,
    };
  }

  const buildHourlyTimes = (start, end) => {
    const times = [];
    for (let t = start; t <= end; t += 3600) {
      times.push(t);
    }
    return times;
  };

  const interpolateSeries = (times, values, hourlyTimes) => {
    const results = [];
    let index = 0;
    const lastIndex = times.length - 1;

    hourlyTimes.forEach((t) => {
      if (t < times[0] || t > times[lastIndex]) {
        results.push(null);
        return;
      }

      while (index < lastIndex && times[index + 1] < t) {
        index += 1;
      }

      const t0 = times[index];
      const v0 = values[index];
      if (t === t0 || index === lastIndex) {
        results.push(v0 ?? null);
        return;
      }

      const t1 = times[index + 1];
      const v1 = values[index + 1];
      if (!Number.isFinite(v0) || !Number.isFinite(v1)) {
        results.push(null);
        return;
      }

      const fraction = (t - t0) / (t1 - t0);
      results.push(v0 + (v1 - v0) * fraction);
    });

    return results;
  };

  const buildRates = (times, totals) =>
    totals.map((value, idx) => {
      if (!Number.isFinite(value)) {
        return null;
      }
      let stepHours = 3;
      if (idx < times.length - 1) {
        stepHours = Math.max(
          1,
          Math.round((times[idx + 1] - times[idx]) / 3600)
        );
      } else if (idx > 0) {
        stepHours = Math.max(
          1,
          Math.round((times[idx] - times[idx - 1]) / 3600)
        );
      }
      return value / stepHours;
    });

  const hourlyTimes = buildHourlyTimes(
    baseTimes[0],
    baseTimes[baseTimes.length - 1]
  );
  const hourlyTemp = interpolateSeries(baseTimes, baseTemp, hourlyTimes);
  const hourlyWind = interpolateSeries(baseTimes, baseWind, hourlyTimes);
  const hourlyCloud = interpolateSeries(baseTimes, baseCloud, hourlyTimes);
  const hourlyPrecip = interpolateSeries(
    baseTimes,
    buildRates(baseTimes, basePrecip),
    hourlyTimes
  );

  return {
    times: hourlyTimes,
    temp: hourlyTemp,
    precip: hourlyPrecip,
    wind: hourlyWind,
    cloud: hourlyCloud,
  };
};

const toMeteoblueHourKey = (timeValue) => {
  if (!timeValue) {
    return "";
  }
  if (timeValue.includes("T")) {
    return `${timeValue.slice(0, 13)}:00`;
  }
  const [date, time] = timeValue.split(" ");
  if (!date || !time) {
    return "";
  }
  const hour = time.slice(0, 2);
  return `${date}T${hour}:00`;
};

export const fetchMeteoblue = async (lat, lon) => {
  const key = getApiKey("meteoblue");
  if (!key) {
    return null;
  }

  const query = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    apikey: key,
    tz: TIMEZONE,
    temperature: "C",
    windspeed: "ms-1",
    precipitationamount: "mm",
  });

  const response = await fetch(
    `${METEOBLUE_BASE}/basic-1h_clouds-1h?${query.toString()}`
  );
  if (!response.ok) {
    throw new Error(`Meteoblue request failed (${response.status}).`);
  }
  return response.json();
};

export const parseMeteoblueHourly = (meteoblueData) => {
  const payload = meteoblueData?.data_1h || meteoblueData || {};
  const times = payload.time || [];
  const hourKeys = times.map(toMeteoblueHourKey);
  const temp = (payload.temperature || []).map(toNumber);
  const precip = (payload.precipitation || []).map(toNumber);
  const wind = (payload.windspeed || []).map(toNumber);
  const cloud = (
    payload.totalcloudcover ||
    payload.cloudcover ||
    payload.clouds ||
    []
  ).map(toNumber);

  return {
    times,
    hourKeys,
    temp,
    precip,
    wind,
    cloud,
  };
};

export const alignSeries = (targetTimestamps, sourceTimestamps, sourceValues) => {
  const map = new Map();
  sourceTimestamps.forEach((ts, idx) => {
    map.set(ts, sourceValues[idx]);
  });
  return targetTimestamps.map((ts) => (map.has(ts) ? map.get(ts) : null));
};

export const alignSeriesByKey = (
  targetTimestamps,
  targetKeyFn,
  sourceKeys,
  sourceValues
) => {
  const map = new Map();
  sourceKeys.forEach((key, idx) => {
    map.set(key, sourceValues[idx]);
  });
  return targetTimestamps.map((ts) => {
    const key = targetKeyFn(ts);
    return map.has(key) ? map.get(key) : null;
  });
};

export const toHourlyFromAccum = (accSeries) => {
  if (!accSeries?.length) {
    return [];
  }
  const hourly = [accSeries[0] ?? 0];
  for (let i = 1; i < accSeries.length; i += 1) {
    const prev = accSeries[i - 1];
    const curr = accSeries[i];
    const diff = curr - prev;
    hourly.push(diff < 0 ? 0 : diff);
  }
  return hourly;
};

