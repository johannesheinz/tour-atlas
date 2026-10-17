import { normalizeBandFile } from '../../src/data/normalize.ts';
import { SHOW_STATUSES, type DraftShow, type IdentifiedBandFile } from '../../src/data/types.ts';
import { addDays } from '../../src/data/dates.ts';
import { TAG_VOCABULARY } from '../../src/data/tags.ts';

const CITIES: readonly [city: string, countryCode: string, lat: number, lon: number][] = [
  ['Amsterdam', 'NL', 52.3676, 4.9041], ['Berlin', 'DE', 52.52, 13.405], ['Hamburg', 'DE', 53.5511, 9.9937],
  ['Copenhagen', 'DK', 55.6761, 12.5683], ['Stockholm', 'SE', 59.3293, 18.0686], ['Oslo', 'NO', 59.9139, 10.7522],
  ['Helsinki', 'FI', 60.1699, 24.9384], ['Warsaw', 'PL', 52.2297, 21.0122], ['Kraków', 'PL', 50.0647, 19.945],
  ['Prague', 'CZ', 50.0755, 14.4378], ['Vienna', 'AT', 48.2082, 16.3738], ['Munich', 'DE', 48.1351, 11.582],
  ['Zürich', 'CH', 47.3769, 8.5417], ['Milan', 'IT', 45.4642, 9.19], ['Paris', 'FR', 48.8566, 2.3522],
  ['London', 'GB', 51.5074, -0.1278], ['Manchester', 'GB', 53.4808, -2.2426], ['Glasgow', 'GB', 55.8642, -4.2518],
  ['Dublin', 'IE', 53.3498, -6.2603], ['Brussels', 'BE', 50.8503, 4.3517], ['Lisbon', 'PT', 38.7223, -9.1393],
  ['Madrid', 'ES', 40.4168, -3.7038], ['Barcelona', 'ES', 41.3874, 2.1686], ['Budapest', 'HU', 47.4979, 19.0402],
  ['Athens', 'GR', 37.9838, 23.7275], ['Istanbul', 'TR', 41.0082, 28.9784], ['Tokyo', 'JP', 35.6762, 139.6503],
  ['Osaka', 'JP', 34.6937, 135.5023], ['Seoul', 'KR', 37.5665, 126.978], ['Taipei', 'TW', 25.033, 121.5654],
  ['Sydney', 'AU', -33.8688, 151.2093], ['Melbourne', 'AU', -37.8136, 144.9631], ['Auckland', 'NZ', -36.8485, 174.7633],
  ['Los Angeles', 'US', 34.0522, -118.2437], ['San Francisco', 'US', 37.7749, -122.4194], ['Seattle', 'US', 47.6062, -122.3321],
  ['Chicago', 'US', 41.8781, -87.6298], ['New York', 'US', 40.7128, -74.006], ['Toronto', 'CA', 43.6532, -79.3832],
  ['Montréal', 'CA', 45.5017, -73.5673], ['Ciudad de México', 'MX', 19.4326, -99.1332], ['Bogotá', 'CO', 4.711, -74.0721],
  ['São Paulo', 'BR', -23.5505, -46.6333], ['Buenos Aires', 'AR', -34.6037, -58.3816], ['Santiago', 'CL', -33.4489, -70.6693],
  ['Johannesburg', 'ZA', -26.2041, 28.0473], ['Cape Town', 'ZA', -33.9249, 18.4241], ['Reykjavík', 'IS', 64.1466, -21.9426],
];

const WORDS = ['Iron', 'Glass', 'Static', 'Ember', 'Hollow', 'Velvet', 'Ashen', 'Northern', 'Salt', 'Black', 'Pale', 'Storm'];
const NOUNS = ['Harbor', 'Lantern', 'Choir', 'Meridian', 'Tide', 'Signal', 'Forge', 'Crown', 'Wolves', 'Engine', 'Archive'];
const GENRES = TAG_VOCABULARY.tags.filter((tag) => tag.group === 'genre').map((tag) => tag.id);
const LABELS = TAG_VOCABULARY.tags.filter((tag) => tag.group === 'label').map((tag) => tag.id);
const VENUE_WORDS = ['Hall', 'Club', 'Arena', 'Kantine', 'Loft', 'Werk', 'Garage', 'Theatre', 'Basement', 'Room'];

const round5 = (value: number) => Math.round(value * 1e5) / 1e5;

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic, valid band files with realistic field lengths for budget and performance checks. */
export function syntheticBands(bandCount: number, showsPerBand: number): IdentifiedBandFile[] {
  const random = createRandom(42);
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) throw new RangeError('cannot pick from an empty list');
    return item;
  };

  return Array.from({ length: bandCount }, (_, bandIndex) => {
    const name = `${pick(WORDS)} ${pick(NOUNS)} ${bandIndex + 1}`;
    const id = name.toLowerCase().replaceAll(' ', '-');
    const sourceUrl = `https://example.com/${id}/tour`;
    let date = addDays('2025-09-01', Math.floor(random() * 300));
    const shows: DraftShow[] = Array.from({ length: showsPerBand }, (_, showIndex) => {
      date = addDays(date, 1 + Math.floor(random() * 4));
      const [city, countryCode, lat, lon] = pick(CITIES);
      return {
        id: null,
        date,
        endDate: null,
        startTime: random() < 0.8 ? pick(['19:00', '19:30', '20:00', '20:30', '21:00']) : null,
        tourName: `${pick(WORDS)} ${pick(NOUNS)} Tour ${2025 + Math.floor(showIndex / 40)}`,
        eventName: random() < 0.05 ? `${pick(WORDS)} ${pick(NOUNS)} Festival` : null,
        venue: `${pick(WORDS)} ${pick(VENUE_WORDS)}`,
        city,
        region: null,
        countryCode,
        status: random() < 0.85 ? 'scheduled' : pick(SHOW_STATUSES),
        ticketUrl: random() < 0.7 ? `https://tickets.example.org/${id}/${date}-${showIndex}` : null,
        sourceUrl: random() < 0.1 ? `${sourceUrl}/${date}` : null,
        notes: random() < 0.05 ? 'Moved to a larger room' : null,
        geo: { lat: round5(lat + (random() - 0.5) * 0.05), lon: round5(lon + (random() - 0.5) * 0.05), precision: random() < 0.5 ? 'venue' : 'city', source: 'nominatim' },
      };
    });
    const tags = [pick(GENRES), ...(LABELS.length > 0 && random() < 0.3 ? [pick(LABELS)] : [])];
    return normalizeBandFile({ schemaVersion: 1, band: { id, name, color: null, tags, logoUrl: null }, source: { url: sourceUrl, retrievedAt: '2026-10-01' }, shows });
  });
}
