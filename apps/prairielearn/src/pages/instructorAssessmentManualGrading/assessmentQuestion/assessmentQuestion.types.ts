import { z } from 'zod';

import { AIGradingStatsSchema } from '../../../ee/lib/ai-grading/types.js';
import { AssessmentQuestionSchema, InstanceQuestionSchema } from '../../../lib/db-types.js';

export const InstanceQuestionRowSchema = InstanceQuestionSchema.extend({
  assessment_open: z.boolean(),
  uid: z.string().nullable(),
  assigned_grader_name: z.string().nullable(),
  last_grader_name: z.string().nullable(),
  assessment_question: AssessmentQuestionSchema,
  user_or_group_name: z.string().nullable(),
  open_issue_count: z.number().nullable(),
});
export type InstanceQuestionRow = z.infer<typeof InstanceQuestionRowSchema>;

export const InstanceQuestionRowWithAIGradingStatsSchema = z.object({
  ...InstanceQuestionRowSchema.shape,
  ...AIGradingStatsSchema.shape,
});

export type InstanceQuestionRowWithAIGradingStats = z.infer<
  typeof InstanceQuestionRowWithAIGradingStatsSchema
>;

export interface InstanceQuestionTableData {
  hasCourseInstancePermissionEdit: boolean;
  urlPrefix: string;
  instancesUrl: string;
  groupWork: boolean;
  maxPoints: number | null;
  maxAutoPoints: number | null;
  aiGradingMode: boolean;
  csrfToken: string;
}
