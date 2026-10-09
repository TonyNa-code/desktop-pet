function companionBounds(pet, area) {
  const gap = 10;
  const width = Math.min(360, area.width);
  const height = Math.min(110, area.height);
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  const candidates = [
    { x: pet.x + pet.width + gap, y: pet.y + pet.height - height },
    { x: pet.x - width - gap, y: pet.y + pet.height - height },
    { x: pet.x + (pet.width - width) / 2, y: pet.y + pet.height + gap },
    { x: pet.x + (pet.width - width) / 2, y: pet.y - height - gap },
  ].map(({ x, y }) => ({
    x: Math.round(clamp(x, area.x, area.x + area.width - width)),
    y: Math.round(clamp(y, area.y, area.y + area.height - height)), width, height,
  }));
  const overlap = (box) => Math.max(0, Math.min(box.x + width, pet.x + pet.width) - Math.max(box.x, pet.x))
    * Math.max(0, Math.min(box.y + height, pet.y + pet.height) - Math.max(box.y, pet.y));
  return candidates.reduce((best, box) => overlap(box) < overlap(best) ? box : best);
}

module.exports = { companionBounds };
