import { afterAll, assert, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { queryAsync } from '@prairielearn/postgres';

import { FeatureManager } from '../lib/features/manager.js';

import * as helperCourse from './helperCourse.js';
import * as helperDb from './helperDb.js';

describe('features', () => {
  beforeAll(async function () {
    await helperDb.before();
    await helperCourse.syncCourse();
    await queryAsync('INSERT INTO users (name, uid) VALUES ($name, $uid);', {
      name: 'Test User',
      uid: 'test@example.com',
    });
  });

  beforeEach(async () => {
    await queryAsync('DELETE FROM feature_grants', {});
  });

  afterAll(async function () {
    await helperDb.after();
  });

  it('enables and disables a global feature flag', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);

    await features.enable('test:example-feature-flag');
    assert.isTrue(await features.enabled('test:example-feature-flag'));
    assert.isTrue(await features.enabled('test:example-feature-flag', { institution_id: '1' }));
    assert.isTrue(await features.enabled('test:example-feature-flag', { user_id: '1' }));

    await features.disable('test:example-feature-flag');
    assert.isFalse(await features.enabled('test:example-feature-flag'));
  });

  it('enables and disables a feature flag for an institution', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);
    const context = { institution_id: '1' };

    await features.enable('test:example-feature-flag', context);
    assert.isTrue(await features.enabled('test:example-feature-flag', context));
    assert.isFalse(await features.enabled('test:example-feature-flag'));

    await features.disable('test:example-feature-flag', context);
    assert.isFalse(await features.enabled('test:example-feature-flag', context));
  });

  it('enables and disables a feature flag for a course', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);
    const context = { institution_id: '1', course_id: '1' };

    await features.enable('test:example-feature-flag', context);
    assert.isTrue(await features.enabled('test:example-feature-flag', context));
    assert.isFalse(await features.enabled('test:example-feature-flag'));

    await features.disable('test:example-feature-flag', context);
    assert.isFalse(await features.enabled('test:example-feature-flag', context));
  });

  it('enables and disables a feature flag for a course instance', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);
    const context = { institution_id: '1', course_id: '1', course_instance_id: '1' };

    await features.enable('test:example-feature-flag', context);
    assert.isTrue(await features.enabled('test:example-feature-flag', context));
    assert.isFalse(await features.enabled('test:example-feature-flag'));

    await features.disable('test:example-feature-flag', context);
    assert.isFalse(await features.enabled('test:example-feature-flag', context));
  });

  it('enables and disables a feature flag for a user', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);
    const context = { user_id: '1' };

    await features.enable('test:example-feature-flag', context);
    assert.isTrue(await features.enabled('test:example-feature-flag', context));

    await features.disable('test:example-feature-flag', context);
    assert.isFalse(await features.enabled('test:example-feature-flag', context));
  });

  it('enables and disables a feature flag for a user in a course instance', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);
    const context = { institution_id: '1', course_id: '1', course_instance_id: '1', user_id: '1' };

    await features.enable('test:example-feature-flag', context);
    assert.isTrue(await features.enabled('test:example-feature-flag', context));
    assert.isFalse(await features.enabled('test:example-feature-flag', { user_id: '1' }));

    await features.disable('test:example-feature-flag', context);
    assert.isFalse(await features.enabled('test:example-feature-flag', context));
    assert.isFalse(await features.enabled('test:example-feature-flag', { user_id: '1' }));
  });

  it('disables a feature for a specific context', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);

    await features.enable('test:example-feature-flag', { institution_id: '1' });
    await features.disable('test:example-feature-flag', { institution_id: '1', course_id: '1' });

    assert.isTrue(await features.enabled('test:example-feature-flag', { institution_id: '1' }));
    assert.isFalse(
      await features.enabled('test:example-feature-flag', {
        institution_id: '1',
        course_id: '1',
      }),
    );
    assert.isFalse(
      await features.enabled('test:example-feature-flag', {
        institution_id: '1',
        course_id: '1',
        course_instance_id: '1',
      }),
    );

    await features.enable('test:example-feature-flag', {
      institution_id: '1',
      course_id: '1',
      course_instance_id: '1',
    });

    assert.isTrue(
      await features.enabled('test:example-feature-flag', {
        institution_id: '1',
        course_id: '1',
        course_instance_id: '1',
      }),
    );
  });

  it('enables a feature flag via course options', async () => {
    const features = new FeatureManager(['test:example-feature-flag']);
    const context = { institution_id: '1', course_id: '1' };

    await queryAsync('UPDATE pl_courses SET options = $options WHERE id = 1', {
      options: {
        devModeFeatures: { 'test:example-feature-flag': true },
      },
    });
    assert.isTrue(await features.enabled('test:example-feature-flag', context));

    await queryAsync('UPDATE pl_courses SET options = $options WHERE id = 1', {
      options: {},
    });
    assert.isFalse(await features.enabled('test:example-feature-flag', context));
  });

  it('validates and typechecks feature flags', async () => {
    const features = new FeatureManager(['valid']);

    await expect(features.enable('valid')).resolves.not.toThrow();

    // @ts-expect-error -- Invalid feature flag name.
    await expect(features.enable('invalid')).rejects.toThrow();
  });
});
