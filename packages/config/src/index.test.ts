import { writeFile } from 'node:fs/promises';

import { withFile } from 'tmp-promise';
import { assert, describe, it } from 'vitest';
import { z } from 'zod';

import { ConfigLoader, makeFileConfigSource, makeLiteralConfigSource } from './index.js';

describe('config', () => {
  it('loads config with defaults', async () => {
    const schema = z.object({
      foo: z.string().nullable().default(null),
      bar: z.string().default('bar'),
    });
    const loader = new ConfigLoader(schema);

    await loader.loadAndValidate();

    assert.equal(loader.config.foo, null);
    assert.equal(loader.config.bar, 'bar');
  });

  it('loads config from a file', async () => {
    const schema = z.object({
      foo: z.string().optional().nullable(),
      bar: z.string().default('bar'),
      baz: z.string().default('baz'),
    });
    const loader = new ConfigLoader(schema);

    await withFile(async ({ path }) => {
      await writeFile(path, JSON.stringify({ foo: 'bar', bar: 'bar' }));
      await loader.loadAndValidate([makeFileConfigSource(path)]);
    });

    assert.equal(loader.config.foo, 'bar');
    assert.equal(loader.config.bar, 'bar');
    assert.equal(loader.config.baz, 'baz');
  });

  it('overrides deep objects', async () => {
    const schema = z.object({
      features: z.record(z.string(), z.boolean()).default({
        foo: true,
        bar: false,
      }),
    });
    const loader = new ConfigLoader(schema);

    await loader.loadAndValidate([
      makeLiteralConfigSource({
        features: {
          foo: false,
          baz: true,
        },
      }),
    ]);

    assert.equal(loader.config.features.foo, false);
    assert.equal(loader.config.features.bar, false);
    assert.equal(loader.config.features.baz, true);
  });

  it('replaces arrays', async () => {
    const schema = z.object({
      courseDirs: z
        .array(z.string())
        .default(['exampleCourse', '/course', '/course2', '/course3', '/course4', '/course5']),
    });
    const loader = new ConfigLoader(schema);

    await loader.loadAndValidate([
      makeLiteralConfigSource({
        courseDirs: ['testCourse', '/mycourse'],
      }),
    ]);

    assert.deepEqual(loader.config.courseDirs, ['testCourse', '/mycourse']);
  });

  it('maintains object identity when loading config', async () => {
    const schema = z.object({});
    const loader = new ConfigLoader(schema);
    const config = loader.config;

    await loader.loadAndValidate();

    assert.strictEqual(config, loader.config);
  });
});
