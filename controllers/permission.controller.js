const db = require('../config/db');
const { ALL_PERMISSIONS, ROLES } = require('../config/constants');
const { successResponse, errorResponse } = require('../utils/response');

// Default initial permissions matrix for roles
const DEFAULT_ROLE_PERMISSIONS = {
  admin: ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p]: true }), {}),
  employee: ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p]: false }), {}),
  ca: {
    Dashboard: true,
    GST: true,
    PST: true,
    Invoices: true,
    Accounts: true,
    Reports: true,
    'Tax Reports': true,
    'PDF Download': true,
    View: true,
    Export: true,
  },
  user: ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p]: false }), {}),
  client: ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p]: false }), {}),
};

// GET /api/permissions - Get matrix of permissions for all roles
const getPermissions = async (req, res) => {
  try {
    let permissionsMap = {
      admin: { ...DEFAULT_ROLE_PERMISSIONS.admin },
      employee: { ...DEFAULT_ROLE_PERMISSIONS.employee },
      ca: { ...DEFAULT_ROLE_PERMISSIONS.ca },
      user: { ...DEFAULT_ROLE_PERMISSIONS.user },
      client: { ...DEFAULT_ROLE_PERMISSIONS.client },
    };

    try {
      let result = await db.query('SELECT role, permission_key, is_allowed FROM permissions WHERE user_id IS NULL');
      if (result.rows && result.rows.length > 0) {
        result.rows.forEach((row) => {
          if (!permissionsMap[row.role]) {
            permissionsMap[row.role] = {};
          }
          permissionsMap[row.role][row.permission_key] = row.is_allowed;
        });
      }
    } catch (e) {
      console.warn('Permissions table read warning:', e.message);
    }

    return successResponse(res, 'Permissions retrieved successfully', {
      allPermissions: ALL_PERMISSIONS,
      matrix: permissionsMap,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch permissions', error.message, 500);
  }
};

// GET /api/permissions/me - Get current user active permissions
const getUserPermissions = async (req, res) => {
  try {
    const userRole = (req.user?.role || 'employee').toLowerCase();
    const userId = req.user?.id;

    if (userRole === ROLES.ADMIN) {
      const adminPerms = ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p]: true }), {});
      return successResponse(res, 'User permissions loaded', adminPerms);
    }

    let defaultBase = DEFAULT_ROLE_PERMISSIONS[userRole] || DEFAULT_ROLE_PERMISSIONS.user;
    let finalPerms = { ...defaultBase };

    try {
      let result = await db.query(
        'SELECT permission_key, is_allowed FROM permissions WHERE role = $1 OR user_id = $2',
        [userRole, userId]
      );

      if (result.rows && result.rows.length > 0) {
        result.rows.forEach((row) => {
          finalPerms[row.permission_key] = row.is_allowed;
        });
      }
    } catch (e) {
      console.warn('User permissions DB read warning:', e.message);
    }

    return successResponse(res, 'User permissions loaded', finalPerms);
  } catch (error) {
    return errorResponse(res, 'Failed to fetch user permissions', error.message, 500);
  }
};

// PUT /api/permissions - Update permissions matrix for a role
const updatePermissions = async (req, res) => {
  try {
    const { role, permissions } = req.body;

    if (!role || !permissions) {
      return errorResponse(res, 'Role and permissions object are required', null, 400);
    }

    try {
      await db.query('DELETE FROM permissions WHERE role = $1 AND user_id IS NULL', [role]);
      const keys = Object.keys(permissions);
      for (const key of keys) {
        await db.query(
          'INSERT INTO permissions (role, permission_key, is_allowed) VALUES ($1, $2, $3)',
          [role, key, permissions[key]]
        );
      }
    } catch (e) {
      console.warn('Update role permissions DB warning:', e.message);
    }

    return successResponse(res, `Permissions updated for role ${role}`, { role, permissions });
  } catch (error) {
    return errorResponse(res, 'Failed to update permissions', error.message, 500);
  }
};

// GET /api/permissions/user/:userId - Get permissions for a specific user ID
const getUserPermissionsById = async (req, res) => {
  try {
    const { userId } = req.params;

    let targetUser = { id: userId, role: 'employee' };
    try {
      const userRes = await db.query('SELECT id, role, name, email, username FROM users WHERE id = $1', [userId]);
      if (userRes.rows && userRes.rows.length > 0) {
        targetUser = userRes.rows[0];
      }
    } catch (e) {
      console.warn('User query warning:', e.message);
    }

    const userRole = (targetUser.role || 'employee').toLowerCase();
    let defaultBase = DEFAULT_ROLE_PERMISSIONS[userRole] || DEFAULT_ROLE_PERMISSIONS.user;
    let finalPerms = { ...defaultBase };

    try {
      // 1. Role-level overrides from DB
      const rolePerms = await db.query(
        'SELECT permission_key, is_allowed FROM permissions WHERE role = $1 AND user_id IS NULL',
        [userRole]
      );
      if (rolePerms.rows && rolePerms.rows.length > 0) {
        rolePerms.rows.forEach((row) => {
          finalPerms[row.permission_key] = row.is_allowed;
        });
      }

      // 2. User-level overrides from DB
      const userPerms = await db.query(
        'SELECT permission_key, is_allowed FROM permissions WHERE user_id = $1',
        [userId]
      );
      if (userPerms.rows && userPerms.rows.length > 0) {
        userPerms.rows.forEach((row) => {
          finalPerms[row.permission_key] = row.is_allowed;
        });
      }
    } catch (e) {
      console.warn('User permission matrix query warning:', e.message);
    }

    return successResponse(res, 'User permissions retrieved successfully', {
      user: targetUser,
      allPermissions: ALL_PERMISSIONS,
      permissions: finalPerms,
    });
  } catch (error) {
    return errorResponse(res, 'Failed to fetch user permissions', error.message, 500);
  }
};

// PUT /api/permissions/user/:userId - Update permissions for a specific user ID
const updateUserPermissionsById = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    if (!permissions) {
      return errorResponse(res, 'Permissions object is required', null, 400);
    }

    let userRole = 'employee';
    try {
      const userRes = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
      if (userRes.rows && userRes.rows.length > 0) {
        userRole = userRes.rows[0].role || 'employee';
      }
    } catch (e) {}

    try {
      // Delete existing user-specific permissions
      await db.query('DELETE FROM permissions WHERE user_id = $1', [userId]);

      // Insert updated permissions
      const keys = Object.keys(permissions);
      for (const key of keys) {
        await db.query(
          'INSERT INTO permissions (role, user_id, permission_key, is_allowed) VALUES ($1, $2, $3, $4)',
          [userRole, userId, key, permissions[key]]
        );
      }
    } catch (e) {
      console.warn('Save user permissions DB warning:', e.message);
    }

    return successResponse(res, `Permissions updated for user ${userId}`, { userId, permissions });
  } catch (error) {
    return errorResponse(res, 'Failed to update user permissions', error.message, 500);
  }
};


module.exports = {
  getPermissions,
  getUserPermissions,
  updatePermissions,
  getUserPermissionsById,
  updateUserPermissionsById,
  DEFAULT_ROLE_PERMISSIONS,
};

