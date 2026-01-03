import { formatTime, formatEvenHourTick } from "./format.js";

const BAND_HEIGHT = 10;
const BAND_GAP = 4;
const BAND_SPACING = 4;
const BAND_LABEL_PADDING = BAND_GAP + BAND_HEIGHT * 2 + BAND_SPACING + 6;

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

export const createChartBuilder = () => {
  const charts = {
    cloud: null,
    precip: null,
    temp: null,
    wind: null,
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
    yLabel,
    yUnit,
    suggestedMin,
    suggestedMax,
    formatValue,
    overlay,
    overlays,
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
        label: "C-LAEF P10",
        data: p10,
        borderColor: "#7b6cff",
        pointRadius: 0,
        borderWidth: 1.6,
        tension: 0.35,
        borderDash: [2, 4],
      },
      {
        label: "C-LAEF P90",
        data: p90,
        borderColor: "#7b6cff",
        pointRadius: 0,
        borderWidth: 1.6,
        tension: 0.35,
        borderDash: [2, 4],
      },
      {
        label: "C-LAEF P50",
        data: p50,
        borderColor: "#7b6cff",
        pointRadius: 0,
        borderWidth: 2.2,
        tension: 0.35,
      },
    ];

    const overlayItems = overlays || (overlay ? [overlay] : []);
    overlayItems.forEach((item) => {
      if (!item?.data) {
        return;
      }
      datasets.push({
        label: item.label || "NWP",
        data: item.data,
        borderColor: item.color || "#f08a4b",
        backgroundColor: "transparent",
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.35,
        borderDash: [],
        spanGaps: true,
      });
    });

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

  return { buildBandChart };
};
