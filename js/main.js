import {
  API_BASE,
  ENSEMBLE_DATASET_ID,
  NWP_DATASET_ID,
  DEFAULT_LAT,
  DEFAULT_LON,
} from "./config.js";
import {
  formatTime,
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
  alignSeries,
  alignSeriesByKey,
  toHourlyFromAccum,
} from "./data.js";
import { createChartBuilder } from "./charts.js";
import { initCitySearch } from "./search.js";
import { logBandDebug } from "./debug.js";

const cloudCanvas = document.getElementById("cloudChart");
const precipCanvas = document.getElementById("precipChart");
const tempCanvas = document.getElementById("tempChart");
const windCanvas = document.getElementById("windChart");
const cityForm = document.getElementById("cityForm");
const cityInput = document.getElementById("cityInput");
const cityResults = document.getElementById("cityResults");
const cityStatus = document.getElementById("cityStatus");
const refTimeEl = document.getElementById("refTime");
const locationLabelEl = document.getElementById("locationLabel");
const coordLabelEl = document.getElementById("coordLabel");

const NWP_OVERLAY = {
  label: "NWP",
  color: "#f08a4b",
  dash: [6, 4],
};

const OPEN_METEO_OVERLAY = {
  label: "Open-Meteo",
  color: "#6aa6ff",
  dash: [3, 4],
};

let paramSets = null;
let currentLocationName = "Traun";
let currentLat = DEFAULT_LAT;
let currentLon = DEFAULT_LON;

const { buildBandChart } = createChartBuilder();

const updateLocationLabels = () => {
  locationLabelEl.textContent = currentLocationName;
  if (coordLabelEl) {
    coordLabelEl.textContent = `${currentLat.toFixed(6)}, ${currentLon.toFixed(6)}`;
  }
};

const onLocationSelect = (location) => {
  currentLocationName = location.label;
  currentLat = location.lat;
  currentLon = location.lon;
  updateLocationLabels();
  loadData();
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

const loadData = async () => {
  setCityStatus("Fetching forecast...");
  updateLocationLabels();

  try {
    const [ensembleData, nwpData, openMeteoData] = await Promise.all([
      fetchForecast(currentLat, currentLon, ENSEMBLE_DATASET_ID, paramSets.ensemble),
      fetchForecastDeterministic(
        currentLat,
        currentLon,
        NWP_DATASET_ID,
        paramSets.nwp
      ),
      fetchOpenMeteo(currentLat, currentLon),
    ]);

    const ensembleFeature = ensembleData.features?.[0];
    const ensembleParams = ensembleFeature?.properties?.parameters || {};
    const timestamps = ensembleData.timestamps || [];

    if (!timestamps.length) {
      throw new Error("No data available for this point.");
    }

    const nwpFeature = nwpData.features?.[0];
    const nwpParams = nwpFeature?.properties?.parameters || {};
    const nwpTimestamps = nwpData.timestamps || [];

    const openMeteoHourly = openMeteoData.hourly || {};
    const openMeteoTimes = openMeteoHourly.time || [];
    const openMeteoCloud = openMeteoHourly.cloud_cover || [];
    const openMeteoTemp = openMeteoHourly.temperature_2m || [];
    const openMeteoPrecip = openMeteoHourly.precipitation || [];
    const openMeteoWind = openMeteoHourly.wind_speed_10m || [];

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

    const nwpCloud = extractDeterministicSeries(nwpParams, paramSets.nwp.cloud);
    const nwpTemp = extractDeterministicSeries(nwpParams, paramSets.nwp.temp);
    const nwpPrecipAcc = extractDeterministicSeries(
      nwpParams,
      paramSets.nwp.precip
    );
    const nwpPrecip = toHourlyFromAccum(nwpPrecipAcc);
    const nwpWindU = extractDeterministicSeries(nwpParams, paramSets.nwp.windU);
    const nwpWindV = extractDeterministicSeries(nwpParams, paramSets.nwp.windV);
    const nwpWind = buildWindSpeedDeterministic(nwpWindU, nwpWindV);

    const nwpCloudAligned = alignSeries(timestamps, nwpTimestamps, nwpCloud).map(
      toPercentNullable
    );
    const nwpTempAligned = alignSeries(timestamps, nwpTimestamps, nwpTemp);
    const nwpPrecipAligned = alignSeries(timestamps, nwpTimestamps, nwpPrecip);
    const nwpWindAligned = alignSeries(timestamps, nwpTimestamps, nwpWind);

    const openMeteoTempAligned = alignSeriesByKey(
      timestamps,
      formatLocalHourKey,
      openMeteoTimes,
      openMeteoTemp
    );
    const openMeteoCloudAligned = alignSeriesByKey(
      timestamps,
      formatLocalHourKey,
      openMeteoTimes,
      openMeteoCloud
    );
    const openMeteoPrecipAligned = alignSeriesByKey(
      timestamps,
      formatLocalHourKey,
      openMeteoTimes,
      openMeteoPrecip
    );
    const openMeteoWindAligned = alignSeriesByKey(
      timestamps,
      formatLocalHourKey,
      openMeteoTimes,
      openMeteoWind
    );

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
      overlays: [
        { ...NWP_OVERLAY, data: nwpCloudAligned },
        { ...OPEN_METEO_OVERLAY, data: openMeteoCloudAligned },
      ],
    });

    if (precipSeries?.p50.length) {
      const precipMax = seriesMax(
        precipSeries.p10,
        precipSeries.p50,
        precipSeries.p90,
        nwpPrecipAligned.filter((value) => value !== null),
        openMeteoPrecipAligned.filter((value) => value !== null)
      );
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
        overlays: [
          { ...NWP_OVERLAY, data: nwpPrecipAligned },
          { ...OPEN_METEO_OVERLAY, data: openMeteoPrecipAligned },
        ],
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
        overlays: [
          { ...NWP_OVERLAY, data: nwpTempAligned },
          { ...OPEN_METEO_OVERLAY, data: openMeteoTempAligned },
        ],
      });
    }

    if (windSeries?.p50.length) {
      const windMax = seriesMax(
        windSeries.p10,
        windSeries.p50,
        windSeries.p90,
        nwpWindAligned.filter((value) => value !== null),
        openMeteoWindAligned.filter((value) => value !== null)
      );
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
        overlays: [
          { ...NWP_OVERLAY, data: nwpWindAligned },
          { ...OPEN_METEO_OVERLAY, data: openMeteoWindAligned },
        ],
      });
    }

    refTimeEl.textContent = ensembleData.reference_time
      ? formatTime(ensembleData.reference_time)
      : "N/A";

    setCityStatus("Updated just now.");
  } catch (error) {
    console.error(error);
    setCityStatus(error.message || "Unable to load forecast.", true);
  }
};

const init = async () => {
  try {
    updateLocationLabels();
    const [ensembleMetaResponse, nwpMetaResponse] = await Promise.all([
      fetch(`${API_BASE}/timeseries/forecast/${ENSEMBLE_DATASET_ID}/metadata`, {
        cache: "no-store",
      }),
      fetch(`${API_BASE}/timeseries/forecast/${NWP_DATASET_ID}/metadata`, {
        cache: "no-store",
      }),
    ]);

    if (!ensembleMetaResponse.ok) {
      throw new Error(
        `Ensemble metadata request failed (${ensembleMetaResponse.status}).`
      );
    }

    if (!nwpMetaResponse.ok) {
      throw new Error(`NWP metadata request failed (${nwpMetaResponse.status}).`);
    }

    const ensembleMeta = await ensembleMetaResponse.json();
    const nwpMeta = await nwpMetaResponse.json();
    const ensembleIndex = buildParamIndex(ensembleMeta);
    const nwpIndex = buildParamIndex(nwpMeta);

    const ensemble = {
      cloud: getParamSet(ensembleIndex, "tcc"),
      precip: getParamSet(ensembleIndex, "rr") || getParamSet(ensembleIndex, "rain"),
      temp: getParamSet(ensembleIndex, "t2m"),
      windU: getParamSet(ensembleIndex, "u10m"),
      windV: getParamSet(ensembleIndex, "v10m"),
    };

    const nwp = {
      cloud: getDeterministicParam(nwpIndex, "tcc"),
      precip: getDeterministicParam(nwpIndex, "rr_acc"),
      temp: getDeterministicParam(nwpIndex, "t2m"),
      windU: getDeterministicParam(nwpIndex, "u10m"),
      windV: getDeterministicParam(nwpIndex, "v10m"),
    };

    const missing = [];
    if (!ensemble.cloud) missing.push("ensemble tcc");
    if (!ensemble.precip) missing.push("ensemble rr/rain");
    if (!ensemble.temp) missing.push("ensemble t2m");
    if (!ensemble.windU) missing.push("ensemble u10m");
    if (!ensemble.windV) missing.push("ensemble v10m");
    if (!nwp.cloud) missing.push("nwp tcc");
    if (!nwp.precip) missing.push("nwp rr_acc");
    if (!nwp.temp) missing.push("nwp t2m");
    if (!nwp.windU) missing.push("nwp u10m");
    if (!nwp.windV) missing.push("nwp v10m");

    if (missing.length) {
      throw new Error(`Missing parameters in metadata: ${missing.join(", ")}.`);
    }

    paramSets = { ensemble, nwp };

    setCityStatus("Metadata loaded.");
    await loadData();
  } catch (error) {
    console.error(error);
    setCityStatus(error.message || "Unable to initialize.", true);
  }
};

init();
