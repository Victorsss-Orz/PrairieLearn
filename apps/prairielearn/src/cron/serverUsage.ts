import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { makeAwsClientConfig } from '../lib/aws.js';
import { config } from '../lib/config.js';

const ServerUsageStatsSchema = z.object({
  user_count: z.number().int(),
  page_views_per_second: z.number(),
  submissions_per_second: z.number(),
  internal_grading_jobs_per_second: z.number(),
  external_grading_jobs_per_second: z.number(),
  timestamp_formatted: z.string(),
});

export async function run() {
  if (!config.runningInEc2) return;

  const stats = await sqldb.callRow(
    'server_usage_current',
    [config.serverUsageIntervalSec],
    ServerUsageStatsSchema,
  );
  const dimensions = [{ Name: 'Server Group', Value: config.groupName }];
  const timestamp = new Date(stats.timestamp_formatted);

  const cloudwatch = new CloudWatch(makeAwsClientConfig());
  await cloudwatch.putMetricData({
    Namespace: 'PrairieLearn',
    MetricData: [
      {
        MetricName: 'UserCount',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count',
        Value: stats.user_count,
      },
      {
        MetricName: 'PageViewsPerSecond',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count/Second',
        Value: stats.page_views_per_second,
      },
      {
        MetricName: 'SubmissionsPerSecond',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count/Second',
        Value: stats.submissions_per_second,
      },
      {
        MetricName: 'InternalGradingJobsPerSecond',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count/Second',
        Value: stats.internal_grading_jobs_per_second,
      },
      {
        MetricName: 'ExternalGradingJobsPerSecond',
        Dimensions: dimensions,
        StorageResolution: 1,
        Timestamp: timestamp,
        Unit: 'Count/Second',
        Value: stats.external_grading_jobs_per_second,
      },
    ],
  });
}
