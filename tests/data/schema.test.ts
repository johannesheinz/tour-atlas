import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import { BAND_FILE_KEYS, BAND_KEYS, GEO_KEYS, SHOW_KEYS, SOURCE_KEYS } from '../../src/data/types';
import { validateDraft } from '../../src/data/validate';
import { bandFilesIn, makeFile, readJson } from '../helpers';

const schema = readJson('schema/tour.schema.json') as Record<string, unknown> & { $defs: Record<string, { properties: object; required: string[] }> };
const ajv = new Ajv2020({ allErrors: true, strict: true });
const schemaAccepts = ajv.compile(schema);

/** Keywords accepted by both OpenAI strict mode and Anthropic structured outputs. */
const STRUCTURED_OUTPUT_KEYWORDS = new Set([
  '$schema', '$defs', '$ref', 'title', 'description', 'type', 'properties', 'required',
  'additionalProperties', 'items', 'enum', 'pattern', 'anyOf',
]);

function collectKeywords(node: unknown, keywords: Set<string>, insideProperties = false): void {
  if (typeof node !== 'object' || node === null) return;
  for (const [key, value] of Object.entries(node)) {
    if (!insideProperties) keywords.add(key);
    const childIsPropertyMap = !insideProperties && (key === 'properties' || key === '$defs');
    if (Array.isArray(value)) value.forEach((item) => collectKeywords(item, keywords));
    else collectKeywords(value, keywords, childIsPropertyMap);
  }
}

describe('tour.schema.json', () => {
  it('compiles as JSON Schema 2020-12', () => {
    expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it('uses only keywords that structured-output APIs accept', () => {
    const keywords = new Set<string>();
    collectKeywords(schema, keywords);
    expect([...keywords].filter((keyword) => !STRUCTURED_OUTPUT_KEYWORDS.has(keyword))).toEqual([]);
  });

  it('requires every property and forbids extra ones, as strict structured outputs demand', () => {
    const objects = [schema, ...Object.values(schema.$defs)] as { properties?: object; required?: string[]; additionalProperties?: boolean }[];
    for (const object of objects) {
      expect(object.additionalProperties).toBe(false);
      expect(object.required).toEqual(Object.keys(object.properties ?? {}));
    }
  });

  it('lists properties in the canonical key order used by normalize', () => {
    expect(Object.keys(schema['properties'] as object)).toEqual([...BAND_FILE_KEYS]);
    expect(Object.keys(schema.$defs['band']?.properties ?? {})).toEqual([...BAND_KEYS]);
    expect(Object.keys(schema.$defs['source']?.properties ?? {})).toEqual([...SOURCE_KEYS]);
    expect(Object.keys(schema.$defs['show']?.properties ?? {})).toEqual([...SHOW_KEYS]);
    expect(Object.keys(schema.$defs['geo']?.properties ?? {})).toEqual([...GEO_KEYS]);
  });

  it.each([...bandFilesIn('data/bands'), 'samples/draft/ashen-choir.json'])('accepts %s', (path) => {
    expect(schemaAccepts(readJson(path)), JSON.stringify(schemaAccepts.errors)).toBe(true);
  });

  it('rejects every row in the validator that the schema rejects', () => {
    const broken = readJson('samples/broken-lanterns.json') as { shows: unknown[] };
    for (const [index, row] of broken.shows.entries()) {
      const single = makeFile([row], 'broken-lanterns');
      const schemaOk = schemaAccepts(single);
      const validatorOk = validateDraft(single, 'broken-lanterns.json').issues.length === 0;
      if (!schemaOk) expect(validatorOk, `row ${index} passes the validator but not the schema`).toBe(false);
    }
  });
});
