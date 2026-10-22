const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function validArea(area) {
  return area && ["x", "y", "width", "height"].every((key) => Number.isFinite(area[key]) && Math.abs(area[key]) <= 1000000)
    && area.width >= 1 && area.height >= 1;
}

function normalizePlacement(value) {
  if (value?.version !== 1 || !validArea(value.area)
    || !Number.isFinite(value.center) || !Number.isFinite(value.bottom)) return null;
  return { version: 1,
    area: Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, Math.round(value.area[key])])),
    center: clamp(value.center, 0, 1), bottom: clamp(value.bottom, 0, 1) };
}

function fitBounds(bounds, area) {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.round(clamp(bounds.x, area.x, area.x + area.width - width)),
    y: Math.round(clamp(bounds.y, area.y, area.y + area.height - height)),
    width: Math.round(width), height: Math.round(height),
  };
}

function capturePlacement(bounds, area) {
  if (!validArea(bounds) || !validArea(area)) return null;
  const fitted = fitBounds(bounds, area);
  return normalizePlacement({ version: 1, area,
    center: (fitted.x + fitted.width / 2 - area.x) / area.width,
    bottom: (fitted.y + fitted.height - area.y) / area.height });
}

function defaultBounds(size, area) {
  return fitBounds({ ...size, x: area.x + area.width - size.width - 72,
    y: area.y + area.height - size.height - 72 }, area);
}

function restorePlacement(raw, size, areas, primary) {
  const saved = normalizePlacement(raw);
  if (!saved) return defaultBounds(size, primary);
  const overlap = (area) => Math.max(0, Math.min(area.x + area.width, saved.area.x + saved.area.width) - Math.max(area.x, saved.area.x))
    * Math.max(0, Math.min(area.y + area.height, saved.area.y + saved.area.height) - Math.max(area.y, saved.area.y));
  const candidates = areas.filter(validArea);
  const exact = candidates.find((area) => ["x", "y", "width", "height"].every((key) => area[key] === saved.area[key]));
  const closest = candidates.reduce((best, area) => overlap(area) > overlap(best) ? area : best, primary);
  const area = exact || (overlap(closest) > 0 ? closest : primary);
  return fitBounds({ ...size, x: area.x + saved.center * area.width - size.width / 2,
    y: area.y + saved.bottom * area.height - size.height }, area);
}

module.exports = { normalizePlacement, fitBounds, capturePlacement, defaultBounds, restorePlacement };
