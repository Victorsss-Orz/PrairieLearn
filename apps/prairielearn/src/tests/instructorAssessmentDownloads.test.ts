import * as cheerio from 'cheerio';
import { parse as csvParse } from 'csv-parse/sync';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as helperExam from './helperExam.js';
import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';

const locals: Record<string, any> = {};

const assessmentPoints = 5;

describe('Instructor Assessment Downloads', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  let elemList, page;

  helperExam.startExam(locals);

  describe('1. grade correct answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.questions.addNumbers;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: assessmentPoints,
          instance_question_score_perc: (assessmentPoints / 5) * 100,
          assessment_instance_points: assessmentPoints,
          assessment_instance_score_perc: (assessmentPoints / helperExam.assessmentMaxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('2. GET to instructorAssessmentDownloads URL', function () {
    it('should succeed', async () => {
      locals.instructorAssessmentDownloadsUrl =
        locals.courseInstanceBaseUrl +
        '/instructor/assessment/' +
        locals.assessment_id +
        '/downloads';
      const res = await fetch(locals.instructorAssessmentDownloadsUrl);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should parse', function () {
      locals.$ = cheerio.load(page);
    });
  });

  describe('3. Check scores CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('scores.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['UID'], 'dev@example.com');
      assert.approximately(data[0]['Exam 1'], locals.assessment_instance.score_perc, 1e-6);
    });
  });

  describe('4. Check scoresByUsername CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('scores_by_username.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['Username'], 'dev');
      assert.approximately(data[0]['Exam 1'], locals.assessment_instance.score_perc, 1e-6);
    });
  });

  describe('5. Check points CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('points.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['UID'], 'dev@example.com');
      assert.approximately(data[0]['Exam 1'], locals.assessment_instance.points, 1e-6);
    });
  });

  describe('6. Check pointsByUsername CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('points_by_username.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['Username'], 'dev');
      assert.approximately(data[0]['Exam 1'], locals.assessment_instance.points, 1e-6);
    });
  });

  describe('7. Check instances CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('instances.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['UID'], 'dev@example.com');
      assert.equal(data[0]['Username'], 'dev');
      assert.equal(data[0]['Assessment'], 'Exam 1');
      assert.approximately(data[0]['Score (%)'], locals.assessment_instance.score_perc, 1e-6);
      assert.approximately(data[0]['Points'], locals.assessment_instance.points, 1e-6);
      assert.approximately(data[0]['Max points'], helperExam.assessmentMaxPoints, 1e-6);
    });
  });

  describe('8. Check instanceQuestions CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('instance_questions.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert(data.every((entry) => entry['UID'] === 'dev@example.com'));
      assert(data.every((entry) => entry['Assessment'] === 'Exam 1'));
      const questions = data.map((entry) => entry['Question']).sort();
      const expectedQuestions = helperExam.questionsArray.map((q) => q.qid);
      assert.deepEqual(questions, expectedQuestions);
    });
  });

  describe('9. Check submissionsForManualGrading CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('submissions_for_manual_grading.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['uid'], 'dev@example.com');
      assert.equal(data[0]['qid'], 'addNumbers');
    });
  });

  describe('10. Check allSubmissions CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('all_submissions.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['UID'], 'dev@example.com');
      assert.equal(data[0]['Assessment'], 'Exam 1');
      assert.equal(data[0]['Question'], 'addNumbers');
      assert.equal(data[0]['Correct'], 'TRUE');
    });
  });

  describe('11. Check finalSubmissions CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('final_submissions.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['UID'], 'dev@example.com');
      assert.equal(data[0]['Assessment'], 'Exam 1');
      assert.equal(data[0]['Question'], 'addNumbers');
      assert.equal(data[0]['Correct'], 'TRUE');
      assert.equal(data[0]['Max points'], 5);
      assert.equal(data[0]['Question % score'], 100);
    });
  });

  describe('12. Check bestSubmissions CSV file', function () {
    it('should have download link', function () {
      elemList = locals.$("a:contains('best_submissions.csv')");
      assert.lengthOf(elemList, 1);
    });
    it('should succeed to download', async () => {
      const res = await fetch(locals.siteUrl + elemList[0].attribs.href);
      assert.equal(res.status, 200);
      page = await res.text();
    });
    it('should contain correct data', function () {
      const data = csvParse<any>(page, { columns: true, cast: true });
      assert.equal(data[0]['UID'], 'dev@example.com');
      assert.equal(data[0]['Assessment'], 'Exam 1');
      assert.equal(data[0]['Question'], 'addNumbers');
      assert.equal(data[0]['Correct'], 'TRUE');
      assert.equal(data[0]['Max points'], 5);
      assert.equal(data[0]['Question % score'], 100);
    });
  });
});
