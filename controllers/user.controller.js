const bcrypt = require('bcryptjs');
const UserModel = require('../models/user.model');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');
const { uploadToCloudinaryBuffer } = require('../services/cloudinary.service');

class UserController {
  static async getClients(req, res, next) {
    try {
      const { search, role, limit, offset } = req.query;
      const clients = await UserModel.findClients({
        search,
        role,
        limit: parseInt(limit, 10) || 100,
        offset: parseInt(offset, 10) || 0,
      });
      return successResponse(res, 'Clients fetched successfully', clients);
    } catch (error) {
      next(error);
    }
  }

  static async getUsers(req, res, next) {
    try {
      const { search, role, status, limit, offset } = req.query;
      const users = await UserModel.findAll({
        search,
        role,
        status,
        limit: parseInt(limit, 10) || 50,
        offset: parseInt(offset, 10) || 0,
      });
      return successResponse(res, 'Users fetched successfully', users);
    } catch (error) {
      next(error);
    }
  }

  static async getUserById(req, res, next) {
    try {
      const { id } = req.params;
      const user = await UserModel.findById(id);
      if (!user) {
        return errorResponse(res, 'User not found', null, 404);
      }
      return successResponse(res, 'User details fetched successfully', user);
    } catch (error) {
      next(error);
    }
  }

  static async createUser(req, res, next) {
    try {
      const { name, company_name, mobile_number, pst_number, username, email, password, role, status } = req.body;

      if (role && role.toLowerCase() === 'admin' && req.user?.role !== 'admin') {
        return errorResponse(res, 'Only administrators can assign the admin role.', null, 403);
      }

      const finalUsername = username || (name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(100 + Math.random() * 900) : 'user_' + Date.now());
      const finalEmail = email || `${finalUsername}@client.local`;

      if (email) {
        const existingEmail = await UserModel.findByEmail(email);
        if (existingEmail) {
          return errorResponse(res, 'Email already exists', null, 400);
        }
      }

      if (username) {
        const existingUsername = await UserModel.findByUsername(username);
        if (existingUsername) {
          return errorResponse(res, 'Username already exists', null, 400);
        }
      }

      const rawPassword = password || 'ClientSecret@2026';
      const hashedPassword = await bcrypt.hash(rawPassword, 10);
      let profileImage = null;
      if (req.file) {
        const cloudRes = await uploadToCloudinaryBuffer(req.file.buffer, 'gb_cabinet_doors_profiles');
        profileImage = cloudRes.secure_url;
      }

      const newUser = await UserModel.create({
        name: name || company_name || 'Valued Client',
        company_name: company_name || null,
        mobile_number: mobile_number || null,
        pst_number: pst_number || null,
        username: finalUsername,
        email: finalEmail,
        password: hashedPassword,
        profile_image: profileImage,
        role: role || 'user',
        status: status || 'active',
      });

      await recordHistory({
        userId: req.user.id,
        action: 'INSERT',
        tableName: 'users',
        recordId: newUser.id,
        newData: newUser,
        ipAddress: req.ip,
      });

      return successResponse(res, 'User created successfully', newUser, 201);
    } catch (error) {
      next(error);
    }
  }

  static async updateUser(req, res, next) {
    try {
      const { id } = req.params;
      const existingUser = await UserModel.findById(id);
      if (!existingUser) {
        return errorResponse(res, 'User not found', null, 404);
      }

      const updateData = { ...req.body };

      // Role modification power check
      if (updateData.role && updateData.role.toLowerCase() !== existingUser.role.toLowerCase()) {
        if (req.user?.role !== 'admin') {
          return errorResponse(res, 'Only administrators have permission to modify user roles or assign administrative privileges.', null, 403);
        }
      }

      if (req.file) {
        const cloudRes = await uploadToCloudinaryBuffer(req.file.buffer, 'gb_cabinet_doors_profiles');
        updateData.profile_image = cloudRes.secure_url;
      }
      if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 10);
      }

      const updatedUser = await UserModel.update(id, updateData);

      await recordHistory({
        userId: req.user.id,
        action: 'UPDATE',
        tableName: 'users',
        recordId: id,
        oldData: existingUser,
        newData: updatedUser,
        ipAddress: req.ip,
      });

      return successResponse(res, 'User updated successfully', updatedUser);
    } catch (error) {
      next(error);
    }
  }

  static async deleteUser(req, res, next) {
    try {
      const { id } = req.params;
      const existingUser = await UserModel.findById(id);
      if (!existingUser) {
        return errorResponse(res, 'User not found', null, 404);
      }

      await UserModel.delete(id);

      await recordHistory({
        userId: req.user.id,
        action: 'DELETE',
        tableName: 'users',
        recordId: id,
        oldData: existingUser,
        ipAddress: req.ip,
      });

      return successResponse(res, 'User deleted successfully', { id });
    } catch (error) {
      next(error);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return errorResponse(res, 'Password must be at least 6 characters long', null, 400);
      }
      const existingUser = await UserModel.findById(id);
      if (!existingUser) {
        return errorResponse(res, 'User not found', null, 404);
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const updatedUser = await UserModel.update(id, { password: hashedPassword });

      await recordHistory({
        userId: req.user.id,
        action: 'UPDATE',
        tableName: 'users',
        recordId: id,
        oldData: { password: '[REDACTED]' },
        newData: { password: '[REDACTED]' },
        ipAddress: req.ip,
      });

      return successResponse(res, `Password for ${existingUser.name} reset successfully without OTP`, updatedUser);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UserController;
