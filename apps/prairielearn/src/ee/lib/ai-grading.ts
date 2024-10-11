import * as cheerio from 'cheerio';
import { OpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryOneRowAsync,
  queryOptionalRow,
  queryRow,
  queryRows,
} from '@prairielearn/postgres';

import { config } from '../../lib/config.js';
import {
  InstanceQuestionSchema,
  SubmissionGradingContextEmbeddingSchema,
  SubmissionSchema,
  VariantSchema,
  Question,
  Course,
  AssessmentQuestion,
  SubmissionGradingContextEmbedding,
  IdSchema,
  InstanceQuestion,
  RubricItemSchema,
  RubricItem,
} from '../../lib/db-types.js';
import * as manualGrading from '../../lib/manualGrading.js';
import { buildQuestionUrls } from '../../lib/question-render.js';
import { getQuestionCourse } from '../../lib/question-variant.js';
import { createServerJob } from '../../lib/server-jobs.js';
import * as questionServers from '../../question-servers/index.js';

import { createEmbedding, vectorToString } from './contextEmbeddings.js';

const sql = loadSqlEquiv(import.meta.url);

const SubmissionVariantSchema = z.object({
  variant: VariantSchema,
  submission: SubmissionSchema,
});
const GPTGradeSchema = z.object({ grade: z.number(), feedback: z.string() });
// Current idea for rubric
const GPTRubricItemSchema = z.object({
  number: z.number(),
  description: z.string(),
  explanation: z.string(),
  selected: z.boolean(),
});
type GPTRubricItem = z.infer<typeof GPTRubricItemSchema>;
const GPTRubricGradeSchema = z.object({
  rubric_items: z.array(GPTRubricItemSchema),
  feedback: z.string(),
});
const GradedExampleSchema = z.object({
  submission_text: z.string(),
  score_perc: z.number(),
  instance_question_id: z.string(),
  manual_rubric_grading_id: z.string().nullable(),
});
type GradedExample = z.infer<typeof GradedExampleSchema>;

const AppliedRubricItemSchema = z.object({
  /** ID of the rubric item to be applied. */
  rubric_item_id: IdSchema,
  /** Score to be applied to the rubric item. Defaults to 1 (100%), i.e., uses the full points assigned to the rubric item. */
  score: z.coerce.number().nullish(),
});
type AppliedRubricItem = z.infer<typeof AppliedRubricItemSchema>;
function parseRubricItems({
  rubric_items,
  gpt_rubric_items,
}: {
  rubric_items: RubricItem[];
  gpt_rubric_items: GPTRubricItem[];
}): AppliedRubricItem[] {
  return [];
}

async function generateGPTPrompt({
  question_prompt,
  student_answer,
  example_submissions,
  rubric_items,
}: {
  question_prompt: string;
  student_answer: string;
  example_submissions: GradedExample[];
  rubric_items: RubricItem[];
}): Promise<
  {
    role: 'system' | 'user';
    content: string;
  }[]
> {
  const messages: {
    role: 'system' | 'user';
    content: string;
  }[] = [];

  // Instructions for grading
  if (rubric_items.length) {
    let rubric_info = '';
    for (const item of rubric_items) {
      rubric_info += `number: ${item.number}\ndescription: ${item.description}\nexplanation: ${item.explanation}\n\n`;
    }
    messages.push({
      role: 'system',
      content:
        'You are an instructor for a course, and you are grading assignments. You are provided several rubric items with the item number, item description (name), and item explanation. You must grade the assignment by using the rubric, by returning an array of these items, with an extra boolean parameter "selected" representing if the rubric item should be selected. You should also provide feedback on how to improve the answer. I will provide some example answers and their corresponding grades.',
    });
    messages.push({
      role: 'system',
      content: `Here is the rubric info:\n${rubric_info}`,
    });
  } else {
    messages.push({
      role: 'system',
      content:
        'You are an instructor for a course, and you are grading assignments. You should always return the grade using a json object of 2 parameters: grade and feedback. The grade should be an integer between 0 and 100. 0 being the lowest and 100 being the highest, and the feedback should be why you give this grade, or how to improve the answer. You can say correct or leave blank when the grade is close to 100. I will provide some example answers and their corresponding grades.',
    });
  }

  // Question prompt
  messages.push({
    role: 'user',
    content: `Question: \n${question_prompt}`,
  });

  // Examples
  for (const example of example_submissions) {
    if (rubric_items.length && example.manual_rubric_grading_id) {
      const rubric_grading_items = await queryRows(
        sql.select_rubric_grading_items,
        {
          maunal_rubric_grading_id: example.manual_rubric_grading_id,
        },
        RubricItemSchema,
      );
      let rubric_grading_info = '';
      for (const item of rubric_grading_items) {
        rubric_grading_info += `number: ${item.number}\ndescription: ${item.description}\nexplanation: ${item.explanation}\n\n`;
      }
      messages.push({
        role: 'user',
        content: `Example answer: \n${example.submission_text} \nRubric items to this example answer: \n${rubric_grading_info}`,
      });
    } else {
      messages.push({
        role: 'user',
        content: `Example answer: \n${example.submission_text} \nGrade to this example answer: \n${example.score_perc}`,
      });
    }
  }

  // Student answer
  messages.push({
    role: 'user',
    content: `Answer: \n${student_answer} \nHow would you grade this? Please return the json object.`,
  });
  return messages;
}

async function generateSubmissionEmbeddings({
  course,
  question,
  assessment_question,
  urlPrefix,
  openai,
}: {
  question: Question;
  course: Course;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  openai: OpenAI;
}): Promise<number> {
  const question_course = await getQuestionCourse(question, course);

  const result = await queryRows(
    sql.select_instance_questions_for_assessment_question,
    {
      assessment_question_id: assessment_question.id,
    },
    InstanceQuestionSchema,
  );

  let newEmbeddingsCount = 0;

  for (const instance_question of result) {
    const submission_id = await queryRow(
      sql.select_last_submission_id,
      { instance_question_id: instance_question.id },
      IdSchema,
    );
    const submission_embedding = await queryOptionalRow(
      sql.select_embedding_for_submission,
      { submission_id },
      SubmissionGradingContextEmbeddingSchema,
    );

    // Only recalculate embedding if it doesn't exist or if it requires a force update
    if (submission_embedding) {
      continue;
    }
    const { variant, submission } = await queryRow(
      sql.select_last_variant_and_submission,
      { instance_question_id: instance_question.id },
      SubmissionVariantSchema,
    );
    const urls = buildQuestionUrls(urlPrefix, variant, question, instance_question);
    const questionModule = questionServers.getModule(question.type);
    const render_submission_results = await questionModule.render(
      { question: false, submissions: true, answer: false },
      variant,
      question,
      submission,
      [submission],
      question_course,
      urls,
    );
    const $ = cheerio.load(render_submission_results.data.submissionHtmls[0], null, false);
    $('script').remove();
    const student_answer = $.html();
    const embedding = await createEmbedding(openai, student_answer, `course_${course.id}`);

    await queryOneRowAsync(sql.create_embedding_for_submission, {
      embedding: vectorToString(embedding),
      submission_id: submission.id,
      submission_text: student_answer,
      assessment_question_id: assessment_question.id,
    });

    newEmbeddingsCount++;
  }
  return newEmbeddingsCount;
}

async function ensureSubmissionEmbedding({
  submission_id,
  course,
  question,
  instance_question,
  urlPrefix,
  openai,
}: {
  submission_id: string;
  question: Question;
  course: Course;
  instance_question: InstanceQuestion;
  urlPrefix: string;
  openai: OpenAI;
}): Promise<SubmissionGradingContextEmbedding> {
  const submission_embedding = await queryOptionalRow(
    sql.select_embedding_for_submission,
    { submission_id },
    SubmissionGradingContextEmbeddingSchema,
  );
  // if the submission embedding already exists, return the embedding
  if (submission_embedding) {
    return submission_embedding;
  }
  const question_course = await getQuestionCourse(question, course);
  const { variant, submission } = await queryRow(
    sql.select_last_variant_and_submission,
    { instance_question_id: instance_question.id },
    SubmissionVariantSchema,
  );
  const urls = buildQuestionUrls(urlPrefix, variant, question, instance_question);
  const questionModule = questionServers.getModule(question.type);
  const render_submission_results = await questionModule.render(
    { question: false, submissions: true, answer: false },
    variant,
    question,
    submission,
    [submission],
    question_course,
    urls,
  );
  const $ = cheerio.load(render_submission_results.data.submissionHtmls[0], null, false);
  $('script').remove();
  const student_answer = $.html();
  const embedding = await createEmbedding(openai, student_answer, `course_${course.id}`);
  // insert new embedding into the table and return the new embedding
  const new_submission_embedding = await queryRow(
    sql.create_embedding_for_submission,
    {
      embedding: vectorToString(embedding),
      submission_id: submission.id,
      submission_text: student_answer,
      assessment_question_id: instance_question.assessment_question_id,
    },
    SubmissionGradingContextEmbeddingSchema,
  );
  return new_submission_embedding;
}

export async function aiGrade({
  course,
  course_instance_id,
  question,
  assessment_question,
  urlPrefix,
  authn_user_id,
  user_id,
}: {
  question: Question;
  course: Course;
  course_instance_id?: string;
  assessment_question: AssessmentQuestion;
  urlPrefix: string;
  authn_user_id: string;
  user_id: string;
}): Promise<string> {
  // if OpenAI API Key and Organization are not provided, throw error
  if (!config.openAiApiKey || !config.openAiOrganization) {
    throw new error.HttpStatusError(403, 'Not implemented (feature not available)');
  }
  const openai = new OpenAI({
    apiKey: config.openAiApiKey,
    organization: config.openAiOrganization,
  });

  const question_course = await getQuestionCourse(question, course);

  const serverJob = await createServerJob({
    courseId: course.id,
    courseInstanceId: course_instance_id,
    assessmentId: assessment_question.assessment_id,
    authnUserId: authn_user_id,
    userId: user_id,
    type: 'ai_grading',
    description: 'Use LLM to grade assessment question',
  });

  serverJob.executeInBackground(async (job) => {
    const result = await queryRows(
      sql.select_instance_questions_manual_grading,
      {
        assessment_question_id: assessment_question.id,
      },
      InstanceQuestionSchema,
    );

    const rubric_items = await queryRows(
      sql.select_rubric_for_grading,
      {
        assessment_question_id: assessment_question.id,
      },
      RubricItemSchema,
    );

    job.info('Checking for embeddings for all submissions.');
    const newEmbeddingsCount = await generateSubmissionEmbeddings({
      course,
      question,
      assessment_question,
      urlPrefix,
      openai,
    });
    job.info(`Calculated ${newEmbeddingsCount} embeddings.`);
    job.info(`Found ${result.length} submissions to grade!`);

    let error_count = 0;

    // Grade each instance question.
    for (const instance_question of result) {
      const { variant, submission } = await queryRow(
        sql.select_last_variant_and_submission,
        { instance_question_id: instance_question.id },
        SubmissionVariantSchema,
      );

      const urls = buildQuestionUrls(urlPrefix, variant, question, instance_question);

      // get question html
      const questionModule = questionServers.getModule(question.type);
      const render_question_results = await questionModule.render(
        { question: true, submissions: false, answer: false },
        variant,
        question,
        null,
        [],
        question_course,
        urls,
      );
      if (render_question_results.courseIssues.length) {
        job.info(render_question_results.courseIssues.toString());
        job.error('Error occurred');
        job.fail('Errors occurred while AI grading, see output for details');
      }
      const $ = cheerio.load(render_question_results.data.questionHtml, null, false);
      $('script').remove();
      const question_prompt = $.html();

      const submission_embedding = await ensureSubmissionEmbedding({
        submission_id: submission.id,
        course,
        question,
        instance_question,
        urlPrefix,
        openai,
      });
      const student_answer = submission_embedding.submission_text;

      const example_submissions = await queryRows(
        sql.select_closest_submission_info,
        {
          submission_id: submission.id,
          assessment_question_id: assessment_question.id,
          embedding: submission_embedding.embedding,
          limit: 5,
        },
        GradedExampleSchema,
      );
      let msg = `\nInstance question ${instance_question.id}\nGraded examples:`;
      for (const example of example_submissions) {
        msg += ` ${example.instance_question_id}`;
      }
      msg += '\n';

      const messages = await generateGPTPrompt({
        question_prompt,
        student_answer,
        example_submissions,
        rubric_items,
      });

      // const completion = await openai.beta.chat.completions.parse({
      //   messages,
      //   model: 'gpt-4o-2024-08-06',
      //   user: `course_${course.id}`,
      //   response_format: zodResponseFormat(GPTRubricGradeSchema, 'grades'),
      // });
      // msg += `Number of tokens used: ${completion.usage ? completion.usage.total_tokens : 0}\n`;
      // const grade_response = completion.choices[0].message;
      // msg += `Raw ChatGPT response:\n${grade_response.content}`;
      // console.log(grade_response.parsed);

      // try {
      //   msg += `Number of tokens used: ${completion.usage ? completion.usage.total_tokens : 0}\n`;
      //   const grade_response = completion.choices[0].message;
      //   msg += `Raw ChatGPT response:\n${grade_response.content}`;
      //   if (grade_response.parsed) {
      //     // TODO: MODIFY THIS
      //   const manual_rubric_data = {
      //   rubric_id: '',
      //   applied_rubric_items: parseRubricItems(rubric_items, grade_response.parsed.rubric_items),
      // };
      //     await manualGrading.updateInstanceQuestionScore(
      //       assessment_question.assessment_id,
      //       instance_question.id,
      //       submission.id,
      //       null, // modified_at
      //       {
      //         feedback: { manual: grade_response.parsed.feedback },
      //         manual_rubric_data,
      //         // NEXT STEPS: rubrics
      //       },
      //       user_id,
      //     );
      //     msg += `\nAI grades: ${grade_response.parsed.grade}`;
      //   } else if (grade_response.refusal) {
      //     job.error(`ERROR AI grading for ${instance_question.id}`);
      //     job.error(grade_response.refusal);
      //     error_count++;
      //   }
      // } catch (err) {
      //   job.error(`ERROR AI grading for ${instance_question.id}`);
      //   job.error(err);
      //   error_count++;
      // }
      // job.info(msg);

      const completion = await openai.beta.chat.completions.parse({
        messages,
        model: 'gpt-4o-2024-08-06',
        user: `course_${course.id}`,
        response_format: zodResponseFormat(GPTGradeSchema, 'grades'),
      });

      try {
        msg += `Number of tokens used: ${completion.usage ? completion.usage.total_tokens : 0}\n`;
        const grade_response = completion.choices[0].message;
        msg += `Raw ChatGPT response:\n${grade_response.content}`;
        if (grade_response.parsed) {
          await manualGrading.updateInstanceQuestionScore(
            assessment_question.assessment_id,
            instance_question.id,
            submission.id,
            null, // modified_at
            {
              score_perc: grade_response.parsed.grade,
              feedback: { manual: grade_response.parsed.feedback },
              // NEXT STEPS: rubrics
            },
            user_id,
          );
          msg += `\nAI grades: ${grade_response.parsed.grade}`;
        } else if (grade_response.refusal) {
          job.error(`ERROR AI grading for ${instance_question.id}`);
          job.error(grade_response.refusal);
          error_count++;
        }
      } catch (err) {
        job.error(`ERROR AI grading for ${instance_question.id}`);
        job.error(err);
        error_count++;
      }
      job.info(msg);
    }
    if (error_count > 0) {
      job.error('Number of errors: ' + error_count);
      job.fail('Errors occurred while AI grading, see output for details');
    }
  });

  return serverJob.jobSequenceId;
}
