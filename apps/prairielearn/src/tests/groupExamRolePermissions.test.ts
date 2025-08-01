import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { AssessmentInstanceSchema, GroupRoleSchema, IdSchema, type User } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';

import { assertAlert } from './helperClient.js';
import * as helperServer from './helperServer.js';
import { switchUserAndLoadAssessment } from './utils/group.js';

const sql = loadSqlEquiv(import.meta.url);

const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceUrl = baseUrl + '/course_instance/1';

const storedConfig: any = {};

const GROUP_WORK_EXAM_TID = 'exam16-groupWorkRoles';
const QUESTION_ID_1 = 'demo/demoNewton-page1';
const QUESTION_ID_2 = 'demo/demoNewton-page2';
const QUESTION_ID_3 = 'addNumbers';
const GROUP_NAME = 'groupBB';

async function generateThreeStudentUsers() {
  const rows = await generateAndEnrollUsers({ count: 3, course_instance_id: '1' });
  assert.lengthOf(rows, 3);
  return rows;
}

/**
 * Creates a new group in the given assessment as the user with the given CSRF token
 */
async function createGroup(
  group_name: string,
  csrfToken: string,
  assessmentUrl: string,
): Promise<cheerio.CheerioAPI> {
  const res = await fetch(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __action: 'create_group',
      __csrf_token: csrfToken,
      group_name,
    }),
  });
  assert.isOk(res.ok);
  const $ = cheerio.load(await res.text());
  return $;
}

/**
 * Joins a group in an assessment using the provided join code as the user with the given CSRF token
 */
async function joinGroup(
  assessmentUrl: string,
  joinCode: string,
  csrfToken: string,
): Promise<cheerio.CheerioAPI> {
  const res = await fetch(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __action: 'join_group',
      __csrf_token: csrfToken,
      join_code: joinCode,
    }),
  });
  assert.isOk(res.ok);
  const $ = cheerio.load(await res.text());
  return $;
}

/**
 * Sends and verifies a group roles update request using current user.
 * Updates element list to check that group role select table is changed correctly.
 */
async function updateGroupRoles(
  roleUpdates: any[],
  groupRoles: any[],
  studentUsers: User[],
  csrfToken: string,
  assessmentUrl: string,
  $: cheerio.CheerioAPI,
): Promise<cheerio.CheerioAPI> {
  // Uncheck all of the inputs
  const roleIds = groupRoles.map((role) => role.id);
  const userIds = studentUsers.map((user) => user.user_id);
  for (const roleId of roleIds) {
    for (const userId of userIds) {
      const elementId = `#user_role_${roleId}-${userId}`;
      $('#role-select-form').find(elementId).removeAttr('checked');
    }
  }

  let checkedBoxes = $('#role-select-form').find('tr').find('input:checked');
  assert.lengthOf(checkedBoxes, 0, 'all checkboxes in role select form must be unchecked');

  // Mark the checkboxes as checked
  roleUpdates.forEach(({ roleId, groupUserId }) => {
    $(`#user_role_${roleId}-${groupUserId}`).attr('checked', '');
  });
  checkedBoxes = $('#role-select-form').find('tr').find('input:checked');
  assert.lengthOf(
    checkedBoxes,
    roleUpdates.length,
    'all checkboxes in role select form must be checked',
  );

  // Grab IDs of checkboxes to construct update request
  const checkedElementIds = {};
  for (let i = 0; i < checkedBoxes.length; i++) {
    checkedElementIds[checkedBoxes[i.toString()].attribs.id] = 'on';
  }
  const res = await fetch(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __action: 'update_group_roles',
      __csrf_token: csrfToken,
      ...checkedElementIds,
    }),
  });
  assert.isOk(res.ok, 'updating group roles should be successful');
  return cheerio.load(await res.text());
}

async function getQuestionUrl(
  courseInstanceUrl: string,
  assessmentInstanceId: string,
  questionId: string,
): Promise<string> {
  const id = await queryRow(
    sql.select_instance_questions,
    { assessment_instance_id: assessmentInstanceId, question_id: questionId },
    IdSchema,
  );
  return `${courseInstanceUrl}/instance_question/${id}`;
}

/**
 * Validates and prepares a role-based group assessment with three users in a
 * valid user configuration, then returns data for use in tests.
 */
async function prepareGroup() {
  // Get exam assessment URL using ids from database
  const assessmentId = await queryRow(
    sql.select_assessment,
    { assessment_tid: GROUP_WORK_EXAM_TID },
    IdSchema,
  );
  const assessmentUrl = courseInstanceUrl + '/assessment/' + assessmentId;

  // Generate three users
  const studentUsers = await generateThreeStudentUsers();

  // Get group roles
  const groupRoles = await queryRows(
    sql.select_assessment_group_roles,
    { assessment_id: assessmentId },
    GroupRoleSchema.pick({
      id: true,
      role_name: true,
      minimum: true,
      maximum: true,
    }),
  );
  assert.lengthOf(groupRoles, 4);

  const manager = groupRoles.find((row) => row.role_name === 'Manager');
  assert.isDefined(manager);
  const recorder = groupRoles.find((row) => row.role_name === 'Recorder');
  assert.isDefined(recorder);
  const reflector = groupRoles.find((row) => row.role_name === 'Reflector');
  assert.isDefined(reflector);
  const contributor = groupRoles.find((row) => row.role_name === 'Contributor');
  assert.isDefined(contributor);

  // As first user, create group, load the page, and check group information
  const { csrfToken: firstUserCsrfToken } = await switchUserAndLoadAssessment(
    studentUsers[0],
    assessmentUrl,
    'create-form',
  );
  let $ = await createGroup(GROUP_NAME, firstUserCsrfToken, assessmentUrl);
  const joinCode = $('#join-code').text();

  // Join group as second user
  const { csrfToken: secondUserCsrfToken } = await switchUserAndLoadAssessment(
    studentUsers[1],
    assessmentUrl,
    'joingroup-form',
  );
  await joinGroup(assessmentUrl, joinCode, secondUserCsrfToken);

  // Join group as third user
  const { csrfToken: thirdUserCsrfToken } = await switchUserAndLoadAssessment(
    studentUsers[2],
    assessmentUrl,
    'joingroup-form',
  );
  await joinGroup(assessmentUrl, joinCode, thirdUserCsrfToken);

  // Switch to first user and assign group roles
  const { $: $preJoinFirstUserPage } = await switchUserAndLoadAssessment(
    studentUsers[0],
    assessmentUrl,
    null,
    '#leaveGroupModal',
  );
  const validRoleConfig = [
    { roleId: manager?.id, groupUserId: studentUsers[0].user_id },
    { roleId: recorder?.id, groupUserId: studentUsers[1].user_id },
    { roleId: reflector?.id, groupUserId: studentUsers[2].user_id },
  ];
  $ = await updateGroupRoles(
    validRoleConfig,
    groupRoles,
    studentUsers,
    firstUserCsrfToken,
    assessmentUrl,
    $preJoinFirstUserPage,
  );

  // Start the assessment
  const response = await fetch(assessmentUrl, {
    method: 'POST',
    body: new URLSearchParams({
      __action: 'new_instance',
      __csrf_token: firstUserCsrfToken,
    }),
    follow: 1,
  });
  assert.isOk(response.ok);
  $ = cheerio.load(await response.text());

  // Check there is now one assessment instance in database
  const assessmentInstanceResult = await queryRow(
    sql.select_all_assessment_instance,
    AssessmentInstanceSchema,
  );
  assert.equal(assessmentInstanceResult.group_id, '1');
  const assessmentInstanceId = assessmentInstanceResult.id;

  return {
    assessmentInstanceUrl: courseInstanceUrl + '/assessment_instance/' + assessmentInstanceId,
    questionOneUrl: await getQuestionUrl(courseInstanceUrl, assessmentInstanceId, QUESTION_ID_1),
    questionTwoUrl: await getQuestionUrl(courseInstanceUrl, assessmentInstanceId, QUESTION_ID_2),
    questionThreeUrl: await getQuestionUrl(courseInstanceUrl, assessmentInstanceId, QUESTION_ID_3),
    groupRoles,
    manager,
    recorder,
    reflector,
    contributor,
    studentUsers,
    validRoleConfig,
  };
}

describe('Assessment instance with group roles & permissions - Exam', function () {
  describe('valid group role configuration tests', { timeout: 20_000 }, function () {
    beforeAll(helperServer.before(TEST_COURSE_PATH));

    beforeAll(function () {
      storedConfig.authUid = config.authUid;
      storedConfig.authName = config.authName;
      storedConfig.authUin = config.authUin;
    });

    afterAll(helperServer.after);

    afterAll(function () {
      Object.assign(config, storedConfig);
    });

    it('enforces correct permissions during valid group role configuration', async function () {
      const {
        assessmentInstanceUrl,
        questionOneUrl,
        questionTwoUrl,
        questionThreeUrl,
        studentUsers,
      } = await prepareGroup();
      const { $: $assessmentInstanceFirstUserPage } = await switchUserAndLoadAssessment(
        studentUsers[0],
        assessmentInstanceUrl,
        null,
        '#leaveGroupModal',
      );
      let $ = $assessmentInstanceFirstUserPage;

      // The second and third questions should not be viewable
      const lockedRows = $('tr [data-test-id="locked-instance-question-row"]');
      assert.lengthOf(lockedRows, 2);

      lockedRows.each((_, element) => {
        const popoverText = $(element).attr('data-bs-content');
        assert.strictEqual(
          popoverText,
          'Your current group role (Manager) restricts access to this question.',
        );
      });

      // The first question should be fully viewable with no errors'
      const questionOneFirstUserAccessResponse = await fetch(questionOneUrl);
      assert.isOk(questionOneFirstUserAccessResponse.ok);

      // The second and third questions should be inaccessible
      const questionTwoFirstUserAccessResponse = await fetch(questionTwoUrl);
      assert.isNotOk(questionTwoFirstUserAccessResponse.ok);

      const questionThreeFirstUserAccessResponse = await fetch(questionThreeUrl);
      assert.isNotOk(questionThreeFirstUserAccessResponse.ok);

      // Switch to third user and load first question
      const { $: $questionOneThirdUserPage } = await switchUserAndLoadAssessment(
        studentUsers[2],
        questionOneUrl,
        'attach-file-form',
      );
      $ = $questionOneThirdUserPage;

      // The "next question" button is disabled for unviewable questions
      const nextQuestionLink = $('#question-nav-next');
      assert.isUndefined(nextQuestionLink.attr('href'));

      const res = await fetch(questionThreeUrl);
      assert.isOk(res.ok);
      $ = cheerio.load(await res.text());

      // The "previous question" button is disabled for unviewable questions
      const prevQuestionLink = $('#question-nav-prev');
      assert.isUndefined(prevQuestionLink.attr('href'));

      // Save and grade button is not disabled with correct permission
      const { $: $questionOneSecondUserPage } = await switchUserAndLoadAssessment(
        studentUsers[1],
        questionOneUrl,
        'attach-file-form',
      );
      $ = $questionOneSecondUserPage;

      const secondUserSubmitButton = $('.question-grade');
      assert.isFalse(secondUserSubmitButton.is(':disabled'));

      // Save button is not disabled with correct permission
      const secondUserSaveButton = $('.question-save');
      assert.isFalse(secondUserSaveButton.is(':disabled'));

      // Switch to first user
      const { $: $questionOneFirstUserPage, csrfToken: questionOneFirstUserCsrfToken } =
        await switchUserAndLoadAssessment(studentUsers[0], questionOneUrl, 'attach-file-form');
      $ = $questionOneFirstUserPage;

      // Save and grade button should be disabled without correct permission
      const firstUserSubmitButton = $('.question-grade');
      assert.isTrue(firstUserSubmitButton.is(':disabled'));
      const popover = $('.btn[aria-label="Submission blocked"]');
      assert.lengthOf(popover, 1);
      const popoverContent = popover.attr('data-bs-content');
      assert.strictEqual(
        popoverContent,
        'Your group role (Manager) is not allowed to submit this question.',
      );

      // Save button should be disabled without correct permission
      const firstUserSaveButton = $('.question-save');
      assert.isTrue(firstUserSaveButton.is(':disabled'));

      // Get question variant
      const questionForm = $('.question-form input[name="__variant_id"]');
      assert.lengthOf(questionForm, 1);
      assert.nestedProperty(questionForm[0], 'attribs.value');
      const variantId = questionForm.first().attr('value');
      assert.isDefined(variantId);

      // Send request to save & grade question
      const questionSubmissionWithNoPermissionResponse = await fetch(questionOneUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token: questionOneFirstUserCsrfToken,
          __variant_id: variantId as string,
        }),
      });
      assert.equal(
        questionSubmissionWithNoPermissionResponse.status,
        403,
        'status should be forbidden',
      );

      // Submitting with valid permissions does not yield any errors'
      const { csrfToken: questionOneSecondtUserCsrfToken } = await switchUserAndLoadAssessment(
        studentUsers[1],
        questionOneUrl,
        'attach-file-form',
      );
      const questionSubmissionWithPermissionResponse = await fetch(questionOneUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token: questionOneSecondtUserCsrfToken,
          __variant_id: variantId as string,
        }),
      });
      assert.isOk(questionSubmissionWithPermissionResponse.ok);
    });
  });

  describe('invalid role configuration tests', { timeout: 20_000 }, function () {
    beforeAll(helperServer.before(TEST_COURSE_PATH));

    beforeAll(function () {
      storedConfig.authUid = config.authUid;
      storedConfig.authName = config.authName;
      storedConfig.authUin = config.authUin;
    });

    afterAll(helperServer.after);

    afterAll(function () {
      Object.assign(config, storedConfig);
    });

    it('shows correct errors during invalid group role configuration', async function () {
      const {
        assessmentInstanceUrl,
        questionOneUrl,
        validRoleConfig,
        studentUsers,
        manager,
        recorder,
        reflector,
        groupRoles,
      } = await prepareGroup();

      // Assign an invalid configuration
      const { $: $assessmentInstanceFirstUserPage, csrfToken } = await switchUserAndLoadAssessment(
        studentUsers[0],
        assessmentInstanceUrl,
        null,
        '#leaveGroupModal',
      );
      const invalidRoleConfig = [
        { roleId: manager?.id, groupUserId: studentUsers[0].user_id },
        { roleId: recorder?.id, groupUserId: studentUsers[0].user_id },
        { roleId: recorder?.id, groupUserId: studentUsers[1].user_id },
        { roleId: reflector?.id, groupUserId: studentUsers[2].user_id },
      ];
      let $ = await updateGroupRoles(
        invalidRoleConfig,
        groupRoles,
        studentUsers,
        csrfToken,
        assessmentInstanceUrl,
        $assessmentInstanceFirstUserPage,
      );

      // Assert the correct errors show up on screen
      let errorNotification = $('[data-testid="group-role-config-problems"]:contains(2)');
      assert.lengthOf(errorNotification, 1, 'role config should have 2 errors');
      assertAlert($, 'role configuration is currently invalid');
      assertAlert($, 'too many roles');
      assertAlert($, '1 less student needs to be assigned to the role "Recorder"');

      // Enter question one
      const res = await fetch(questionOneUrl);
      assert.isNotOk(res.ok);

      // Switch back to second user and load assessment instance
      const { $: assessmentInstanceSecondUserPage } = await switchUserAndLoadAssessment(
        studentUsers[1],
        assessmentInstanceUrl,
        null,
        '#leaveGroupModal',
      );
      $ = assessmentInstanceSecondUserPage;

      // Assert that the same errors still show
      errorNotification = $('[data-testid="group-role-config-problems"]:contains(2)');
      assert.lengthOf(errorNotification, 1, 'role config should have 2 errors');
      assertAlert($, 'role configuration is currently invalid');
      assertAlert($, 'too many roles');
      assertAlert($, '1 less student needs to be assigned to the role "Recorder"');

      // Switch back to first user and assign a valid role config
      const { $: $assessmentInstanceFirstUserPage2, csrfToken: firstUserCsrfToken2 } =
        await switchUserAndLoadAssessment(
          studentUsers[0],
          assessmentInstanceUrl,
          null,
          '#leaveGroupModal',
        );
      $ = await updateGroupRoles(
        validRoleConfig,
        groupRoles,
        studentUsers,
        firstUserCsrfToken2,
        assessmentInstanceUrl,
        $assessmentInstanceFirstUserPage2,
      );

      // Check that the errors no longer show
      errorNotification = $('[data-testid="group-role-config-problems"]');
      assert.lengthOf(errorNotification, 0, 'no error notification should appear');
      assertAlert($, 'role configuration is currently invalid', 0);
      assertAlert($, 'too many roles', 0);
      assertAlert($, '1 less student needs to be assigned to the role "Recorder"', 0);
    });
  });
});
