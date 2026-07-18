const { validationResult } = require('express-validator');

/**
 * Reads express-validator results and short-circuits with a 400
 * if there are any validation errors.
 * Place this after the validator chain and before the route handler.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

module.exports = validate;
