// Role-based authorization middleware (RBAC). Use AFTER `authenticate`.
//   router.get('/admin-only', authenticate, authorize('Admin'), handler)
//   router.get('/staff', authenticate, authorize('Admin', 'CENRO_Staff'), handler)

function authorize(...allowedRoles) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
      });
    }
    return next();
  };
}

module.exports = authorize;
