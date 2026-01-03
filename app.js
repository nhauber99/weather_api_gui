const API_BASE = "https://dataset.api.hub.geosphere.at/v1";
const DATASET_ID = "ensemble-v1-1h-2500m";
const TIMEZONE = "Europe/Vienna";

const cloudCanvas = document.getElementById("cloudChart");
const precipCanvas = document.getElementById("precipChart");
const tempCanvas = document.getElementById("tempChart");
const windCanvas = document.getElementById("windChart");
const form = document.getElementById("locationForm");
const cityForm = document.getElementById("cityForm");
const cityInput = document.getElementById("cityInput");
const cityResults = document.getElementById("cityResults");
const cityStatus = document.getElementById("cityStatus");
const latInput = document.getElementById("latInput");
const lonInput = document.getElementById("lonInput");
const statusEl = document.getElementById("status");
const refTimeEl = document.getElementById("refTime");
const locationLabelEl = document.getElementById("locationLabel");

let charts = {
  cloud: null,
  precip: null,
  temp: null,
  wind: null,
};
let paramSets = null;
let lastCitySearch = 0;
let currentLocationName = "Traun";

const formatTime = (iso) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const getLocalHour = (iso) => {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return Number.parseInt(hour, 10);
};

const formatEvenHourTick = (iso) => {
  const hour = getLocalHour(iso);
  if (!Number.isFinite(hour) || hour % 2 !== 0) {
    return "";
  }
  return String(hour).padStart(2, "0");
};

const toPercent = (value) => Math.round(value * 100);
const formatNumber = (value, digits) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : value;
};

const seriesMax = (...series) => {
  const values = series.flat().filter((value) => Number.isFinite(value));
  if (!values.length) {
    return null;
  }
  return Math.max(...values);
};
const degToRad = (deg) => (deg * Math.PI) / 180;
const radToDeg = (rad) => (rad * 180) / Math.PI;

const normalizeDegrees = (deg) => ((deg % 360) + 360) % 360;

const solarElevation = (date, lat, lon) => {
  const jd = date.getTime() / 86400000 + 2440587.5;
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

const buildDayNightSegments = (timestamps, lat, lon) =>
  timestamps.map((iso) => solarElevation(new Date(iso), lat, lon) > 0);

const DAY_NIGHT_BAND_HEIGHT = 10;
const DAY_NIGHT_BAND_GAP = 4;
const DAY_NIGHT_LABEL_PADDING = DAY_NIGHT_BAND_HEIGHT + DAY_NIGHT_BAND_GAP + 6;

const dayNightBandPlugin = {
  id: "dayNightBand",
  beforeDatasetsDraw(chart, _args, options) {
    const xScale = chart.scales.x;
    if (!xScale || !options?.segments?.length) {
      return;
    }

    const ctx = chart.ctx;
    const segments = options.segments;
    const labelCount = chart.data?.labels?.length || 0;
    const count = Math.min(segments.length, labelCount);
    if (!count) {
      return;
    }

    const centers = [];
    for (let i = 0; i < count; i += 1) {
      centers.push(xScale.getPixelForValue(i));
    }

    ctx.save();
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < count; i += 1) {
      const left =
        i === 0 ? xScale.left : (centers[i - 1] + centers[i]) / 2;
      const right =
        i === count - 1
          ? xScale.right
          : (centers[i] + centers[i + 1]) / 2;
      const width = Math.max(0, right - left);
      const y = xScale.top + (options.gap ?? DAY_NIGHT_BAND_GAP);
      const height = options.height ?? DAY_NIGHT_BAND_HEIGHT;

      ctx.fillStyle = segments[i]
        ? options.dayColor || "rgba(243, 201, 105, 0.7)"
        : options.nightColor || "rgba(94, 136, 214, 0.55)";
      ctx.fillRect(left, y, width, height);
    }

    ctx.restore();
  },
};

const setStatus = (text, isError = false) => {
  statusEl.textContent = text;
  statusEl.style.borderColor = isError
    ? "rgba(255, 125, 125, 0.4)"
    : "rgba(94, 214, 200, 0.2)";
  statusEl.style.background = isError
    ? "rgba(255, 125, 125, 0.08)"
    : "rgba(94, 214, 200, 0.08)";
};

const setCityStatus = (text, isError = false) => {
  cityStatus.textContent = text;
  cityStatus.style.color = isError ? "#ffb4b4" : "var(--muted)";
};

const clearCityResults = () => {
  cityResults.innerHTML = "";
};

const renderCityResults = (results) => {
  clearCityResults();

  results.forEach((result) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const labelParts = (result.display_name || "").split(",").slice(0, 4);
    const label = labelParts.join(", ").trim() || "Unnamed location";

    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      latInput.value = lat.toFixed(6);
      lonInput.value = lon.toFixed(6);
      currentLocationName = label;
      cityInput.value = label;
      locationLabelEl.textContent = `${label} (${lat.toFixed(6)}, ${lon.toFixed(6)})`;
      setCityStatus("Location selected.");
      loadData();
    });

    li.appendChild(button);
    cityResults.appendChild(li);
  });
};

const searchCity = async () => {
  const query = cityInput.value.trim();

  if (!query) {
    setCityStatus("Enter a city name.", true);
    return;
  }

  const now = Date.now();
  if (now - lastCitySearch < 900) {
    setCityStatus("Please wait a moment before searching again.", true);
    return;
  }

  lastCitySearch = now;
  setCityStatus("Searching Austrian cities...");
  clearCityResults();

  try {
    const params = new URLSearchParams({
      format: "json",
      limit: "5",
      countrycodes: "at",
      q: query,
      addressdetails: "1",
    });
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`Search failed (${response.status}).`);
    }

    const results = await response.json();
    if (!results.length) {
      setCityStatus("No matches found. Try another name.", true);
      return;
    }

    setCityStatus(`Found ${results.length} match${results.length === 1 ? "" : "es"}.`);
    renderCityResults(results);
  } catch (error) {
    console.error(error);
    setCityStatus(error.message || "Unable to search cities.", true);
  }
};

const buildParamIndex = (metadata) => {
  if (!metadata?.parameters?.length) {
    return null;
  }

  const map = new Map();
  metadata.parameters.forEach((param) => {
    map.set(param.name, param);
  });
  return map;
};

const getParamSet = (paramIndex, base) => {
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

const buildBandChart = ({
  canvas,
  chartKey,
  labels,
  p10,
  p50,
  p90,
  dayNightSegments,
  yLabel,
  yUnit,
  suggestedMin,
  suggestedMax,
  formatValue,
}) => {
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d");

  if (charts[chartKey]) {
    charts[chartKey].destroy();
  }

  const datasets = [
    {
      label: "P10",
      data: p10,
      borderColor: "rgba(94, 214, 200, 0.2)",
      backgroundColor: "rgba(94, 214, 200, 0.12)",
      pointRadius: 0,
      borderWidth: 1.5,
      tension: 0.35,
    },
    {
      label: "P90",
      data: p90,
      borderColor: "rgba(94, 214, 200, 0.2)",
      backgroundColor: "rgba(94, 214, 200, 0.18)",
      pointRadius: 0,
      borderWidth: 1.5,
      tension: 0.35,
      fill: "-1",
    },
    {
      label: "P50",
      data: p50,
      borderColor: "#5ed6c8",
      backgroundColor: "transparent",
      pointRadius: 0,
      borderWidth: 2.2,
      tension: 0.35,
    },
  ];

  const unitSuffix = yUnit ? ` (${yUnit})` : "";
  const valueFormatter = formatValue || ((value) => value);

  charts[chartKey] = new Chart(ctx, {
    type: "line",
    plugins: [dayNightBandPlugin],
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        dayNightBand: {
          segments: dayNightSegments,
          height: DAY_NIGHT_BAND_HEIGHT,
          gap: DAY_NIGHT_BAND_GAP,
        },
        tooltip: {
          callbacks: {
            title: (items) => (items.length ? formatTime(items[0].label) : ""),
            label: (context) =>
              `${context.dataset.label}: ${valueFormatter(context.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#a2c4c4",
            maxRotation: 0,
            autoSkip: false,
            padding: DAY_NIGHT_LABEL_PADDING,
            callback(value) {
              const label = this.getLabelForValue(value);
              return formatEvenHourTick(label);
            },
          },
          grid: {
            color: "rgba(94, 214, 200, 0.08)",
          },
        },
        y: {
          title: {
            display: true,
            text: `${yLabel}${unitSuffix}`,
            color: "#a2c4c4",
            font: {
              family: "Space Grotesk",
            },
          },
          ticks: {
            color: "#a2c4c4",
            callback: (value) => valueFormatter(value),
          },
          suggestedMin,
          suggestedMax,
          grid: {
            color: "rgba(94, 214, 200, 0.08)",
          },
        },
      },
    },
  });
};

const extractSeries = (params, set) => {
  if (!set) {
    return null;
  }

  return {
    p10: params[set.p10]?.data || [],
    p50: params[set.p50]?.data || [],
    p90: params[set.p90]?.data || [],
  };
};

const buildWindSpeedSeries = (uSeries, vSeries) => {
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

const fetchForecast = async (lat, lon) => {
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
    `${API_BASE}/timeseries/forecast/${DATASET_ID}?${query.toString()}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Forecast request failed (${response.status}).`);
  }

  return response.json();
};

const loadData = async () => {
  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    setStatus("Enter a valid latitude and longitude.", true);
    return;
  }

  setStatus("Fetching forecast...");
  const locationName = currentLocationName || "Traun";
  locationLabelEl.textContent = `${locationName} (${lat.toFixed(6)}, ${lon.toFixed(6)})`;

  try {
    const data = await fetchForecast(lat, lon);
    const feature = data.features?.[0];
    const params = feature?.properties?.parameters || {};
    const timestamps = data.timestamps || [];

    if (!timestamps.length) {
      throw new Error("No data available for this point.");
    }

    const labels = timestamps;
    const dayNightSegments = buildDayNightSegments(timestamps, lat, lon);

    const cloudSeries = extractSeries(params, paramSets.cloud);
    const precipSeries = extractSeries(params, paramSets.precip);
    const tempSeries = extractSeries(params, paramSets.temp);
    const windUSeries = extractSeries(params, paramSets.windU);
    const windVSeries = extractSeries(params, paramSets.windV);
    const windSeries = buildWindSpeedSeries(windUSeries, windVSeries);

    if (!cloudSeries?.p50.length) {
      throw new Error("Cloud cover data missing for this point.");
    }

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
      dayNightSegments,
      yLabel: "Cloud cover",
      yUnit: "%",
      suggestedMin: 0,
      suggestedMax: 100,
      formatValue: (value) => `${formatNumber(value, 0)}%`,
    });

    if (precipSeries?.p50.length) {
      const precipMax = seriesMax(precipSeries.p10, precipSeries.p50, precipSeries.p90);
      buildBandChart({
        canvas: precipCanvas,
        chartKey: "precip",
        labels,
        p10: precipSeries.p10,
        p50: precipSeries.p50,
        p90: precipSeries.p90,
        dayNightSegments,
        yLabel: "Precipitation",
        yUnit: "mm",
        suggestedMin: 0,
        suggestedMax: precipMax ? Math.max(1, precipMax) : 1,
        formatValue: (value) => formatNumber(value, 2),
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
        dayNightSegments,
        yLabel: "Temperature",
        yUnit: "deg C",
        formatValue: (value) => formatNumber(value, 1),
      });
    }

    if (windSeries?.p50.length) {
      const windMax = seriesMax(windSeries.p10, windSeries.p50, windSeries.p90);
      buildBandChart({
        canvas: windCanvas,
        chartKey: "wind",
        labels,
        p10: windSeries.p10,
        p50: windSeries.p50,
        p90: windSeries.p90,
        dayNightSegments,
        yLabel: "Wind speed",
        yUnit: "m/s",
        suggestedMin: 0,
        suggestedMax: windMax ? Math.max(5, windMax) : 5,
        formatValue: (value) => formatNumber(value, 1),
      });
    }
    refTimeEl.textContent = data.reference_time
      ? formatTime(data.reference_time)
      : "N/A";

    setStatus("Updated just now.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Unable to load forecast.", true);
  }
};

const init = async () => {
  try {
    const metadataResponse = await fetch(
      `${API_BASE}/timeseries/forecast/${DATASET_ID}/metadata`,
      { cache: "no-store" }
    );

    if (!metadataResponse.ok) {
      throw new Error(`Metadata request failed (${metadataResponse.status}).`);
    }

    const metadata = await metadataResponse.json();
    const paramIndex = buildParamIndex(metadata);

    const cloud = getParamSet(paramIndex, "tcc");
    const precip = getParamSet(paramIndex, "rr") || getParamSet(paramIndex, "rain");
    const temp = getParamSet(paramIndex, "t2m");
    const windU = getParamSet(paramIndex, "u10m");
    const windV = getParamSet(paramIndex, "v10m");

    const missing = [];
    if (!cloud) missing.push("tcc");
    if (!precip) missing.push("rr/rain");
    if (!temp) missing.push("t2m");
    if (!windU) missing.push("u10m");
    if (!windV) missing.push("v10m");

    if (missing.length) {
      throw new Error(`Missing parameters in metadata: ${missing.join(", ")}.`);
    }

    paramSets = { cloud, precip, temp, windU, windV };

    setStatus("Metadata loaded.");
    await loadData();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Unable to initialize.", true);
  }
};

form.addEventListener("submit", (event) => {
  event.preventDefault();
  loadData();
});

latInput.addEventListener("input", () => {
  currentLocationName = "Custom location";
});

lonInput.addEventListener("input", () => {
  currentLocationName = "Custom location";
});

cityForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchCity();
});

init();

