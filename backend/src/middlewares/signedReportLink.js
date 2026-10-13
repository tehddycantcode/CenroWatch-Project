// Lets a resident's own report PDF be opened by a short-lived signed link, and
// otherwise behaves exactly as if it were not here.
//
// ADDITIVE BY CONSTRUCTION. With no `s=` in the query this hands straight to
// `authenticate`, so the web app - which opens the same URL with its session
// cookie - takes a byte-identical path to the one it took before this existed.
// Only a request that actually carries a signature is treated differently, and
// then only after the HMAC verifies.
//
// WHY A SIGNED LINK AT ALL: see utils/reportToken.js. The short version is that
// the phone's browser has neither the Bearer header nor the cookie, and the
// native module that would avoid needing a browser (expo-sharing) would change
// the EAS fingerprint and cut every installed APK off from OTA updates.
//
// WHAT THIS DOES NOT DO: it does not skip the ownership check. The signature
// carries the user it was minted for, this populates req.user from it, and the
// controller then runs the same service call - and the same 403 - that it runs
// for a cookie session. The signature decides WHO is asking, never WHAT they
// may have.

const prisma = require('../utils/prisma');
const authenticate = require('./authenticate');
const { verifyReport } = require('../utils/reportToken');

// Same shape authenticate puts on req.user, minus the fields nothing downstream
// of a report export reads. Kept deliberately narrow: this credential exists to
// open one PDF, so it should not mint a fuller session than that needs.
const USER_SELECT = {
  user_id: true,
  email: true,
  first_name: true,
  last_name: true,
  role: true,
  is_active: true,
};

/**
 * @param {'complaint'|'wildlife'|'request'} kind
 * @param {string} param  the route parameter holding the reference
 */
function signedReportLink(kind, param) {
  return async function signedOrAuthenticated(req, res, next) {
    // No signature: this middleware is not involved at all.
    if (!req.query || !req.query.s) return authenticate(req, res, next);

    const reference = req.params[param];
    const result = verifyReport(kind, reference, req.query);
    if (result.reason) {
      return res.status(401).json({ success: false, message: result.reason });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { user_id: result.userId },
        select: USER_SELECT,
      });
      // A deactivated account's outstanding links stop working, the same as its
      // sessions do.
      if (!user || !user.is_active) {
        return res.status(401).json({ success: false, message: 'Account not found or deactivated.' });
      }
      req.user = user;
      // Marked so the controller can tell the two credentials apart in the
      // audit row - a link opened in a browser is worth distinguishing from a
      // download taken inside the app.
      req.viaSignedLink = true;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = signedReportLink;
