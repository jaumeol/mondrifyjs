"use strict";

const COLORS = Object.freeze({
  red: "#E52323",
  yellow: "#F5D51B",
  blue: "#164B9B",
  white: "#FFFFFF",
  black: "#000000",
});

const COLOR_OPTIONS = Object.freeze([
  { value: COLORS.red, weight: 0.1 },
  { value: COLORS.yellow, weight: 0.1 },
  { value: COLORS.blue, weight: 0.1 },
  { value: COLORS.white, weight: 0.7 },
]);

const elements = {
  artboard: document.querySelector("#artboard"),
  emptyState: document.querySelector("#empty-state"),
  generate: document.querySelector("#generate"),
  download: document.querySelector("#download"),
  compositionMeta: document.querySelector("#composition-meta"),
  regionMeta: document.querySelector("#region-meta"),
  seedMeta: document.querySelector("#seed-meta"),
};

const sliders = {
  width: document.querySelector("#width"),
  height: document.querySelector("#height"),
  rows: document.querySelector("#rows"),
  columns: document.querySelector("#columns"),
  thickness: document.querySelector("#line-thickness"),
};

const sliderOutputs = {
  width: document.querySelector("#width-value"),
  height: document.querySelector("#height-value"),
  rows: document.querySelector("#rows-value"),
  columns: document.querySelector("#columns-value"),
  thickness: document.querySelector("#line-thickness-value"),
};

let currentSvg = null;
let currentDimensions = null;

function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function newSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function readSettings() {
  return {
    width: Number(sliders.width.value),
    height: Number(sliders.height.value),
    rows: Number(sliders.rows.value),
    columns: Number(sliders.columns.value),
    thickness: Number(sliders.thickness.value),
  };
}

function updateSliderLabels() {
  const settings = readSettings();
  sliderOutputs.width.value = `${settings.width} px`;
  sliderOutputs.height.value = `${settings.height} px`;
  sliderOutputs.rows.value = String(settings.rows);
  sliderOutputs.columns.value = String(settings.columns);
  sliderOutputs.thickness.value = `${settings.thickness} px`;
}

function randomizedSegments(total, count, thickness, random) {
  const average = total / count;
  const minimum = Math.min(
    Math.floor(average),
    Math.max(thickness + 2, Math.floor(average * 0.68)),
  );
  const maximum = Math.min(
    total - minimum * (count - 1),
    Math.ceil(average * 1.32),
  );
  const segments = [];
  let remaining = total;

  for (let index = 0; index < count; index += 1) {
    const remainingCount = count - index - 1;
    if (remainingCount === 0) {
      segments.push(remaining);
      break;
    }

    const lower = Math.max(minimum, remaining - maximum * remainingCount);
    const upper = Math.min(maximum, remaining - minimum * remainingCount);
    const target = average * (0.7 + random() * 0.6);
    const size = Math.min(upper, Math.max(lower, Math.round(target)));
    segments.push(size);
    remaining -= size;
  }

  return segments;
}

function makeBoundaries(total, count, thickness, random) {
  const boundaries = [0];
  for (const size of randomizedSegments(total, count, thickness, random)) {
    boundaries.push(boundaries.at(-1) + size);
  }
  return boundaries;
}

function partitionGrid(rows, columns, random) {
  const regions = [];
  const stopProbability = 0.28;

  function divide(rowStart, rowEnd, columnStart, columnEnd) {
    const rowSpan = rowEnd - rowStart;
    const columnSpan = columnEnd - columnStart;
    const horizontalWeight = rowSpan > 1 ? rowSpan - 1 : 0;
    const verticalWeight = columnSpan > 1 ? columnSpan - 1 : 0;
    const totalWeight = horizontalWeight + verticalWeight;

    if (totalWeight === 0 || (regions.length >= 3 && random() < stopProbability)) {
      regions.push({ rowStart, rowEnd, columnStart, columnEnd });
      return;
    }

    if (random() * totalWeight < horizontalWeight) {
      const cut = rowStart + 1 + Math.floor(random() * (rowSpan - 1));
      divide(rowStart, cut, columnStart, columnEnd);
      divide(cut, rowEnd, columnStart, columnEnd);
    } else {
      const cut =
        columnStart + 1 + Math.floor(random() * (columnSpan - 1));
      divide(rowStart, rowEnd, columnStart, cut);
      divide(rowStart, rowEnd, cut, columnEnd);
    }
  }

  divide(0, rows, 0, columns);
  return regions;
}

function lineStart(position, total, thickness) {
  if (position === 0) return 0;
  if (position === total) return total - thickness;
  return position - Math.floor(thickness / 2);
}

function visibleRegionArea(region, xBounds, yBounds, thickness) {
  const x0 = xBounds[region.columnStart];
  const x1 = xBounds[region.columnEnd];
  const y0 = yBounds[region.rowStart];
  const y1 = yBounds[region.rowEnd];
  const width = xBounds.at(-1);
  const height = yBounds.at(-1);

  const leftCoverage = x0 === 0
    ? thickness
    : thickness - Math.floor(thickness / 2);
  const rightCoverage = x1 === width
    ? thickness
    : Math.floor(thickness / 2);
  const topCoverage = y0 === 0
    ? thickness
    : thickness - Math.floor(thickness / 2);
  const bottomCoverage = y1 === height
    ? thickness
    : Math.floor(thickness / 2);

  const regionWidth = Math.max(0, x1 - x0 - leftCoverage - rightCoverage);
  const regionHeight = Math.max(0, y1 - y0 - topCoverage - bottomCoverage);
  return regionWidth * regionHeight;
}

function chooseColor(random) {
  const choice = random();
  let total = 0;
  for (const option of COLOR_OPTIONS) {
    total += option.weight;
    if (choice < total) return option.value;
  }
  return COLORS.white;
}

function assignColors(regions, xBounds, yBounds, thickness, random) {
  const visibleAreas = regions.map((region) =>
    visibleRegionArea(region, xBounds, yBounds, thickness),
  );
  const colors = regions.map(() => chooseColor(random));

  while (true) {
    const areaByColor = new Map(
      COLOR_OPTIONS.filter((option) => option.value !== COLORS.white)
        .map((option) => [option.value, 0]),
    );
    let whiteArea = 0;

    colors.forEach((color, index) => {
      if (color === COLORS.white) whiteArea += visibleAreas[index];
      else areaByColor.set(color, areaByColor.get(color) + visibleAreas[index]);
    });

    const largestOtherArea = Math.max(...areaByColor.values());
    if (whiteArea > largestOtherArea) {
      if (colors.every((color) => color === COLORS.white)) {
        const totalVisibleArea = visibleAreas.reduce((sum, area) => sum + area, 0);
        const accentCandidates = visibleAreas
          .map((area, index) => ({ area, index }))
          .filter(({ area }) => area > 0 && area * 2 < totalVisibleArea);
        if (accentCandidates.length > 0) {
          const candidate =
            accentCandidates[Math.floor(random() * accentCandidates.length)];
          const accentColors = COLOR_OPTIONS
            .filter((option) => option.value !== COLORS.white)
            .map((option) => option.value);
          colors[candidate.index] =
            accentColors[Math.floor(random() * accentColors.length)];
        }
      }
      return colors;
    }

    const largestOtherColors = [...areaByColor]
      .filter(([, area]) => area === largestOtherArea)
      .map(([color]) => color);
    const candidates = colors
      .map((color, index) => ({ color, index, area: visibleAreas[index] }))
      .filter(
        ({ color, area }) =>
          largestOtherColors.includes(color) && area > 0,
      )
      .sort((left, right) => right.area - left.area);

    if (candidates.length === 0) return colors;
    const largestArea = candidates[0].area;
    const largestRegions = candidates.filter(
      (candidate) => candidate.area === largestArea,
    );
    colors[largestRegions[Math.floor(random() * largestRegions.length)].index] =
      COLORS.white;
  }
}

function createSvgElement(tag, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, String(value));
  }
  return node;
}

function addRect(svg, x, y, width, height, fill) {
  if (width <= 0 || height <= 0) return;
  svg.append(
    createSvgElement("rect", {
      x,
      y,
      width,
      height,
      fill,
      "shape-rendering": "crispEdges",
    }),
  );
}

function renderComposition(settings, seed) {
  const random = createRandom(seed);
  const xBounds = makeBoundaries(
    settings.width,
    settings.columns,
    settings.thickness,
    random,
  );
  const yBounds = makeBoundaries(
    settings.height,
    settings.rows,
    settings.thickness,
    random,
  );
  const regions = partitionGrid(settings.rows, settings.columns, random);
  const colors = assignColors(
    regions,
    xBounds,
    yBounds,
    settings.thickness,
    random,
  );
  const svg = createSvgElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: `0 0 ${settings.width} ${settings.height}`,
    width: settings.width,
    height: settings.height,
    role: "img",
    "aria-label": "Randomly generated geometric color-block composition",
  });

  regions.forEach((region, index) => {
    const x = xBounds[region.columnStart];
    const y = yBounds[region.rowStart];
    const width = xBounds[region.columnEnd] - x;
    const height = yBounds[region.rowEnd] - y;
    addRect(svg, x, y, width, height, colors[index]);
  });

  const verticalEdges = new Set();
  const horizontalEdges = new Set();
  for (const region of regions) {
    const y0 = yBounds[region.rowStart];
    const y1 = yBounds[region.rowEnd];
    const x0 = xBounds[region.columnStart];
    const x1 = xBounds[region.columnEnd];
    verticalEdges.add(`${x0},${y0},${y1}`);
    verticalEdges.add(`${x1},${y0},${y1}`);
    horizontalEdges.add(`${y0},${x0},${x1}`);
    horizontalEdges.add(`${y1},${x0},${x1}`);
  }

  for (const edge of verticalEdges) {
    const [x, y0, y1] = edge.split(",").map(Number);
    addRect(
      svg,
      lineStart(x, settings.width, settings.thickness),
      y0,
      settings.thickness,
      y1 - y0,
      COLORS.black,
    );
  }
  for (const edge of horizontalEdges) {
    const [y, x0, x1] = edge.split(",").map(Number);
    addRect(
      svg,
      x0,
      lineStart(y, settings.height, settings.thickness),
      x1 - x0,
      settings.thickness,
      COLORS.black,
    );
  }

  return { svg, regions, xBounds, yBounds };
}

function render() {
  const settings = readSettings();
  const seed = newSeed();
  const result = renderComposition(settings, seed);

  elements.emptyState.hidden = true;
  elements.artboard.replaceChildren(result.svg);
  elements.compositionMeta.textContent =
    `${settings.width} × ${settings.height} PX`;
  elements.regionMeta.textContent =
    `${result.regions.length} REGIONS · ${settings.rows} × ${settings.columns} GRID`;
  elements.seedMeta.textContent = `SEED ${seed.toString(16).padStart(8, "0").toUpperCase()}`;
  elements.download.disabled = false;
  currentSvg = result.svg;
  currentDimensions = { width: settings.width, height: settings.height };
}

async function downloadPng() {
  if (!currentSvg || !currentDimensions) return;

  const svgSource = new XMLSerializer().serializeToString(currentSvg);
  const svgBlob = new Blob([svgSource], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);
  const image = new Image();

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Could not prepare the PNG."));
      image.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = currentDimensions.width;
    canvas.height = currentDimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG export is unavailable in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not create the PNG file."));
      }, "image/png");
    });
    const pngUrl = URL.createObjectURL(pngBlob);
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download =
      `mondrify-${currentDimensions.width}x${currentDimensions.height}.png`;
    link.click();
    URL.revokeObjectURL(pngUrl);
  } catch (error) {
    console.error("PNG export failed:", error);
    window.alert(`PNG export failed: ${error.message}`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

for (const slider of Object.values(sliders)) {
  slider.addEventListener("input", updateSliderLabels);
}

elements.generate.addEventListener("click", render);
elements.download.addEventListener("click", downloadPng);
updateSliderLabels();
