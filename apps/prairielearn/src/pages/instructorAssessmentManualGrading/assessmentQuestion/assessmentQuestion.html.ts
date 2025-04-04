import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.html.js';
import { Modal } from '../../../components/Modal.html.js';
import { PageLayout } from '../../../components/PageLayout.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../../components/SyncErrorsAndWarnings.html.js';
import {
  compiledScriptTag,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../../lib/assets.js';
import type { User } from '../../../lib/db-types.js';

import { type InstanceQuestionTableData } from './assessmentQuestion.types.js';

export function AssessmentQuestion({
  resLocals,
  courseStaff,
  aiGradingEnabled,
}: {
  resLocals: Record<string, any>;
  courseStaff: User[];
  aiGradingEnabled: boolean;
}) {
  const {
    number_in_alternative_group,
    urlPrefix,
    assessment,
    assessment_set,
    question,
    __csrf_token,
    authz_data,
    assessment_question,
    num_open_instances,
    course_instance,
    course,
  } = resLocals;

  return PageLayout({
    resLocals,
    pageTitle: 'Manual Grading',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'manual_grading',
    },
    options: {
      fullWidth: true,
      pageNote: `Question ${number_in_alternative_group}`,
    },
    headContent: html`
      <!-- Importing javascript using <script> tags as below is *not* the preferred method, it is better to directly use 'import'
        from a javascript file. However, bootstrap-table is doing some hacky stuff that prevents us from importing it that way. -->
      <script src="${nodeModulesAssetPath('bootstrap-table/dist/bootstrap-table.min.js')}"></script>
      <script src="${nodeModulesAssetPath(
          'bootstrap-table/dist/extensions/auto-refresh/bootstrap-table-auto-refresh.js',
        )}"></script>
      <script src="${nodeModulesAssetPath(
          'bootstrap-table/dist/extensions/filter-control/bootstrap-table-filter-control.min.js',
        )}"></script>

      ${compiledScriptTag('bootstrap-table-sticky-header.js')}
      ${compiledScriptTag('instructorAssessmentManualGradingAssessmentQuestionClient.ts')}
      ${compiledStylesheetTag('instructorAssessmentManualGradingAssessmentQuestion.css')}
      ${EncodedData<InstanceQuestionTableData>(
        {
          hasCourseInstancePermissionEdit: !!authz_data.has_course_instance_permission_edit,
          urlPrefix,
          instancesUrl: `${urlPrefix}/assessment/${assessment.id}/manual_grading/assessment_question/${assessment_question.id}/instances.json`,
          maxPoints: assessment_question.max_points,
          groupWork: assessment.group_work,
          maxAutoPoints: assessment_question.max_auto_points,
          aiGradingEnabled,
          courseStaff,
          csrfToken: __csrf_token,
        },
        'instance-question-table-data',
      )}
    `,
    content: html`
      ${AssessmentSyncErrorsAndWarnings({
        authz_data,
        assessment,
        courseInstance: course_instance,
        course,
        urlPrefix,
      })}
      ${AssessmentOpenInstancesAlert({
        numOpenInstances: num_open_instances,
        assessmentId: assessment.id,
        urlPrefix,
      })}

      <a
        class="btn btn-primary mb-2"
        href="${urlPrefix}/assessment/${assessment.id}/manual_grading"
      >
        <i class="fas fa-arrow-left"></i>
        Back to ${assessment_set.name} ${assessment.number} Overview
      </a>
      ${aiGradingEnabled
        ? Modal({
            title: 'AI Grading',
            id: 'aiGradingModal',
            body: html`
              <style>
                #hiddenDiv {
                  display: none;
                  margin-top: 10px;
                  padding: 10px;
                }

                .toggleText {
                  color: blue;
                  text-decoration: underline;
                  cursor: pointer;
                }
              </style>
              <p>Current submissions: xxx</p>
              <p>Current instructor graded submissions: xxx</p>

              <p><span class="toggleText" onclick="toggleDiv(this)">More options</span></p>

              <div id="hiddenDiv">
                <label for="num-examples">Number of examples (between 0 and 10):</label>
                <input type="number" id="num-examples" min="0" max="10" value="5" />
                <hr style="height:2px; visibility:hidden; margin-bottom:-1px;" />
                <label for="openai-api-key">OpenAI API key (leave blank to use PL API):</label>
                <input id="openai-api-key" size="64" />
                <hr style="height:2px; visibility:hidden; margin-bottom:-1px;" />
                <label for="openai-organization"
                  >OpenAI organization (leave blank to use PL API):</label
                >
                <input id="openai-organization" size="64" />
                <hr style="height:2px; visibility:hidden; margin-bottom:-1px;" />
                <p>Or some other customizable options</p>
              </div>

              <form name="start-ai-grading-test" method="POST" id="ai-grading-test">
                <input type="hidden" name="__action" value="ai_grade_assessment_test" />
                <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                <button type="submit" class="btn btn-primary">Test accuracy</button>
              </form>

              <script>
                function toggleDiv(span) {
                  var div = document.getElementById('hiddenDiv');
                  if (div.style.display === 'none' || div.style.display === '') {
                    div.style.display = 'block';
                    span.textContent = 'Less options';
                  } else {
                    div.style.display = 'none';
                    span.textContent = 'More options';
                  }
                }
              </script>
            `,
            footer: html`
              <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>

              <form name="start-ai-grading" method="POST" id="ai-grading">
                <input type="hidden" name="__action" value="ai_grade_assessment" />
                <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                <button type="submit" class="btn btn-success">Grade All</button>
              </form>
            `,
          })
        : ''}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h1>${assessment.tid} / Question ${number_in_alternative_group}. ${question.title}</h1>
        </div>
        <form name="grading-form" method="POST">
          <input type="hidden" name="__action" value="batch_action" />
          <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
          <table id="grading-table" aria-label="Instance questions for manual grading"></table>
        </form>
      </div>
    `,
    postContent: [GradingConflictModal()],
  });
}

function GradingConflictModal() {
  return Modal({
    id: 'grading-conflict-modal',
    title: 'Grading conflict detected',
    body: html`<p>Another grader has already graded this submission.</p>`,
    footer: html`
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Dismiss</button>
      <a class="btn btn-primary conflict-details-link" href="/">See details</a>
    `,
  });
}
