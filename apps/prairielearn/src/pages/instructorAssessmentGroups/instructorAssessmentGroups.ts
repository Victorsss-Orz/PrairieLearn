import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { GroupConfigSchema } from '../../lib/db-types.js';
import { randomGroups, uploadInstanceGroups } from '../../lib/group-update.js';
import {
  GroupOperationError,
  addUserToGroup,
  createGroup,
  deleteAllGroups,
  deleteGroup,
  leaveGroup,
} from '../../lib/groups.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';
import { parseUidsString } from '../../lib/user.js';

import {
  GroupUsersRowSchema,
  InstructorAssessmentGroups,
} from './instructorAssessmentGroups.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

/**
 * The maximum number of UIDs that can be provided in a single request.
 */
const MAX_UIDS = 50;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    const prefix = assessmentFilenamePrefix(
      res.locals.assessment,
      res.locals.assessment_set,
      res.locals.course_instance,
      res.locals.course,
    );
    const groupsCsvFilename = prefix + 'groups.csv';

    const groupConfigInfo = await sqldb.queryOptionalRow(
      sql.config_info,
      { assessment_id: res.locals.assessment.id },
      GroupConfigSchema,
    );

    if (!groupConfigInfo) {
      res.send(InstructorAssessmentGroups({ resLocals: res.locals }));
      return;
    }

    const groups = await sqldb.queryRows(
      sql.select_group_users,
      { group_config_id: groupConfigInfo.id },
      GroupUsersRowSchema,
    );

    const notAssigned = await sqldb.queryRows(
      sql.select_not_in_group,
      {
        group_config_id: groupConfigInfo.id,
        course_instance_id: groupConfigInfo.course_instance_id,
      },
      z.string(),
    );

    res.send(
      InstructorAssessmentGroups({
        resLocals: res.locals,
        groupsCsvFilename,
        groupConfigInfo,
        groups,
        notAssigned,
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }

    if (req.body.__action === 'upload_assessment_groups') {
      const job_sequence_id = await uploadInstanceGroups(
        res.locals.assessment.id,
        req.file,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else if (req.body.__action === 'random_assessment_groups') {
      const job_sequence_id = await randomGroups(
        res.locals.assessment.id,
        res.locals.user.user_id,
        res.locals.authn_user.user_id,
        Number(req.body.max_group_size),
        Number(req.body.min_group_size),
      );
      res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
    } else if (req.body.__action === 'delete_all') {
      await deleteAllGroups(res.locals.assessment.id, res.locals.authn_user.user_id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_group') {
      const assessment_id = res.locals.assessment.id;
      const group_name = req.body.group_name;

      await createGroup(
        group_name,
        assessment_id,
        parseUidsString(req.body.uids, MAX_UIDS),
        res.locals.authn_user.user_id,
      ).catch((err) => {
        if (err instanceof GroupOperationError) {
          flash('error', err.message);
        } else {
          throw err;
        }
      });

      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_member') {
      const assessment_id = res.locals.assessment.id;
      const group_id = req.body.group_id;
      for (const uid of parseUidsString(req.body.add_member_uids, MAX_UIDS)) {
        try {
          await addUserToGroup({
            assessment_id,
            group_id,
            uid,
            authn_user_id: res.locals.authn_user.user_id,
            enforceGroupSize: false, // Enforce group size limits (instructors can override limits)
          });
        } catch (err) {
          if (err instanceof GroupOperationError) {
            flash('error', `Failed to add the user ${uid}: ${err.message}`);
          } else {
            throw err;
          }
        }
      }
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_member') {
      const assessment_id = res.locals.assessment.id;
      const group_id = req.body.group_id;
      const user_id = req.body.user_id;
      await leaveGroup(assessment_id, user_id, res.locals.authn_user.user_id, group_id);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_group') {
      await deleteGroup(res.locals.assessment.id, req.body.group_id, res.locals.authn_user.user_id);
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
