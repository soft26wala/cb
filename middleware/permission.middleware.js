const db = require('../config/db');
const { ROLES } = require('../config/constants');
const { errorResponse } = require('../utils/response');
const { DEFAULT_ROLE_PERMISSIONS } = require('../controllers/permission.controller');

const checkPermission = (requiredPermissionKey) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return errorResponse(res, 'Authentication required', null, 401);
      }

      // Admin role bypasses all permission restrictions
      if (req.user.role === ROLES.ADMIN) {
        return next();
      }

      const role = req.user.role;
      const userId = req.user.id;

      // Query DB for permission rule
      const result = await db.query(
        `SELECT is_allowed FROM permissions WHERE (role = $1 OR user_id = $2) AND permission_key = $3 ORDER BY user_id DESC LIMIT 1`,
        [role, userId, requiredPermissionKey]
      );

      let isAllowed = false;

      if (result.rows && result.rows.length > 0) {
        isAllowed = result.rows[0].is_allowed;
      } else {
        // Fallback to default matrix
        const defaultRolePerms = DEFAULT_ROLE_PERMISSIONS[role] || {};
        isAllowed = !!defaultRolePerms[requiredPermissionKey];
      }

      if (!isAllowed) {
        return errorResponse(
          res,
          `Access Denied: You do not have permission [${requiredPermissionKey}] to perform this action.`,
          null,
          403
        );
      }

      next();
    } catch (error) {
      return errorResponse(res, 'Permission verification failed', error.message, 500);
    }
  };
};

module.exports = {
  checkPermission,
};
