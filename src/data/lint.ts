import { GEOMETRY_PARENTS } from './countries.ts';
import type { CountryLocator } from './countryLocator.ts';
import { daysBetween } from './dates.ts';
import { slugify } from './ids.ts';
import type { BandFileOf, IdentifiedShow } from './types.ts';
import type { IssueDetail } from './issues.ts';
import { issue, makeIssue, type ValidationIssue } from './validate.ts';

export interface LintOptions {
  readonly today: string;
  /** Null skips the country check (e.g. where no topology is loaded). */
  readonly locateCountry: CountryLocator | null;
}

export const LINT_THRESHOLDS = {
  sameDayDistanceKm: 100,
  staleSourceDays: 90,
  farFutureDays: 3 * 365,
  /** About 5 km: the 1:50m country outlines are this coarse, so border towns get the benefit of the doubt. */
  borderToleranceDegrees: 0.05,
} as const;

const EARTH_RADIUS_KM = 6371;

/** Plausibility warnings for a valid file. They never block a merge; they point reviewers at likely mistakes. */
export function lintBandFile(file: string, data: BandFileOf<IdentifiedShow>, options: LintOptions): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  const warn = (path: string, detail: IssueDetail) => warnings.push(makeIssue(file, path, detail));

  const sourceAge = daysBetween(data.source.retrievedAt, options.today);
  if (sourceAge < 0) warn('source.retrievedAt', issue('sourceInFuture', {}));
  else if (sourceAge > LINT_THRESHOLDS.staleSourceDays) {
    warn('source.retrievedAt', issue('sourceStale', { days: sourceAge }));
  }

  const indexed = data.shows.map((show, index) => ({ show, index, path: `shows[${index}]` }));

  for (const { show, path } of indexed) {
    if (daysBetween(options.today, show.date) > LINT_THRESHOLDS.farFutureDays) {
      warn(`${path}.date`, issue('farFuture', {}));
    }
    if (show.geo !== null && options.locateCountry !== null) {
      const locate = options.locateCountry;
      const { lat, lon } = show.geo;
      const found = locate(lon, lat);
      const acceptable = [show.countryCode, ...(GEOMETRY_PARENTS[show.countryCode] ?? [])];
      const d = LINT_THRESHOLDS.borderToleranceDegrees;
      const nearby = [locate(lon + d, lat), locate(lon - d, lat), locate(lon, lat + d), locate(lon, lat - d)];
      const nearAcceptableBorder = nearby.some((country) => country !== null && acceptable.includes(country));
      if (found !== null && !acceptable.includes(found) && !nearAcceptableBorder) {
        warn(`${path}.geo`, issue('wrongCountry', { found, countryCode: show.countryCode }));
      }
    }
  }

  const byDate = Map.groupBy(indexed, ({ show }) => show.date);
  for (const sameDay of byDate.values()) {
    sameDay.forEach((current, position) => {
      for (const earlier of sameDay.slice(0, position)) {
        if (looksDuplicate(earlier.show, current.show)) {
          warn(current.path, issue('duplicateShow', { earlier: earlier.path }));
          continue;
        }
        const distance = distanceKm(earlier.show, current.show);
        const bothHappen = earlier.show.status !== 'cancelled' && current.show.status !== 'cancelled';
        const dayKnown = earlier.show.endDate === null && current.show.endDate === null;
        if (bothHappen && dayKnown && distance !== null && distance > LINT_THRESHOLDS.sameDayDistanceKm) {
          warn(`${current.path}.date`, issue('sameDayFarApart', { earlier: earlier.path, city: earlier.show.city, km: Math.round(distance) }));
        }
      }
    });
  }

  return warnings;
}

function looksDuplicate(a: IdentifiedShow, b: IdentifiedShow): boolean {
  const differentStartTimes = a.startTime !== null && b.startTime !== null && a.startTime !== b.startTime;
  return !differentStartTimes && slugify(a.city) === slugify(b.city) && (a.venue ?? '') === (b.venue ?? '') && a.countryCode === b.countryCode;
}

function distanceKm(a: IdentifiedShow, b: IdentifiedShow): number | null {
  if (a.geo === null || b.geo === null) return null;
  const toRadians = Math.PI / 180;
  const dLat = (b.geo.lat - a.geo.lat) * toRadians;
  const dLon = (b.geo.lon - a.geo.lon) * toRadians;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.geo.lat * toRadians) * Math.cos(b.geo.lat * toRadians) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
