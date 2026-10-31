import populationData from './populations-2026.json' with { type: 'json' };

// Numeric ISO 3166-1 IDs match the existing world-atlas geometry; code is alpha-2.
// All populations use the same Worldometer annual reference year (not live clocks).
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
  ['072', 'BW', 'Botswana', 'Africa'],
  ['188', 'CR', 'Costa Rica', 'North America'],
  ['192', 'CU', 'Cuba', 'North America'],
  ['218', 'EC', 'Ecuador', 'South America'],
  ['231', 'ET', 'Ethiopia', 'Africa'],
  ['246', 'FI', 'Finland', 'Europe'],
  ['288', 'GH', 'Ghana', 'Africa'],
  ['372', 'IE', 'Ireland', 'Europe'],
  ['528', 'NL', 'Netherlands', 'Europe'],
  ['586', 'PK', 'Pakistan', 'Asia'],
  ['598', 'PG', 'Papua New Guinea', 'Oceania'],
  ['616', 'PL', 'Poland', 'Europe'],
  ['682', 'SA', 'Saudi Arabia', 'Asia'],
  ['686', 'SN', 'Senegal', 'Africa'],
  ['756', 'CH', 'Switzerland', 'Europe'],
  ['834', 'TZ', 'Tanzania', 'Africa'],
  ['764', 'TH', 'Thailand', 'Asia'],
  ['704', 'VN', 'Vietnam', 'Asia'],
  ['894', 'ZM', 'Zambia', 'Africa'],
  ['643', 'RU', 'Russia', 'Europe', ['Russian Federation']],
  ['792', 'TR', 'Türkiye', 'Asia', ['Turkey', 'Turkiye']],
  ['364', 'IR', 'Iran', 'Asia'],
  ['180', 'CD', 'Democratic Republic of the Congo', 'Africa', ['DRC', 'DR Congo', 'Congo-Kinshasa', 'Democratic Republic of Congo']],
  ['012', 'DZ', 'Algeria', 'Africa'],
];
export const populationReference = {
  year: populationData.referenceYear,
  retrievedOn: populationData.retrievedOn,
  sourceUrl: populationData.sourceUrl,
};
export const countries = entries.map(([id, code, name, region, aliases = []]) => ({
  id, code, name, region, aliases,
  population: populationData.countries[name].population,
  populationYear: populationReference.year,
  populationSourceUrl: populationData.countries[name].sourceUrl,
})).sort((first, second) => first.name.localeCompare(second.name));
function normaliseSearch(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replaceAll('ı', 'i');
}
export function filterCountries(catalogue, query) {
  const term = normaliseSearch(query.trim());
  return catalogue.filter((country) =>
    normaliseSearch(`${country.name} ${country.code} ${country.region} ${(country.aliases ?? []).join(' ')}`).includes(term));
}
export function getCountryMetadata(id) {
  return countries.find((country) => country.id === id);
}
