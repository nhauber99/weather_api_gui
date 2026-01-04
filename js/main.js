import {
  API_BASE,
  ENSEMBLE_DATASET_ID,
  NWP_DATASET_ID,
  DEFAULT_LAT,
  DEFAULT_LON,
} from "./config.js";
import {
  formatNumber,
  formatLocalHourKey,
  seriesMax,
  toPercent,
} from "./format.js";
import { solarElevation, moonElevation } from "./astro.js";
import { buildBandData } from "./bands.js";
import {
  buildParamIndex,
  getParamSet,
  getDeterministicParam,
  extractSeries,
  extractDeterministicSeries,
  buildWindSpeedSeries,
  buildWindSpeedDeterministic,
  fetchForecast,
  fetchForecastDeterministic,
  fetchOpenMeteo,
  fetchMeteosource,
  fetchOpenWeather,
  fetchMeteoblue,
  alignSeries,
  alignSeriesByKey,
  parseMeteosourceHourly,
  parseOpenWeatherHourly,
  parseMeteoblueHourly,
  toHourlyFromAccum,
} from "./data.js";
import { createChartBuilder } from "./charts.js";
import { initCitySearch } from "./search.js";
import { logBandDebug } from "./debug.js";
import { getApiKeys, setApiKeys } from "./keys.js";

const cloudCanvas = document.getElementById("cloudChart");
const precipCanvas = document.getElementById("precipChart");
const tempCanvas = document.getElementById("tempChart");
const windCanvas = document.getElementById("windChart");
const cityForm = document.getElementById("cityForm");
const cityInput = document.getElementById("cityInput");
const cityResults = document.getElementById("cityResults");
const cityStatus = document.getElementById("cityStatus");
const locationLabelEl = document.getElementById("locationLabel");
const coordLabelEl = document.getElementById("coordLabel");
const viewToggle = document.getElementById("viewToggle");
const refreshButton = document.getElementById("refreshButton");
const keysToggle = document.getElementById("keysToggle");
const keysModal = document.getElementById("keysModal");
const keysBackdrop = document.getElementById("keysBackdrop");
const keysClose = document.getElementById("keysClose");
const keysSave = document.getElementById("keysSave");
const keyMeteosource = document.getElementById("keyMeteosource");
const keyOpenWeather = document.getElementById("keyOpenWeather");
const keyMeteoblue = document.getElementById("keyMeteoblue");

let paramSets = null;
let currentLocationName = "Traun";
let currentLat = DEFAULT_LAT;
let currentLon = DEFAULT_LON;
let simpleView = false;
let lastState = null;

const CACHE_KEY = "weatherCacheV2";
const CACHE_TTL_MS = 60 * 60 * 1000;
const logCache = (message, data) => {
  if (data === undefined) {
    console.info(`[cache] ${message}`);
  } else {
    console.info(`[cache] ${message}`, data);
  }
};

const { buildBandChart } = createChartBuilder();

if (viewToggle) {
  viewToggle.addEventListener("change", () => {
    simpleView = viewToggle.checked;
    renderCharts(lastState);
  });
}

const loadKeysForm = () => {
  const keys = getApiKeys();
  if (keyMeteosource) {
    keyMeteosource.value = keys.meteosource || "";
  }
  if (keyOpenWeather) {
    keyOpenWeather.value = keys.openweather || "";
  }
  if (keyMeteoblue) {
    keyMeteoblue.value = keys.meteoblue || "";
  }
};

const openKeysModal = () => {
  if (!keysModal) {
    return;
  }
  loadKeysForm();
  keysModal.hidden = false;
};

const closeKeysModal = () => {
  if (keysModal) {
    keysModal.hidden = true;
  }
};

if (keysToggle) {
  keysToggle.addEventListener("click", openKeysModal);
}

if (keysBackdrop) {
  keysBackdrop.addEventListener("click", closeKeysModal);
}

if (keysClose) {
  keysClose.addEventListener("click", closeKeysModal);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeKeysModal();
  }
});

if (keysSave) {
  keysSave.addEventListener("click", () => {
    setApiKeys({
      meteosource: keyMeteosource?.value || "",
      openweather: keyOpenWeather?.value || "",
      meteoblue: keyMeteoblue?.value || "",
    });
    setCityStatus("API keys saved.");
    closeKeysModal();
    ensureMetadata()
      .then(loadData)
      .catch((error) => {
        console.error(error);
        setCityStatus(error.message || "Unable to refresh data.", true);
      });
  });
}

if (refreshButton) {
  refreshButton.addEventListener("click", () => {
    setCityStatus("Refreshing...");
    ensureMetadata()
      .then(loadData)
      .catch((error) => {
        console.error(error);
        setCityStatus(error.message || "Unable to refresh data.", true);
      });
  });
}

const updateLocationLabels = () => {
  locationLabelEl.textContent = currentLocationName;
  if (coordLabelEl) {
    coordLabelEl.textContent = `${currentLat.toFixed(4)}, ${currentLon.toFixed(4)}`;
  }
};

const onLocationSelect = (location) => {
  currentLocationName = location.label;
  currentLat = location.lat;
  currentLon = location.lon;
  updateLocationLabels();
  const store = readCache();
  const entry = getCacheEntry(store, currentLat, currentLon);
  if (isCacheFresh(entry)) {
    applyCache(entry, { preserveName: true });
    return;
  }
  ensureMetadata().then(loadData).catch((error) => {
    console.error(error);
    setCityStatus(error.message || "Unable to load metadata.", true);
  });
};

const { setCityStatus } = initCitySearch({
  cityForm,
  cityInput,
  cityResults,
  cityStatus,
  onSelect: onLocationSelect,
});

const toPercentNullable = (value) =>
  value === null || value === undefined ? null : toPercent(value);

const toOverlay = (provider, data) => (data ? { provider, data } : null);
const nonNullSeries = (series) => (series || []).filter((value) => value !== null);
const emptySeries = () => ({
  cloud: null,
  precip: null,
  temp: null,
  wind: null,
});
const alignProviderSeries = (timestamps, sourceKeys, source) => {
  if (!source || !sourceKeys?.length) {
    return emptySeries();
  }
  const align = (values) =>
    alignSeriesByKey(timestamps, formatLocalHourKey, sourceKeys, values);
  return {
    cloud: align(source.cloud),
    precip: align(source.precip),
    temp: align(source.temp),
    wind: align(source.wind),
  };
};

const normalizeCoordKey = (lat, lon) => {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return null;
  }
  return `${latNum.toFixed(4)},${lonNum.toFixed(4)}`;
};

const readCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      logCache("No cache entry found.");
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed?.entries) {
      logCache("Cache store loaded.", {
        keys: Object.keys(parsed.entries || {}).length,
        lastKey: parsed.lastKey || null,
      });
      return parsed;
    }

    if (parsed?.timestamp && parsed?.location && parsed?.state) {
      const legacyKey = normalizeCoordKey(parsed.location.lat, parsed.location.lon);
      if (!legacyKey) {
        return null;
      }
      const store = {
        entries: {
          [legacyKey]: parsed,
        },
        lastKey: legacyKey,
      };
      logCache("Legacy cache upgraded.", { legacyKey });
      return store;
    }

    logCache("Cache entry missing fields.", parsed);
    return null;
  } catch (error) {
    console.warn("Failed to read cache", error);
    return null;
  }
};

const isCacheFresh = (entry) => {
  if (!entry) {
    return false;
  }
  const age = Date.now() - entry.timestamp;
  const fresh = age < CACHE_TTL_MS;
  logCache(`Cache age ${Math.round(age / 1000)}s (fresh: ${fresh}).`);
  return fresh;
};

const saveCache = (state) => {
  if (!state) {
    return;
  }
  const coordKey = normalizeCoordKey(currentLat, currentLon);
  if (!coordKey) {
    return;
  }
  const existing = readCache() || { entries: {}, lastKey: coordKey };
  const payload = {
    timestamp: Date.now(),
    location: {
      name: currentLocationName,
      lat: currentLat,
      lon: currentLon,
    },
    state,
  };
  try {
    existing.entries[coordKey] = payload;
    existing.lastKey = coordKey;
    localStorage.setItem(CACHE_KEY, JSON.stringify(existing));
    logCache("Cache saved.", {
      location: payload.location,
      timestamp: payload.timestamp,
      coordKey,
    });
  } catch (error) {
    console.warn("Failed to save cache", error);
  }
};

const applyCache = (entry, options = {}) => {
  if (!entry) {
    return;
  }
  const coordKey = normalizeCoordKey(entry.location.lat, entry.location.lon);
  if (coordKey) {
    try {
      const store = readCache();
      if (store?.entries) {
        store.lastKey = coordKey;
        localStorage.setItem(CACHE_KEY, JSON.stringify(store));
      }
    } catch (error) {
      console.warn("Failed to update last cache key", error);
    }
  }
  if (!options.preserveName) {
    currentLocationName = entry.location.name || currentLocationName;
  }
  currentLat = Number.isFinite(entry.location.lat) ? entry.location.lat : currentLat;
  currentLon = Number.isFinite(entry.location.lon) ? entry.location.lon : currentLon;
  updateLocationLabels();
  lastState = entry.state;
  renderCharts(lastState);
  const ageMinutes = Math.round((Date.now() - entry.timestamp) / 60000);
  setCityStatus(`Loaded cached data (${ageMinutes}m old).`);
  logCache("Applied cached state.", { ageMinutes });
};

const getCacheEntry = (store, lat, lon) => {
  if (!store?.entries) {
    return null;
  }
  const key = normalizeCoordKey(lat, lon);
  if (!key) {
    return null;
  }
  return store.entries[key] || null;
};

const getLatestEntry = (store) => {
  if (!store?.entries) {
    return null;
  }
  return Object.values(store.entries).reduce((latest, entry) => {
    if (!entry?.timestamp) {
      return latest;
    }
    if (!latest || entry.timestamp > latest.timestamp) {
      return entry;
    }
    return latest;
  }, null);
};

const buildSimpleSummary = (seriesList, length) => {
  const min = [];
  const max = [];
  const innerMin = [];
  const innerMax = [];
  const avg = [];

  for (let i = 0; i < length; i += 1) {
    const values = seriesList
      .map((series) => series?.[i])
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);

    if (!values.length) {
      min.push(null);
      max.push(null);
      innerMin.push(null);
      innerMax.push(null);
      avg.push(null);
      continue;
    }

    const first = values[0];
    const last = values[values.length - 1];
    min.push(first);
    max.push(last);

    if (values.length > 2) {
      const trimmed = values.slice(1, -1);
      innerMin.push(trimmed[0]);
      innerMax.push(trimmed[trimmed.length - 1]);
      avg.push(trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length);
    } else {
      innerMin.push(first);
      innerMax.push(last);
      avg.push(values.reduce((sum, value) => sum + value, 0) / values.length);
    }
  }

  return { min, max, innerMin, innerMax, avg };
};

const renderCharts = (state) => {
  if (!state) {
    return;
  }

  const {
    labels,
    dayNightBand,
    moonBand,
    cloudSeries,
    precipSeries,
    tempSeries,
    windSeries,
    providerSeries,
    simpleSeries,
    precipMax,
    windMax,
  } = state;

  const overlaysFor = (key) =>
    Object.entries(providerSeries)
      .map(([provider, series]) => toOverlay(provider, series[key]))
      .filter(Boolean);

  const p10Pct = cloudSeries.p10.map(toPercent);
  const p50Pct = cloudSeries.p50.map(toPercent);
  const p90Pct = cloudSeries.p90.map(toPercent);

  buildBandChart({
    canvas: cloudCanvas,
    chartKey: "cloud",
    labels,
    p10: p10Pct,
    p50: p50Pct,
    p90: p90Pct,
    dayNightBand,
    moonBand,
    yLabel: "Cloud cover",
    yUnit: "%",
    suggestedMin: 0,
    suggestedMax: 100,
    formatValue: (value) => `${formatNumber(value, 0)}%`,
    overlays: overlaysFor("cloud"),
    simpleSeries: simpleSeries.cloud,
    simpleView,
  });

  if (precipSeries?.p50.length) {
    buildBandChart({
      canvas: precipCanvas,
      chartKey: "precip",
      labels,
      p10: precipSeries.p10,
      p50: precipSeries.p50,
      p90: precipSeries.p90,
      dayNightBand,
      moonBand,
      yLabel: "Precipitation",
      yUnit: "mm",
      suggestedMin: 0,
      suggestedMax: precipMax ? Math.max(1, precipMax) : 1,
      formatValue: (value) => formatNumber(value, 2),
      overlays: overlaysFor("precip"),
      simpleSeries: simpleSeries.precip,
      simpleView,
    });
  }

  if (tempSeries?.p50.length) {
    buildBandChart({
      canvas: tempCanvas,
      chartKey: "temp",
      labels,
      p10: tempSeries.p10,
      p50: tempSeries.p50,
      p90: tempSeries.p90,
      dayNightBand,
      moonBand,
      yLabel: "Temperature",
      yUnit: "deg C",
      formatValue: (value) => formatNumber(value, 1),
      overlays: overlaysFor("temp"),
      simpleSeries: simpleSeries.temp,
      simpleView,
    });
  }

  if (windSeries?.p50.length) {
    buildBandChart({
      canvas: windCanvas,
      chartKey: "wind",
      labels,
      p10: windSeries.p10,
      p50: windSeries.p50,
      p90: windSeries.p90,
      dayNightBand,
      moonBand,
      yLabel: "Wind speed",
      yUnit: "m/s",
      suggestedMin: 0,
      suggestedMax: windMax ? Math.max(5, windMax) : 5,
      formatValue: (value) => formatNumber(value, 1),
      overlays: overlaysFor("wind"),
      simpleSeries: simpleSeries.wind,
      simpleView,
    });
  }
};

const loadMetadata = async () => {
  const metaResults = await Promise.allSettled([
    fetch(`${API_BASE}/timeseries/forecast/${ENSEMBLE_DATASET_ID}/metadata`, {
      cache: "no-store",
    }),
    fetch(`${API_BASE}/timeseries/forecast/${NWP_DATASET_ID}/metadata`, {
      cache: "no-store",
    }),
  ]);

  const ensembleMetaResponse =
    metaResults[0].status === "fulfilled" ? metaResults[0].value : null;
  const nwpMetaResponse =
    metaResults[1].status === "fulfilled" ? metaResults[1].value : null;

  if (!ensembleMetaResponse || !ensembleMetaResponse.ok) {
    throw new Error(
      `Ensemble metadata request failed (${ensembleMetaResponse?.status ?? "N/A"}).`
    );
  }

  const ensembleMeta = await ensembleMetaResponse.json();
  const nwpMeta =
    nwpMetaResponse && nwpMetaResponse.ok ? await nwpMetaResponse.json() : null;
  const ensembleIndex = buildParamIndex(ensembleMeta);
  const nwpIndex = nwpMeta ? buildParamIndex(nwpMeta) : null;

  const ensemble = {
    cloud: getParamSet(ensembleIndex, "tcc"),
    precip: getParamSet(ensembleIndex, "rr") || getParamSet(ensembleIndex, "rain"),
    temp: getParamSet(ensembleIndex, "t2m"),
    windU: getParamSet(ensembleIndex, "u10m"),
    windV: getParamSet(ensembleIndex, "v10m"),
  };

  const nwp = nwpIndex
    ? {
        cloud: getDeterministicParam(nwpIndex, "tcc"),
        precip: getDeterministicParam(nwpIndex, "rr_acc"),
        temp: getDeterministicParam(nwpIndex, "t2m"),
        windU: getDeterministicParam(nwpIndex, "u10m"),
        windV: getDeterministicParam(nwpIndex, "v10m"),
      }
    : null;

  const missing = [];
  if (!ensemble.cloud) missing.push("ensemble tcc");
  if (!ensemble.precip) missing.push("ensemble rr/rain");
  if (!ensemble.temp) missing.push("ensemble t2m");
  if (!ensemble.windU) missing.push("ensemble u10m");
  if (!ensemble.windV) missing.push("ensemble v10m");
  if (nwp) {
    if (!nwp.cloud) missing.push("nwp tcc");
    if (!nwp.precip) missing.push("nwp rr_acc");
    if (!nwp.temp) missing.push("nwp t2m");
    if (!nwp.windU) missing.push("nwp u10m");
    if (!nwp.windV) missing.push("nwp v10m");
  }

  if (missing.length) {
    throw new Error(`Missing parameters in metadata: ${missing.join(", ")}.`);
  }

  paramSets = { ensemble, nwp };
  if (!nwp) {
    setCityStatus("Metadata loaded (NWP unavailable).");
  } else {
    setCityStatus("Metadata loaded.");
  }
};

const ensureMetadata = async () => {
  if (paramSets) {
    return;
  }
  await loadMetadata();
};

const loadData = async () => {
  setCityStatus("Fetching forecast...");
  updateLocationLabels();

  try {
    const tasks = [
      {
        name: "Ensemble",
        promise: fetchForecast(
          currentLat,
          currentLon,
          ENSEMBLE_DATASET_ID,
          paramSets.ensemble
        ),
        required: true,
      },
      {
        name: "NWP",
        promise: paramSets.nwp
          ? fetchForecastDeterministic(
              currentLat,
              currentLon,
              NWP_DATASET_ID,
              paramSets.nwp
            )
          : Promise.resolve(null),
        required: false,
      },
      {
        name: "Open-Meteo",
        promise: fetchOpenMeteo(currentLat, currentLon),
        required: false,
      },
      {
        name: "Meteosource",
        promise: fetchMeteosource(currentLat, currentLon),
        required: false,
      },
      {
        name: "OpenWeather",
        promise: fetchOpenWeather(currentLat, currentLon),
        required: false,
      },
      {
        name: "Meteoblue",
        promise: fetchMeteoblue(currentLat, currentLon),
        required: false,
      },
    ];

    const results = await Promise.allSettled(tasks.map((task) => task.promise));
    const failures = [];
    const getResult = (index) => {
      const result = results[index];
      if (result.status === "fulfilled") {
        return result.value;
      }
      failures.push(tasks[index].name);
      if (tasks[index].required) {
        throw result.reason;
      }
      console.warn(`${tasks[index].name} request failed`, result.reason);
      return null;
    };

    const ensembleData = getResult(0);
    const nwpData = getResult(1);
    const openMeteoData = getResult(2);
    const meteosourceData = getResult(3);
    const openWeatherData = getResult(4);
    const meteoblueData = getResult(5);

    const ensembleFeature = ensembleData.features?.[0];
    const ensembleParams = ensembleFeature?.properties?.parameters || {};
    const timestamps = ensembleData.timestamps || [];

    if (!timestamps.length) {
      throw new Error("No data available for this point.");
    }

    const nwpFeature = nwpData?.features?.[0];
    const nwpParams = nwpFeature?.properties?.parameters || {};
    const nwpTimestamps = nwpData?.timestamps || [];

    const openMeteoHourly = openMeteoData?.hourly || null;
    const openMeteoTimes = openMeteoHourly?.time || [];
    const openMeteoCloud = openMeteoHourly?.cloud_cover || [];
    const openMeteoTemp = openMeteoHourly?.temperature_2m || [];
    const openMeteoPrecip = openMeteoHourly?.precipitation || [];
    const openMeteoWind = openMeteoHourly?.wind_speed_10m || [];

    const meteosourceHourly = meteosourceData
      ? parseMeteosourceHourly(meteosourceData)
      : null;
    const meteosourceTimes = meteosourceHourly?.times || [];
    const meteosourceHourKeys = meteosourceTimes.map((time) =>
      time ? `${time.slice(0, 13)}:00` : ""
    );

    const openWeatherHourly = openWeatherData
      ? parseOpenWeatherHourly(openWeatherData)
      : null;
    const openWeatherHourKeys = openWeatherHourly
      ? openWeatherHourly.times.map((epoch) =>
          epoch ? formatLocalHourKey(new Date(epoch * 1000).toISOString()) : ""
        )
      : [];

    const meteoblueHourly = meteoblueData
      ? parseMeteoblueHourly(meteoblueData)
      : null;
    const meteoblueHourKeys = meteoblueHourly?.hourKeys || [];

    const labels = timestamps;
    const dayNightBand = buildBandData(
      timestamps,
      currentLat,
      currentLon,
      solarElevation,
      -0.833
    );
    const moonBand = buildBandData(
      timestamps,
      currentLat,
      currentLon,
      moonElevation,
      0.133
    );
    logBandDebug(timestamps, currentLat, currentLon, dayNightBand, moonBand);

    const cloudSeries = extractSeries(ensembleParams, paramSets.ensemble.cloud);
    const precipSeries = extractSeries(ensembleParams, paramSets.ensemble.precip);
    const tempSeries = extractSeries(ensembleParams, paramSets.ensemble.temp);
    const windUSeries = extractSeries(ensembleParams, paramSets.ensemble.windU);
    const windVSeries = extractSeries(ensembleParams, paramSets.ensemble.windV);
    const windSeries = buildWindSpeedSeries(windUSeries, windVSeries);

    if (!cloudSeries?.p50.length) {
      throw new Error("Cloud cover data missing for this point.");
    }

    const nwpCloud = nwpData
      ? extractDeterministicSeries(nwpParams, paramSets.nwp.cloud)
      : null;
    const nwpTemp = nwpData
      ? extractDeterministicSeries(nwpParams, paramSets.nwp.temp)
      : null;
    const nwpPrecipAcc = nwpData
      ? extractDeterministicSeries(nwpParams, paramSets.nwp.precip)
      : null;
    const nwpPrecip = nwpPrecipAcc ? toHourlyFromAccum(nwpPrecipAcc) : null;
    const nwpWindU = nwpData
      ? extractDeterministicSeries(nwpParams, paramSets.nwp.windU)
      : null;
    const nwpWindV = nwpData
      ? extractDeterministicSeries(nwpParams, paramSets.nwp.windV)
      : null;
    const nwpWind =
      nwpWindU && nwpWindV
        ? buildWindSpeedDeterministic(nwpWindU, nwpWindV)
        : null;

    const nwpCloudAligned = nwpCloud
      ? alignSeries(timestamps, nwpTimestamps, nwpCloud).map(toPercentNullable)
      : null;
    const nwpTempAligned = nwpTemp
      ? alignSeries(timestamps, nwpTimestamps, nwpTemp)
      : null;
    const nwpPrecipAligned = nwpPrecip
      ? alignSeries(timestamps, nwpTimestamps, nwpPrecip)
      : null;
    const nwpWindAligned = nwpWind
      ? alignSeries(timestamps, nwpTimestamps, nwpWind)
      : null;

    const nwpSeries = {
      cloud: nwpCloudAligned,
      precip: nwpPrecipAligned,
      temp: nwpTempAligned,
      wind: nwpWindAligned,
    };

    const openMeteoSeries = openMeteoHourly
      ? alignProviderSeries(timestamps, openMeteoTimes, {
          cloud: openMeteoCloud,
          precip: openMeteoPrecip,
          temp: openMeteoTemp,
          wind: openMeteoWind,
        })
      : emptySeries();
    const meteosourceSeries = meteosourceHourly
      ? alignProviderSeries(timestamps, meteosourceHourKeys, meteosourceHourly)
      : emptySeries();
    const openWeatherSeries = openWeatherHourly
      ? alignProviderSeries(timestamps, openWeatherHourKeys, openWeatherHourly)
      : emptySeries();
    const meteoblueSeries = meteoblueHourly
      ? alignProviderSeries(timestamps, meteoblueHourKeys, meteoblueHourly)
      : emptySeries();

    const providerSeries = {
      nwp: nwpSeries,
      "open-meteo": openMeteoSeries,
      meteosource: meteosourceSeries,
      openweather: openWeatherSeries,
      meteoblue: meteoblueSeries,
    };

    const overlayValues = (key) =>
      Object.values(providerSeries)
        .map((series) => series[key])
        .filter((series) => Array.isArray(series));

    const p10Pct = cloudSeries.p10.map(toPercent);
    const p50Pct = cloudSeries.p50.map(toPercent);
    const p90Pct = cloudSeries.p90.map(toPercent);

    const simpleSeries = {
      cloud: buildSimpleSummary(
        [p10Pct, p50Pct, p90Pct, ...overlayValues("cloud")],
        labels.length
      ),
      precip: buildSimpleSummary(
        [
          precipSeries.p10,
          precipSeries.p50,
          precipSeries.p90,
          ...overlayValues("precip"),
        ],
        labels.length
      ),
      temp: buildSimpleSummary(
        [tempSeries.p10, tempSeries.p50, tempSeries.p90, ...overlayValues("temp")],
        labels.length
      ),
      wind: buildSimpleSummary(
        [windSeries.p10, windSeries.p50, windSeries.p90, ...overlayValues("wind")],
        labels.length
      ),
    };

    const precipMax = seriesMax(
      precipSeries.p10,
      precipSeries.p50,
      precipSeries.p90,
      ...overlayValues("precip").map(nonNullSeries)
    );
    const windMax = seriesMax(
      windSeries.p10,
      windSeries.p50,
      windSeries.p90,
      ...overlayValues("wind").map(nonNullSeries)
    );

    lastState = {
      labels,
      dayNightBand,
      moonBand,
      cloudSeries,
      precipSeries,
      tempSeries,
      windSeries,
      providerSeries,
      simpleSeries,
      precipMax,
      windMax,
    };

    renderCharts(lastState);
    saveCache(lastState);

    if (failures.length) {
      setCityStatus(`Updated (missing: ${failures.join(", ")}).`);
    } else {
      setCityStatus("Updated just now.");
    }
  } catch (error) {
    console.error(error);
    setCityStatus(error.message || "Unable to load forecast.", true);
  }
};

const init = async () => {
  try {
    updateLocationLabels();
    loadKeysForm();
    const store = readCache();
    const lastEntry = store?.lastKey ? store.entries?.[store.lastKey] : null;
    const latestEntry = lastEntry || getLatestEntry(store);
    if (isCacheFresh(latestEntry)) {
      applyCache(latestEntry);
      return;
    }

    await loadMetadata();
    await loadData();
  } catch (error) {
    console.error(error);
    setCityStatus(error.message || "Unable to initialize.", true);
  }
};

init();
