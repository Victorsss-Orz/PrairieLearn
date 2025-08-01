-- BLOCK select_assessment
SELECT
  a.id
FROM
  assessments AS a
WHERE
  a.tid = $assessment_tid;

-- BLOCK select_assessment_group_roles
SELECT
  gr.id,
  gr.role_name,
  gr.minimum,
  gr.maximum
FROM
  group_roles AS gr
WHERE
  gr.assessment_id = $assessment_id;

-- BLOCK select_all_assessment_instance
SELECT
  ai.*
FROM
  assessment_instances AS ai;

-- BLOCK select_instance_questions
SELECT
  iq.id
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (iq.assessment_question_id = aq.id)
  JOIN questions AS q ON (aq.question_id = q.id)
WHERE
  assessment_instance_id = $assessment_instance_id
  AND q.qid = $question_id;
