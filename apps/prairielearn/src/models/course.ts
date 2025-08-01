import { exec } from 'child_process';
import { promisify } from 'util';

import { z } from 'zod';

import * as error from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryAsync,
  queryOptionalRow,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import { type Course, CourseSchema } from '../lib/db-types.js';

import { insertAuditLog } from './audit-log.js';

const sql = loadSqlEquiv(import.meta.url);

const CourseWithPermissionsSchema = CourseSchema.extend({
  permissions_course: z.object({
    course_role: z.enum(['None', 'Previewer', 'Viewer', 'Editor', 'Owner']),
    has_course_permission_own: z.boolean(),
    has_course_permission_edit: z.boolean(),
    has_course_permission_view: z.boolean(),
    has_course_permission_preview: z.boolean(),
  }),
});
export type CourseWithPermissions = z.infer<typeof CourseWithPermissionsSchema>;

export async function selectCourseById(course_id: string): Promise<Course> {
  return await queryRow(sql.select_course_by_id, { course_id }, CourseSchema);
}

export async function selectCourseByCourseInstanceId(course_instance_id: string): Promise<Course> {
  return await queryRow(sql.select_course_by_instance_id, { course_instance_id }, CourseSchema);
}

export function getLockNameForCoursePath(coursePath: string): string {
  return `coursedir:${coursePath}`;
}

export async function getCourseCommitHash(coursePath: string): Promise<string> {
  try {
    const { stdout } = await promisify(exec)('git rev-parse HEAD', {
      cwd: coursePath,
      env: process.env,
    });
    return stdout.trim();
  } catch (err) {
    throw new error.AugmentedError(`Could not get git status; exited with code ${err.code}`, {
      data: {
        stdout: err.stdout,
        stderr: err.stderr,
      },
    });
  }
}

/**
 * Loads the current commit hash from disk and stores it in the database. This
 * will also add the `commit_hash` property to the given course object.
 */
export async function updateCourseCommitHash(course: {
  id: string;
  path: string;
}): Promise<string> {
  const hash = await getCourseCommitHash(course.path);
  await queryAsync(sql.update_course_commit_hash, {
    course_id: course.id,
    commit_hash: hash,
  });
  return hash;
}

/**
 * If the provided course object contains a commit hash, that will be used;
 * otherwise, the commit hash will be loaded from disk and stored in the
 * database.
 *
 * This should only ever really need to happen at max once per course - in the
 * future, the commit hash will already be in the course object and will be
 * updated during course sync.
 */
export async function getOrUpdateCourseCommitHash(course: {
  id: string;
  path: string;
  commit_hash?: string | null;
}): Promise<string> {
  return course.commit_hash ?? (await updateCourseCommitHash(course));
}

/**
 * Returns all courses to which the given user has staff access.
 *
 * Note that this does not take into account any effective user overrides that
 * may be in place. It is the caller's responsibility to further restrict
 * the results if necessary.
 */
export async function selectCoursesWithStaffAccess({
  user_id,
  is_administrator,
}: {
  user_id: string;
  is_administrator: boolean;
}) {
  const courses = await queryRows(
    sql.select_courses_with_staff_access,
    { user_id, is_administrator },
    CourseWithPermissionsSchema,
  );
  return courses;
}

/**
 * Returns all courses to which the given user has edit access.
 *
 * Note that this does not take into account any effective user overrides that
 * may be in place. It is the caller's responsibility to further restrict
 * the results if necessary.
 */
export async function selectCoursesWithEditAccess({
  user_id,
  is_administrator,
}: {
  user_id: string;
  is_administrator: boolean;
}) {
  const courses = await selectCoursesWithStaffAccess({
    user_id,
    is_administrator,
  });
  return courses.filter((c) => c.permissions_course.has_course_permission_edit);
}

export async function selectOrInsertCourseByPath(coursePath: string): Promise<Course> {
  return await queryRow(sql.select_or_insert_course_by_path, { path: coursePath }, CourseSchema);
}

export async function deleteCourse({
  course_id,
  authn_user_id,
}: {
  course_id: string;
  authn_user_id: string;
}) {
  await runInTransactionAsync(async () => {
    const deletedCourse = await queryOptionalRow(sql.delete_course, { course_id }, CourseSchema);
    if (deletedCourse == null) {
      throw new Error('Course to delete not found');
    }
    await insertAuditLog({
      authn_user_id,
      action: 'soft_delete',
      table_name: 'pl_courses',
      row_id: course_id,
      new_state: deletedCourse,
      course_id,
      institution_id: deletedCourse.institution_id,
    });
  });
}

export async function insertCourse({
  institution_id,
  short_name,
  title,
  display_timezone,
  path,
  repository,
  branch,
  authn_user_id,
}: Pick<
  Course,
  'institution_id' | 'short_name' | 'title' | 'display_timezone' | 'path' | 'repository' | 'branch'
> & {
  authn_user_id: string;
}): Promise<Course> {
  return await runInTransactionAsync(async () => {
    const course = await queryRow(
      sql.insert_course,
      {
        institution_id,
        short_name,
        title,
        display_timezone,
        path,
        repository,
        branch,
      },
      CourseSchema,
    );
    await insertAuditLog({
      authn_user_id,
      action: 'insert',
      table_name: 'pl_courses',
      row_id: course.id,
      new_state: course,
      institution_id,
      course_id: course.id,
    });
    return course;
  });
}

/**
 * Update the `show_getting_started` column for a course.
 */
export async function updateCourseShowGettingStarted({
  course_id,
  show_getting_started,
}: {
  course_id: string;
  show_getting_started: boolean;
}) {
  await queryAsync(sql.update_course_show_getting_started, {
    course_id,
    show_getting_started,
  });
}

/**
 * Update the `sharing_name` column for a course.
 */
export async function updateCourseSharingName({ course_id, sharing_name }): Promise<void> {
  await queryAsync(sql.update_course_sharing_name, {
    course_id,
    sharing_name,
  });
}
