// A FIRST pass only: feedback.service.js re-checks every score and the comment
// length. The duplication is deliberate - this layer gives a good per-field 422
// to whoever is filling in the form, while the service guarantees the rule for
// every caller, including one that never passes through a route.

const { body, query } = require('express-validator');
const { COMMENT_MAX } = require('../services/feedback.service');

// All three are REQUIRED. "It was slow but the staff were kind" is a real and
// useful answer, and it only exists if each is asked separately - a single
// overall star would collapse it. The comment is what stays optional, since
// forcing prose is how a dataset fills up with "ok".
const starRule = (field, label) =>
  body(field)
    .exists({ values: 'falsy' })
    .withMessage(`${label} is required.`)
    .bail()
    .isInt({ min: 1, max: 5 })
    .withMessage(`${label} must be a rating from 1 to 5.`)
    .toInt();

const submitFeedbackRules = [
  starRule('rating_overall', 'Overall experience'),
  starRule('rating_speed', 'Speed'),
  starRule('rating_staff', 'Staff response'),
  body('comment').optional({ values: 'falsy' }).trim().isLength({ max: COMMENT_MAX })
    .withMessage(`Your comment is too long (limit ${COMMENT_MAX} characters).`),
];

const listFeedbackRules = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be 1 or more.'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
];

module.exports = { submitFeedbackRules, listFeedbackRules };
