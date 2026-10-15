// Catalog browsing never screens or approves a physical building location.
export function filterPlantLibrary(plants, { query = '', region = 'all', nativeOnly = false } = {}) {
  const terms = String(query).normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return plants.filter(plant => {
    const names = `${plant.commonNameZh} ${plant.commonNameEn} ${plant.scientificName}`.normalize('NFKC').toLocaleLowerCase();
    return terms.every(term => names.includes(term)) &&
      (region === 'all' || plant.applicationRegions.includes(region)) &&
      (!nativeOnly || plant.nativeToHongKong === true);
  });
}

export function plantSeasonLabel(plant) {
  const season = plant.seasonalInterest;
  if (!season) return 'Not recorded / 尚未收录';
  const kind = season.kind === 'leaf' ? 'Leaf colour / 叶色' : 'Floral interest / 花期观赏';
  return `${kind} · ${season.months.map(month => `${month}月`).join(', ')}`;
}
