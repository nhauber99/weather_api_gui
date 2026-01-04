import { formatTime, formatEvenHourTick, getLocalHour } from "./format.js";
import { ENSEMBLE_STYLE, PROVIDER_STYLES } from "./theme.js";

const BAND_HEIGHT = 8;
const BAND_GAP = 3;
const BAND_SPACING = 3;
const BAND_LABEL_PADDING = BAND_GAP + BAND_HEIGHT * 2 + BAND_SPACING + 2;

const dayNightBandPlugin = {
  id: "dayNightBand",
  beforeDatasetsDraw(chart, _args, options) {
    const xScale = chart.scales.x;
    const bands = options?.bands || [];
    if (!xScale || !bands.length) {
      return;
    }

    const labelCount = chart.data?.labels?.length || 0;
    if (!labelCount) {
      return;
    }

    const centers = [];
    for (let i = 0; i < labelCount; i += 1) {
      centers.push(xScale.getPixelForValue(i));
    }

    const ctx = chart.ctx;
    const leftEdge = xScale.left;
    const rightEdge = xScale.right;

    const drawBand = (band) => {
      const elevations = band.elevations || [];
      const crossings = band.crossings || [];
      const count = Math.min(elevations.length, labelCount);
      if (!count) {
        return;
      }

      const isUp = (elev) => elev > 0;
      const baseY = xScale.top + (options.gap ?? BAND_GAP) + (band.offset ?? 0);
      const height = band.height ?? options.height ?? BAND_HEIGHT;
      const upColor =
        band.upColor || options.dayColor || "rgba(243, 201, 105, 0.7)";
      const downColor =
        band.downColor || options.nightColor || "rgba(94, 136, 214, 0.55)";

      const drawSegment = (left, right, elev) => {
        const width = Math.max(0, right - left);
        if (width <= 0) {
          return;
        }
        ctx.fillStyle = isUp(elev) ? upColor : downColor;
        ctx.fillRect(left, baseY, width, height);
      };

      drawSegment(leftEdge, centers[0], elevations[0]);

      for (let i = 0; i < count - 1; i += 1) {
        const left = centers[i];
        const right = centers[i + 1];
        const elevLeft = elevations[i];
        const elevRight = elevations[i + 1];
        if (isUp(elevLeft) === isUp(elevRight) || elevLeft === elevRight) {
          drawSegment(left, right, elevLeft);
        } else {
          let fraction = crossings[i];
          if (!Number.isFinite(fraction)) {
            const denom = elevLeft - elevRight;
            fraction =
              denom === 0 ? 0.5 : Math.min(Math.max(elevLeft / denom, 0), 1);
          }
          const cross = left + (right - left) * fraction;
          drawSegment(left, cross, elevLeft);
          drawSegment(cross, right, elevRight);
        }
      }

      drawSegment(centers[count - 1], rightEdge, elevations[count - 1]);
    };

    ctx.save();
    ctx.globalAlpha = 0.9;
    bands.forEach(drawBand);
    ctx.restore();
  },
};

const midnightLinePlugin = {
  id: "midnightLines",
  afterDatasetsDraw(chart, _args, options) {
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    const labels = chart.data?.labels || [];
    if (!xScale || !yScale || !labels.length) {
      return;
    }

    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = options?.color || "rgba(255, 70, 70, 0.85)";
    ctx.lineWidth = options?.lineWidth || 1.4;

    labels.forEach((label, index) => {
      if (getLocalHour(label) !== 0) {
        return;
      }
      const x = xScale.getPixelForValue(index);
      ctx.beginPath();
      ctx.moveTo(x, yScale.top);
      ctx.lineTo(x, yScale.bottom);
      ctx.stroke();
    });

    ctx.restore();
  },
};

const isMobilePortrait = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(max-width: 700px) and (orientation: portrait)").matches;

const toRgba = (color, alpha) => {
  if (!color) {
    return `rgba(255, 255, 255, ${alpha})`;
  }
  if (color.startsWith("rgba")) {
    return color.replace(/rgba\(([^)]+)\)/, (_match, values) => {
      const parts = values.split(",").map((part) => part.trim());
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    });
  }
  if (color.startsWith("rgb")) {
    return color.replace("rgb", "rgba").replace(")", `, ${alpha})`);
  }
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((char) => char + char)
        .join("");
    }
    if (hex.length !== 6) {
      return color;
    }
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
};

const buildSimpleDatasets = (simpleSeries) => {
  const base = ENSEMBLE_STYLE.color;
  const softLine = toRgba(base, 0.28);
  const softFill = toRgba(base, 0.12);
  const dotted = ENSEMBLE_STYLE.dotDash;
  const lineWidth = ENSEMBLE_STYLE.widths.p50;

  return [
    {
      label: "Min",
      data: simpleSeries.min,
      borderColor: toRgba(base, 0.7),
      backgroundColor: "transparent",
      pointRadius: 0,
      borderWidth: 1.4,
      tension: 0.35,
      borderDash: dotted,
    },
    {
      label: "Max",
      data: simpleSeries.max,
      borderColor: toRgba(base, 0.7),
      backgroundColor: "transparent",
      pointRadius: 0,
      borderWidth: 1.4,
      tension: 0.35,
      borderDash: dotted,
    },
    {
      label: "Range low",
      data: simpleSeries.innerMin,
      borderColor: softLine,
      backgroundColor: "transparent",
      pointRadius: 0,
      borderWidth: 1.2,
      tension: 0.35,
    },
    {
      label: "Range high",
      data: simpleSeries.innerMax,
      borderColor: softLine,
      backgroundColor: softFill,
      pointRadius: 0,
      borderWidth: 1.2,
      tension: 0.35,
      fill: "-1",
    },
    {
      label: "Average",
      data: simpleSeries.avg,
      borderColor: base,
      backgroundColor: "transparent",
      pointRadius: 0,
      borderWidth: lineWidth,
      tension: 0.35,
    },
  ];
};

export const createChartBuilder = () => {
  const charts = {
    cloud: null,
    precip: null,
    temp: null,
    wind: null,
  };

  const resizeAll = () => {
    Object.values(charts).forEach((chart) => {
      if (chart) {
        chart.resize();
      }
    });
  };

  const buildBandChart = ({
    canvas,
    chartKey,
    labels,
    p10,
    p50,
    p90,
    dayNightBand,
    moonBand,
    suggestedMin,
    suggestedMax,
    formatValue,
    overlays,
    simpleSeries,
    simpleView = false,
  }) => {
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (charts[chartKey]) {
      charts[chartKey].destroy();
    }

    const datasets = simpleView && simpleSeries
      ? buildSimpleDatasets(simpleSeries)
      : [
          {
            label: `${ENSEMBLE_STYLE.labelPrefix} P10`,
            data: p10,
            borderColor: ENSEMBLE_STYLE.color,
            backgroundColor: "transparent",
            pointRadius: 0,
            borderWidth: ENSEMBLE_STYLE.widths.p10,
            tension: 0.35,
            borderDash: ENSEMBLE_STYLE.dotDash,
          },
          {
            label: `${ENSEMBLE_STYLE.labelPrefix} P90`,
            data: p90,
            borderColor: ENSEMBLE_STYLE.color,
            backgroundColor: "transparent",
            pointRadius: 0,
            borderWidth: ENSEMBLE_STYLE.widths.p90,
            tension: 0.35,
            borderDash: ENSEMBLE_STYLE.dotDash,
          },
          {
            label: `${ENSEMBLE_STYLE.labelPrefix} P50`,
            data: p50,
            borderColor: ENSEMBLE_STYLE.color,
            backgroundColor: "transparent",
            pointRadius: 0,
            borderWidth: ENSEMBLE_STYLE.widths.p50,
            tension: 0.35,
          },
        ];

    if (!simpleView) {
      const overlayItems = overlays || [];
      overlayItems.forEach((item) => {
        if (!item?.data) {
          return;
        }
        const style = PROVIDER_STYLES[item.provider] || {
          label: item.provider || "Overlay",
          color: "#f08a4b",
        };
        datasets.push({
          label: style.label,
          data: item.data,
          borderColor: style.color,
          backgroundColor: "transparent",
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.35,
          borderDash: [],
          spanGaps: true,
        });
      });
    }

    const valueFormatter = formatValue || ((value) => value);

    charts[chartKey] = new Chart(ctx, {
      type: "line",
      plugins: [dayNightBandPlugin, midnightLinePlugin],
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        layout: {
          padding: {
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          },
        },
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
          },
          dayNightBand: {
            bands: [
              {
                elevations: dayNightBand.elevations,
                crossings: dayNightBand.crossings,
                upColor: "rgba(243, 201, 105, 0.7)",
                downColor: "rgba(94, 136, 214, 0.55)",
                offset: 0,
              },
              {
                elevations: moonBand.elevations,
                crossings: moonBand.crossings,
                upColor: "rgba(180, 180, 190, 0.7)",
                downColor: "rgba(70, 82, 110, 0.45)",
                offset: BAND_HEIGHT + BAND_SPACING,
              },
            ],
            height: BAND_HEIGHT,
            gap: BAND_GAP,
          },
          midnightLines: {
            color: "rgba(255, 70, 70, 0.85)",
            lineWidth: 1.4,
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
              padding: BAND_LABEL_PADDING,
              callback(value) {
                const label = this.getLabelForValue(value);
                if (isMobilePortrait()) {
                  const hour = getLocalHour(label);
                  if (!Number.isFinite(hour) || hour % 4 !== 0) {
                    return "";
                  }
                  return String(hour).padStart(2, "0");
                }
                return formatEvenHourTick(label);
              },
            },
            grid: {
              color: "rgba(94, 214, 200, 0.08)",
            },
          },
          y: {
            title: {
              display: false,
            },
            ticks: {
              color: "#a2c4c4",
              callback: (value) => valueFormatter(value),
              padding: 4,
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

  return { buildBandChart, resizeAll };
};
