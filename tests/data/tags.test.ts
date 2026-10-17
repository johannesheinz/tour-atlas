import { describe, expect, it } from 'vitest';
import { TAG_VOCABULARY, TagVocabularyError, matchesTagFilter, parseTagVocabulary, sortTags } from '../../src/data/tags.ts';
import { readJson } from '../helpers.ts';

describe('tag vocabulary', () => {
  it('loads data/tags.json', () => {
    expect(TAG_VOCABULARY.groups.map((group) => group.id)).toEqual(['genre', 'region', 'label', 'other']);
    expect(TAG_VOCABULARY.byId.get('doom-metal')?.label).toBe('Doom metal');
  });

  it('matches the enum in the schema', () => {
    const schema = readJson('schema/tour.schema.json') as { $defs: { band: { properties: { tags: { items: { enum: string[] } } } } } };
    expect(schema.$defs.band.properties.tags.items.enum).toEqual(TAG_VOCABULARY.tags.map((tag) => tag.id));
  });

  it('reports every problem in a broken vocabulary', () => {
    const broken = {
      schemaVersion: 1,
      groups: [{ id: 'genre', label: 'Genre' }],
      tags: [
        { id: 'Doom Metal', label: 'Doom', group: 'genre' },
        { id: 'polka', label: 'Polka', group: 'dance' },
        { id: 'polka', label: 'Polka', group: 'genre' },
      ],
    };
    expect(() => parseTagVocabulary(broken)).toThrow(TagVocabularyError);
    expect(() => parseTagVocabulary(broken)).toThrow(/tags\[0\]\.id must be a lowercase slug[\s\S]*tags\[1\]\.group "dance"[\s\S]*tags\[2\]\.id "polka" is used twice/);
  });

  it('sorts tags by group, then as listed', () => {
    expect(sortTags(['oceania', 'post-rock', 'nordic', 'black-metal'])).toEqual(['black-metal', 'post-rock', 'nordic', 'oceania']);
  });

  it('filters with OR inside a group and AND across groups', () => {
    const band = ['post-rock', 'nordic'];
    expect(matchesTagFilter(band, new Set())).toBe(true);
    expect(matchesTagFilter(band, new Set(['post-rock', 'shoegaze']))).toBe(true);
    expect(matchesTagFilter(band, new Set(['post-rock', 'oceania']))).toBe(false);
    expect(matchesTagFilter(band, new Set(['shoegaze']))).toBe(false);
  });
});
