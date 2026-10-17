import { readFileSync, writeFileSync } from 'node:fs';
import { TAG_VOCABULARY } from '../src/data/tags.ts';
import { parseArguments, runCli } from './lib/files.ts';

const USAGE = `Usage: node tools/tags.ts [--check]

Copies the tag ids from data/tags.json into the band.tags enum of schema/tour.schema.json,
so the schema handed to the upstream LLM only allows known tags.

  --check   change nothing; exit 1 if the schema is out of date`;

const SCHEMA_PATH = 'schema/tour.schema.json';

runCli(USAGE, () => {
  const args = parseArguments(process.argv.slice(2), ['check'], []);
  const text = readFileSync(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(text) as { $defs: { band: { properties: { tags: { items: { enum: string[] } } } } } };
  schema.$defs.band.properties.tags.items.enum = TAG_VOCABULARY.tags.map((tag) => tag.id);
  const updated = `${JSON.stringify(schema, null, 2)}\n`;
  if (updated === text) {
    console.log(`${SCHEMA_PATH} lists all ${TAG_VOCABULARY.tags.length} tags`);
    return 0;
  }
  if (args.flags.has('check')) {
    console.error(`ERROR ${SCHEMA_PATH} does not match data/tags.json; run "npm run tags"`);
    return 1;
  }
  writeFileSync(SCHEMA_PATH, updated);
  console.log(`WROTE ${SCHEMA_PATH} with ${TAG_VOCABULARY.tags.length} tags`);
  return 0;
});
