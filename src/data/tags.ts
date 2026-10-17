import vocabularyJson from '../../data/tags.json' with { type: 'json' };
import { SLUG_PATTERN } from './ids.ts';

export interface TagGroup {
  readonly id: string;
  readonly label: string;
}

export interface Tag {
  readonly id: string;
  readonly label: string;
  readonly group: string;
}

export interface TagVocabulary {
  readonly groups: readonly TagGroup[];
  readonly tags: readonly Tag[];
  readonly byId: ReadonlyMap<string, Tag>;
}

export class TagVocabularyError extends Error {}

const MAX_LABEL_LENGTH = 40;

/** Checks data/tags.json and reports every problem at once. */
export function parseTagVocabulary(json: unknown): TagVocabulary {
  const problems: string[] = [];
  const record = (value: unknown, where: string): Record<string, unknown> | null => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
    problems.push(`${where} must be an object`);
    return null;
  };
  const list = (value: unknown, where: string): unknown[] => {
    if (Array.isArray(value)) return value;
    problems.push(`${where} must be a list`);
    return [];
  };
  const slug = (value: unknown, where: string): string | null => {
    if (typeof value === 'string' && SLUG_PATTERN.test(value)) return value;
    problems.push(`${where} must be a lowercase slug like "doom-metal"`);
    return null;
  };
  const label = (value: unknown, where: string): string | null => {
    if (typeof value === 'string' && value.trim() !== '' && value.length <= MAX_LABEL_LENGTH) return value;
    problems.push(`${where} must be text of 1–${MAX_LABEL_LENGTH} characters`);
    return null;
  };

  const root = record(json, 'data/tags.json');
  if (root !== null && root['schemaVersion'] !== 1) problems.push('data/tags.json schemaVersion must be 1');

  const groups: TagGroup[] = [];
  list(root?.['groups'], 'groups').forEach((value, index) => {
    const item = record(value, `groups[${index}]`);
    const id = slug(item?.['id'], `groups[${index}].id`);
    const text = label(item?.['label'], `groups[${index}].label`);
    if (id === null || text === null) return;
    if (groups.some((group) => group.id === id)) problems.push(`groups[${index}].id "${id}" is used twice`);
    groups.push({ id, label: text });
  });

  const tags: Tag[] = [];
  list(root?.['tags'], 'tags').forEach((value, index) => {
    const item = record(value, `tags[${index}]`);
    const id = slug(item?.['id'], `tags[${index}].id`);
    const text = label(item?.['label'], `tags[${index}].label`);
    const group = slug(item?.['group'], `tags[${index}].group`);
    if (id === null || text === null || group === null) return;
    if (!groups.some((candidate) => candidate.id === group)) problems.push(`tags[${index}].group "${group}" is not one of the groups`);
    if (tags.some((tag) => tag.id === id)) problems.push(`tags[${index}].id "${id}" is used twice`);
    tags.push({ id, label: text, group });
  });

  if (problems.length > 0) throw new TagVocabularyError(`data/tags.json is invalid:\n${problems.join('\n')}`);
  return { groups, tags, byId: new Map(tags.map((tag) => [tag.id, tag])) };
}

export const TAG_VOCABULARY: TagVocabulary = parseTagVocabulary(vocabularyJson);

export function isKnownTag(id: string): boolean {
  return TAG_VOCABULARY.byId.has(id);
}

/** Canonical order: by group, then as listed in data/tags.json. */
export function sortTags(ids: readonly string[]): string[] {
  const position = (id: string) => {
    const tag = TAG_VOCABULARY.byId.get(id);
    if (tag === undefined) throw new TagVocabularyError(`unknown tag "${id}"`);
    const groupIndex = TAG_VOCABULARY.groups.findIndex((group) => group.id === tag.group);
    return groupIndex * TAG_VOCABULARY.tags.length + TAG_VOCABULARY.tags.indexOf(tag);
  };
  return ids.toSorted((a, b) => position(a) - position(b));
}

/** A filter value, not a tag: bands without any genre tag. */
export const NO_GENRE = 'no-genre';
const GENRE_GROUP = 'genre';

export function hasGenre(bandTags: readonly string[]): boolean {
  return bandTags.some((id) => TAG_VOCABULARY.byId.get(id)?.group === GENRE_GROUP);
}

/** Any selected tag within a group matches; every group with a selection must match. NO_GENRE counts as a genre. */
export function matchesTagFilter(bandTags: readonly string[], filter: ReadonlySet<string>): boolean {
  if (filter.size === 0) return true;
  const selectedByGroup = Map.groupBy(
    [...filter].flatMap((id) => (id === NO_GENRE ? [{ id, group: GENRE_GROUP }] : (TAG_VOCABULARY.byId.get(id) ?? []))),
    (tag) => tag.group,
  );
  return [...selectedByGroup.values()].every((selected) => selected.some((tag) => (tag.id === NO_GENRE ? !hasGenre(bandTags) : bandTags.includes(tag.id))));
}
