const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const UserModel = require('../models/user.model');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/token');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');
const { uploadToCloudinaryBuffer } = require('../services/cloudinary.service');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

class AuthController {
  static async signup(req, res, next) {
    try {
      const { name, mobile_number, username, email, password, role = 'employee' } = req.body;

      if (role && role.toLowerCase() === 'admin') {
        return errorResponse(res, 'Admin accounts cannot be created via public registration. Admin accounts must be created directly by an administrator.', null, 403);
      }

      const allowedRoles = ['employee', 'ca', 'user'];
      const selectedRole = allowedRoles.includes(role.toLowerCase()) ? role.toLowerCase() : 'user';

      const existingEmail = await UserModel.findByEmail(email);
      if (existingEmail) {
        return errorResponse(res, 'Email is already registered', null, 400);
      }

      const existingUsername = await UserModel.findByUsername(username);
      if (existingUsername) {
        return errorResponse(res, 'Username is already taken', null, 400);
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      let profileImage = null;
      if (req.file) {
        const cloudRes = await uploadToCloudinaryBuffer(req.file.buffer, 'gb_cabinet_doors_profiles');
        profileImage = cloudRes.secure_url;
      }

      const newUser = await UserModel.create({
        name,
        mobile_number,
        username,
        email,
        password: hashedPassword,
        profile_image: profileImage,
        role: selectedRole,
        status: 'active',
      });

      const accessToken = generateAccessToken({ id: newUser.id, role: newUser.role, username: newUser.username });
      const refreshToken = generateRefreshToken({ id: newUser.id });

      res.cookie('accessToken', accessToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.cookie('userId', newUser.id, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await recordHistory({
        userId: newUser.id,
        action: 'INSERT',
        tableName: 'users',
        recordId: newUser.id,
        newData: { id: newUser.id, username: newUser.username, email: newUser.email },
        ipAddress: req.ip,
      });

      return successResponse(res, 'Signup successful', { user: newUser, accessToken, refreshToken }, 201);
    } catch (error) {
      next(error);
    }
  }

  static async login(req, res, next) {
    try {
      const { emailOrUsername, email, username, password } = req.body;
      const targetIdentifier = emailOrUsername || email || username;

      if (!targetIdentifier || !password) {
        return errorResponse(res, 'Email/Username and password are required', null, 400);
      }

      let user = await UserModel.findByEmail(targetIdentifier);
      if (!user) {
        user = await UserModel.findByUsername(targetIdentifier);
      }

      if (!user) {
        return errorResponse(res, 'Invalid credentials', null, 401);
      }

      if (user.status !== 'active') {
        return errorResponse(res, 'Account is inactive. Please contact support.', null, 403);
      }

      if (user.password) {
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid && password !== user.password) {
          return errorResponse(res, 'Invalid credentials', null, 401);
        }
      }

      const accessToken = generateAccessToken({ id: user.id, role: user.role, username: user.username });
      const refreshToken = generateRefreshToken({ id: user.id });

      res.cookie('accessToken', accessToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.cookie('userId', user.id, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await recordHistory({
        userId: user.id,
        action: 'LOGIN',
        tableName: 'users',
        recordId: user.id,
        ipAddress: req.ip,
      });

      const { password: _, ...userWithoutPassword } = user;
      return successResponse(res, 'Login successful', { user: userWithoutPassword, accessToken, refreshToken });
    } catch (error) {
      next(error);
    }
  }

  static async googleLogin(req, res, next) {
    return errorResponse(res, 'Google login has been disabled for security reasons.', null, 400);
  }

  static async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const user = await UserModel.findByEmail(email);
      if (!user) {
        return successResponse(res, 'If your email is registered, password reset instructions have been generated.', { resetToken: 'demo-reset-token-sent' });
      }

      const resetToken = generateAccessToken({ id: user.id, purpose: 'reset-password' });
      return successResponse(res, 'Password reset token generated successfully', { resetToken });
    } catch (error) {
      next(error);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const { resetToken, newPassword } = req.body;
      const decoded = verifyAccessToken(resetToken);

      if (!decoded || decoded.purpose !== 'reset-password') {
        return errorResponse(res, 'Invalid or expired password reset token', null, 400);
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await UserModel.update(decoded.id, { password: hashedPassword });

      await recordHistory({
        userId: decoded.id,
        action: 'UPDATE',
        tableName: 'users',
        recordId: decoded.id,
        newData: { action: 'Password Reset' },
        ipAddress: req.ip,
      });

      return successResponse(res, 'Password reset successful. You can now login with your new password.');
    } catch (error) {
      next(error);
    }
  }

  static async refreshToken(req, res, next) {
    try {
      const token = req.cookies.refreshToken || req.body.refreshToken;
      if (!token) {
        return errorResponse(res, 'Refresh token required', null, 400);
      }

      const decoded = verifyRefreshToken(token);
      const user = await UserModel.findById(decoded.id);
      if (!user || user.status !== 'active') {
        return errorResponse(res, 'User not found or inactive', null, 401);
      }

      const newAccessToken = generateAccessToken({ id: user.id, role: user.role, username: user.username });
      return successResponse(res, 'Token refreshed successfully', { accessToken: newAccessToken });
    } catch (error) {
      return errorResponse(res, 'Invalid refresh token', error.message, 401);
    }
  }

  static async logout(req, res, next) {
    try {
      res.clearCookie('refreshToken');
      if (req.user) {
        await recordHistory({
          userId: req.user.id,
          action: 'LOGOUT',
          tableName: 'users',
          recordId: req.user.id,
          ipAddress: req.ip,
        });
      }
      return successResponse(res, 'Logout successful');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;
