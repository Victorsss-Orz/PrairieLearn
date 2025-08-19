import { z } from 'zod';

import {
  type Assessment,
  AssessmentInstanceSchema,
  type AssessmentQuestion,
  AssessmentQuestionSchema,
  GradingJobSchema,
  IdSchema,
  type InstanceQuestion,
  InstanceQuestionSchema,
  RubricGradingItemSchema,
  RubricGradingSchema,
  type RubricItem,
  RubricItemSchema,
  RubricSchema,
  type Submission,
  SubmissionSchema,
  VariantSchema,
} from './db-types.js';

// const historicalGradingJobDataSchema = z.object({
//   instance_question_id: IdSchema,
//   submission_id: IdSchema,
//   feedback: z.record(z.string(), z.any()).nullable(),
//   auto_points: z.number().nullable(),
//   manual_points: z.number().nullable(),
//   manual_rubric_grading_id: IdSchema.nullable(),
//   partial_scores: z.record(z.string(), z.any()).nullable(),
//   score: z.number().nullable(),
//   grading_method: z.enum(['Internal', 'External', 'Manual', 'AI']).nullable(), // What is null?
// });

const HistoricalDataSchema = z.object({
  assessment_instance: AssessmentInstanceSchema,
  instance_question: InstanceQuestionSchema.extend({
    variants: z.array(
      VariantSchema.extend({
        submissions: z.array(SubmissionSchema.extend({ grading_jobs: z.array(GradingJobSchema) })),
      }),
    ),
  }),
});

type HistoricalData = z.infer<typeof HistoricalDataSchema>;

export async function deleteGradingJobs(
  authn_user_id: string,
  assessment_question: AssessmentQuestion,
  assessment: Assessment,
  type: 'Exam' | 'Homework',
): Promise<void> {
  const max_manual_points_original = assessment_question.max_manual_points;
  const max_auto_points_original = assessment_question.max_auto_points; // Should it be not null now?
  const max_points_original = assessment_question.max_points;
  // First perform deletion here and return information on the remaining grading jobs

  // For each instance question, start with fresh history, and keep track of information needed for submission and instance question update
  // feedback (grading job), partial_scores (grading job), manual_rubric_grading_id (grading job)
  // score (grading job), score_perc (should be just points/max_points*100), correct (inferred), is_ai_graded (grading job)
  // points (should be just auto+manual), auto_points (grading job), manual_points (grading job)
  // max_points (submission), max_auto_points (submission), max_manual_points (submission)
  // instance_question.status? override_score? regradable?

  // Who should we use as the authn_user_id for the score update?
  // Do we use the person making the grading job deletion, or the auth_user_id of the last grading job?

  // *Important*: Update assessment/question/variant score log

  const data: HistoricalData[] = [];
  for (const { assessment_instance, instance_question } of data) {
    // clear data here
    // Might need to use all instance questions for accurate log tracking?
    instance_question.first_submission_score = null;
    for (const variant of instance_question.variants) {
      // clear data here
      for (const submission of variant.submissions) {
        // clear data here
        for (const grading_job of submission.grading_jobs) {
          submission.grading_requested_at = grading_job.grading_requested_at;
          // Assuming that for internal grading jobs this should be defined
          submission.modified_at = grading_job.grading_requested_at ?? new Date();
          if (grading_job.grading_method === 'Internal') {
            if (grading_job.grading_request_canceled_at || !grading_job.graded_at) {
              continue;
            }
            // There is no way to backtrace broken and format_errors based on grading jobs, skipping
            submission.graded_at = grading_job.graded_at;
            submission.modified_at = grading_job.graded_at;
            submission.gradable = grading_job.gradable;
            submission.partial_scores = grading_job.partial_scores;
            submission.score = grading_job.score;
            submission.v2_score = grading_job.v2_score;
            submission.correct = grading_job.score === null ? null : grading_job.score >= 1;
            submission.feedback = grading_job.feedback;
            variant.modified_at = grading_job.graded_at;
            if (grading_job.gradable) {
              // submission.score should be not null by now?
              if (type === 'Exam') {
                // instance_question.points_list should also be not null by now?
                const {
                  open,
                  status,
                  auto_points,
                  highest_submission_score,
                  current_value,
                  points_list,
                  variants_points_list,
                  max_auto_points,
                } = instanceQuestionPointsExam(
                  instance_question,
                  submission.score ?? 0,
                  max_auto_points_original,
                  max_manual_points_original,
                );
                const points = auto_points + (instance_question.manual_points ?? 0);
                instance_question.open = open;
                instance_question.status = status;
                instance_question.auto_points = auto_points;
                instance_question.points = points;
                instance_question.score_perc =
                  (points / (assessment_question.max_points ?? 1)) * 100;
                instance_question.highest_submission_score = highest_submission_score;
                instance_question.current_value = current_value;
                instance_question.points_list = points_list;
                instance_question.variants_points_list = variants_points_list;
                instance_question.number_attempts += 1;
              } else {
                const {
                  open,
                  status,
                  auto_points,
                  highest_submission_score,
                  current_value,
                  points_list,
                  variants_points_list,
                  max_auto_points,
                } = instanceQuestionPointsHomework(
                  instance_question,
                  assessment_question,
                  submission.score ?? 0,
                  max_auto_points_original,
                  max_manual_points_original,
                  assessment.constant_question_value ?? false,
                );
                const points = auto_points + (instance_question.manual_points ?? 0);
                instance_question.open = open;
                instance_question.status = status;
                instance_question.auto_points = auto_points;
                instance_question.points = points;
                instance_question.score_perc =
                  (points / (assessment_question.max_points ?? 1)) * 100;
                instance_question.highest_submission_score = highest_submission_score;
                instance_question.current_value = current_value;
                instance_question.points_list = points_list;
                instance_question.variants_points_list = variants_points_list;
                instance_question.number_attempts += 1;
              }
              instance_question.points = instance_question.manual_points ?? 0;
            } else {
              instance_question.status = 'invalid';
            }
          }
        }
      }
    }
  }
  return;
}

function instanceQuestionPointsExam(
  instance_question: InstanceQuestion,
  submission_score: number,
  max_auto_points_original: number | null,
  max_manual_points_original: number | null,
): {
  open: boolean;
  status: 'complete' | 'unanswered' | 'saved' | 'correct' | 'incorrect' | 'grading' | 'invalid';
  auto_points: number;
  highest_submission_score: number;
  current_value: number | null;
  points_list: number[];
  variants_points_list: (number | null)[];
  max_auto_points: number;
} {
  const max_auto_points = max_auto_points_original ?? 0;
  const max_manual_points = max_manual_points_original ?? 0;
  const points_list_original = instance_question.points_list_original ?? [];
  let auto_points =
    (instance_question.auto_points ?? instance_question.points ?? 0) +
    (points_list_original[instance_question.number_attempts + 1] - max_manual_points) *
      Math.max(0, submission_score - (instance_question.highest_submission_score ?? 0));
  if (
    submission_score >= 1 &&
    points_list_original[instance_question.number_attempts + 1] - max_manual_points ===
      max_auto_points
  ) {
    auto_points = max_auto_points;
  }

  const correct = submission_score >= 1;
  const complete =
    (correct && !max_manual_points) || (instance_question.points_list ?? []).length <= 1;

  const points_list: number[] = [];
  for (let i = 0; i < points_list_original.length - (instance_question.number_attempts + 1); i++) {
    const value = points_list_original[instance_question.number_attempts + i + 1]; // careful: JS arrays start at 0
    points_list[i] =
      (value - max_manual_points) * (1 - (instance_question.highest_submission_score ?? 0)) +
      max_manual_points;
  }

  return {
    open: !complete,
    status: complete ? 'complete' : correct ? 'correct' : 'incorrect',
    auto_points,
    highest_submission_score: Math.max(
      submission_score,
      instance_question.highest_submission_score ?? 0,
    ),
    current_value: complete ? (instance_question.points_list ?? [])[0] : null,
    points_list,
    variants_points_list: instance_question.variants_points_list,
    max_auto_points,
  };
}

function instanceQuestionPointsHomework(
  instance_question: InstanceQuestion,
  assessment_question: AssessmentQuestion,
  submission_score: number,
  max_auto_points_original: number | null,
  max_manual_points_original: number | null,
  constant_question_value: boolean,
): {
  open: boolean;
  status:
    | 'complete'
    | 'unanswered'
    | 'saved'
    | 'correct'
    | 'incorrect'
    | 'grading'
    | 'invalid'
    | null;
  auto_points: number;
  highest_submission_score: number;
  current_value: number | null;
  points_list: null;
  variants_points_list: (number | null)[];
  max_auto_points: number;
} {
  const max_auto_points = max_auto_points_original ?? 0;
  const max_manual_points = max_manual_points_original ?? 0;

  const correct = submission_score >= 1;
  let current_value = correct ? instance_question.current_value : assessment_question.init_points;

  const current_auto_value = (current_value ?? 0) - max_manual_points;
  const init_auto_points = (assessment_question.init_points ?? 0) - max_manual_points;

  const variants_points_list = instance_question.variants_points_list;
  const var_points_old = variants_points_list[variants_points_list.length - 1] ?? 0;
  const var_points_new = submission_score * current_auto_value;
  if (variants_points_list.length > 0 && var_points_old < init_auto_points) {
    if (var_points_old < var_points_new) {
      variants_points_list[variants_points_list.length - 1] = var_points_new;
    }
  } else {
    variants_points_list.push(var_points_new);
  }

  if (correct && !constant_question_value) {
    current_value =
      instance_question.current_value === null ||
      assessment_question.init_points === null ||
      assessment_question.max_points === null
        ? null
        : Math.min(
            instance_question.current_value + assessment_question.init_points,
            assessment_question.max_points,
          );
  }

  let auto_points = variants_points_list.reduce((acc: number, val) => acc + (val ?? 0), 0);
  auto_points = assessment_question.max_auto_points
    ? Math.min(auto_points, assessment_question.max_auto_points)
    : auto_points;

  return {
    open: true,
    status:
      auto_points >= assessment_question.max_auto_points &&
      assessment_question.max_manual_points === 0
        ? 'complete'
        : correct && instance_question.status !== 'complete'
          ? 'correct'
          : ['unanswered', 'saved'].includes(instance_question.status ?? '')
            ? 'incorrect'
            : instance_question.status,
    auto_points,
    highest_submission_score: Math.max(
      submission_score,
      instance_question.highest_submission_score ?? 0,
    ),
    current_value,
    points_list: null,
    variants_points_list: instance_question.variants_points_list,
    max_auto_points,
  };
}
