import { S3 } from '@aws-sdk/client-s3';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fetch from 'node-fetch';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { makeS3ClientConfig } from '../../lib/aws.js';
import { config } from '../../lib/config.js';
import { WorkspaceHostSchema, WorkspaceSchema } from '../../lib/db-types.js';

import {
  type WorkspaceLogRow,
  WorkspaceLogRowSchema,
  WorkspaceLogs,
  WorkspaceVersionLogs,
} from './workspaceLogs.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * Given a list of workspace logs for a specific version sorted by date in
 * ascending order, checks if the logs are considered expired.
 */
function areContainerLogsExpired(workspaceLogs: WorkspaceLogRow[]): boolean {
  if (config.workspaceLogsExpirationDays === null) {
    // Expiration is disabled.
    return false;
  }

  if (workspaceLogs.length === 0) return false;
  const firstLog = workspaceLogs[0];
  // @ts-expect-error -- We need to mark `workspace_logs.date` as non-nullable.
  return firstLog.date < config.workspaceLogsExpirationDays * 24 * 60 * 60 * 1000;
}

function areContainerLogsEnabled() {
  return config.workspaceLogsS3Bucket !== null;
}

/**
 * Loads all the logs for a given workspace version.
 *
 * The logs for the current running version, if any, are fetched from the
 * workspace host directly. We also load all the logs for the given version
 * from S3. Together, this gives us all the logs for the given version.
 */
async function loadLogsForWorkspaceVersion(
  workspaceId: string,
  version: string | number,
): Promise<string | null> {
  // Safety check for TypeScript.
  if (!config.workspaceLogsS3Bucket) return null;

  // Get the current workspace version.
  const workspace = await sqldb.queryRow(
    sql.select_workspace,
    {
      workspace_id: workspaceId,
      version,
    },
    z.object({
      is_current_version: z.boolean(),
      hostname: WorkspaceHostSchema.shape.hostname,
      state: WorkspaceSchema.shape.state,
      version: WorkspaceSchema.shape.version,
    }),
  );

  const logParts: string[] = [];

  // Load the logs from S3. When workspaces are rebooted, we write the logs to
  // an object before shutting down the container. This means that we may have
  // multiple objects for each container. Load all of them. The objects are keyed
  // such that they are sorted by date, so we can just load them in order.
  const s3Client = new S3(makeS3ClientConfig({ maxAttempts: 3 }));
  const logItems = await s3Client.listObjectsV2({
    Bucket: config.workspaceLogsS3Bucket,
    Prefix: `${workspaceId}/${version}/`,
    MaxKeys: 1000,
  });

  // Load all parts serially to avoid hitting S3 rate limits.
  for (const item of logItems.Contents ?? []) {
    // This should never happen, but the AWS SDK types annoyingly list this as
    // possible undefined.
    if (!item.Key) continue;

    const res = await s3Client.getObject({
      Bucket: config.workspaceLogsS3Bucket,
      Key: item.Key,
    });

    const body = await res.Body?.transformToString();
    if (body) {
      logParts.push(body);
    }
  }

  // If the current workspace version matches the requested version, we can
  // reach out to the workspace host directly to get the remaining logs. Otherwise,
  // they should have been flushed to S3 already.
  if (
    ['launching', 'running'].includes(workspace.state) &&
    workspace.is_current_version &&
    workspace.hostname
  ) {
    const res = await fetch(`http://${workspace.hostname}/`, {
      method: 'POST',
      body: JSON.stringify({ workspace_id: workspaceId, action: 'getLogs' }),
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      logParts.push(await res.text());
    }
  }

  return logParts.join('');
}

// Only instructors and admins can access these routes. We don't need to check
// if the instructor has access to the workspace (i.e., course instance student
// data view permission, or access to a workspace owned by the user); that's
// already been checked by the workspace authorization middleware.
router.use((await import('../../middlewares/authzHasCoursePreviewOrInstanceView.js')).default);

// Overview of workspace logs, including all state transitions and links to
// logs for individual versions.
router.get(
  '/',
  asyncHandler(async (_req, res, _next) => {
    const workspaceLogs = await sqldb.queryRows(
      sql.select_workspace_logs,
      {
        workspace_id: res.locals.workspace_id,
        workspace_version: null,
        display_timezone:
          res.locals.course_instance?.display_timezone ?? res.locals.course.display_timezone,
      },
      WorkspaceLogRowSchema,
    );
    res.send(WorkspaceLogs({ workspaceLogs, resLocals: res.locals }));
  }),
);

// All state transitions for a single workspace version, as well as the container
// output that's been stored in S3.
router.get(
  '/version/:version',
  asyncHandler(async (req, res, _next) => {
    const workspaceLogs = await sqldb.queryRows(
      sql.select_workspace_logs,
      {
        workspace_id: res.locals.workspace_id,
        workspace_version: req.params.version,
        display_timezone:
          res.locals.course_instance?.display_timezone ?? res.locals.course.display_timezone,
      },
      WorkspaceLogRowSchema,
    );
    const containerLogsEnabled = areContainerLogsEnabled();
    const containerLogsExpired = areContainerLogsExpired(workspaceLogs);

    let containerLogs: string | null = null;
    if (containerLogsEnabled && !containerLogsExpired) {
      containerLogs = await loadLogsForWorkspaceVersion(
        res.locals.workspace_id,
        req.params.version,
      );
    }

    res.send(
      WorkspaceVersionLogs({
        workspaceLogs,
        containerLogs,
        containerLogsEnabled,
        containerLogsExpired,
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
