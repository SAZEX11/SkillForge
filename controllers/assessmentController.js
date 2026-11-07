const model = require('../models/assessmentModel');
const scoring = require('../services/scoringService');
const GRACE_SECONDS = 30; // network latency allowance for answers saved near the deadline

const toId = (v) => (/^\d+$/.test(v) ? parseInt(v, 10) : null);

exports.list = async (req, res, next) => {
  try { res.render('assessment/list', { title: 'Assessments', assessments: await model.listPublished() }); }
  catch (err) { next(err); }
};

exports.detail = async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const assessment = id && await model.findPublished(id);
    if (!assessment) return next();
    res.render('assessment/detail', { title: assessment.title, assessment });
  } catch (err) { next(err); }
};

exports.start = async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const assessment = id && await model.findPublished(id);
    if (!assessment) return next();
    const userId = req.session.user.id;
    const active = await model.findActiveAttempt(userId, id);
    if (active) return res.redirect(`/attempts/${active.id}`); // resume (GET grades it if the time ran out)
    res.redirect(`/attempts/${await model.createAttempt(userId, assessment)}`);
  } catch (err) { next(err); }
};

exports.take = async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const attempt = id && await model.getAttempt(id, req.session.user.id);
    if (!attempt) return next();
    if (attempt.status !== 'in_progress') return res.redirect(`/attempts/${id}/result`);
    if (attempt.seconds_left <= 0) {
      await scoring.gradeAttempt(id, req.session.user.id);
      req.session.flash = { type: 'info', message: 'Time ran out, so your assessment was submitted automatically.' };
      return res.redirect(`/attempts/${id}/result`);
    }
    const questions = await model.getQuestions(id, attempt.assessment_id);
    res.render('assessment/engine', { title: attempt.title, attempt, questions, secondsLeft: Math.floor(attempt.seconds_left) });
  } catch (err) { next(err); }
};

exports.answer = async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const questionId = parseInt(req.body.question_id, 10);
    const optionId = parseInt(req.body.option_id, 10);
    const attempt = id && await model.getAttempt(id, req.session.user.id);
    if (!attempt) return res.status(404).json({ ok: false });
    if (attempt.status !== 'in_progress' || attempt.seconds_left < -GRACE_SECONDS) {
      return res.status(409).json({ ok: false, message: 'This attempt is closed.' });
    }
    if (!Number.isInteger(questionId) || !Number.isInteger(optionId)) return res.status(400).json({ ok: false });
    const saved = await model.saveAnswer(id, attempt.assessment_id, questionId, optionId);
    res.status(saved ? 200 : 400).json({ ok: saved });
  } catch (err) { next(err); }
};

exports.submit = async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const graded = id && await scoring.gradeAttempt(id, req.session.user.id);
    if (!graded) return next();
    req.session.flash = { type: 'success', message: 'Assessment submitted successfully.' };
    res.redirect(`/attempts/${id}/result`);
  } catch (err) { next(err); }
};

exports.result = async (req, res, next) => {
  try {
    const id = toId(req.params.id);
    const attempt = id && await model.getAttempt(id, req.session.user.id);
    if (!attempt) return next();
    if (attempt.status !== 'completed') return res.redirect(`/attempts/${id}`);
    const [breakdown, review] = await Promise.all([model.getBreakdown(id), model.getReview(id)]);
    const correct = review.filter((r) => r.is_correct).length;
    const weakest = breakdown.length ? breakdown[breakdown.length - 1] : null;
    const strongest = breakdown.length ? breakdown[0] : null;
    res.render('assessment/result', {
      title: 'Result', attempt, breakdown, review, correct, incorrect: review.length - correct,
      level: scoring.classify(attempt.score), strongest, weakest,
      minutes: Math.floor(attempt.seconds_taken / 60), seconds: Math.round(attempt.seconds_taken % 60),
    });
  } catch (err) { next(err); }
};
