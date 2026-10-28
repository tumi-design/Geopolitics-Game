// Development fixtures, NOT verified demographic data. Every population is an
// explicit 10-million placeholder. Numeric ISO IDs match world-atlas geometry.
const entries = [
  ['032', 'AR', 'Argentina', 'South America'],
  ['036', 'AU', 'Australia', 'Oceania'],
  ['076', 'BR', 'Brazil', 'South America'],
  ['124', 'CA', 'Canada', 'North America'],
  ['152', 'CL', 'Chile', 'South America'],
  ['156', 'CN', 'China', 'Asia'],
  ['170', 'CO', 'Colombia', 'South America'],
  ['208', 'DK', 'Denmark', 'Europe'],
  ['818', 'EG', 'Egypt', 'Africa'],
  ['250', 'FR', 'France', 'Europe'],
  ['276', 'DE', 'Germany', 'Europe'],
  ['300', 'GR', 'Greece', 'Europe'],
  ['356', 'IN', 'India', 'Asia'],
  ['360', 'ID', 'Indonesia', 'Asia'],
  ['380', 'IT', 'Italy', 'Europe'],
  ['392', 'JP', 'Japan', 'Asia'],
  ['404', 'KE', 'Kenya', 'Africa'],
  ['484', 'MX', 'Mexico', 'North America'],
  ['504', 'MA', 'Morocco', 'Africa'],
  ['516', 'NA', 'Namibia', 'Africa'],
  ['554', 'NZ', 'New Zealand', 'Oceania'],
  ['566', 'NG', 'Nigeria', 'Africa'],
  ['578', 'NO', 'Norway', 'Europe'],
  ['604', 'PE', 'Peru', 'South America'],
  ['620', 'PT', 'Portugal', 'Europe'],
  ['710', 'ZA', 'South Africa', 'Africa'],
  ['410', 'KR', 'South Korea', 'Asia'],
  ['724', 'ES', 'Spain', 'Europe'],
  ['752', 'SE', 'Sweden', 'Europe'],
  ['826', 'GB', 'United Kingdom', 'Europe'],
  ['840', 'US', 'United States', 'North America'],
];
export const countries = entries.map(([id, code, name, region]) => ({
  id, code, name, region, population: 10_000_000,
}));
export function filterCountries(catalogue, query) {
  const term = query.trim().toLowerCase();
  return catalogue.filter((country) =>
    `${country.name} ${country.code} ${country.region}`.toLowerCase().includes(term));
}
export function getCountryMetadata(id) {
  return countries.find((country) => country.id === id);
}
