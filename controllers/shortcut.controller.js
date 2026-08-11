const ShortcutModel = require('../models/shortcut.model');

const defaultShortcutsList = [
  { page_name: 'Dashboard', page_route: '/dashboard', description: 'Navigate to Main Dashboard', shortcut_key: 'Alt+D', category: 'Navigation', is_active: true },
  { page_name: 'Customers', page_route: '/customers', description: 'Navigate to Customer Directory', shortcut_key: 'Alt+C', category: 'Navigation', is_active: true },
  { page_name: 'Products', page_route: '/products', description: 'Navigate to Product Catalog', shortcut_key: 'Alt+P', category: 'Navigation', is_active: true },
  { page_name: 'Add Product', page_route: '/products?openAdd=true', description: 'Open Add New Product Form Modal', shortcut_key: 'Alt+A', category: 'Action', is_active: true },
  { page_name: 'Categories', page_route: '/categories', description: 'Navigate to Product Categories Manager', shortcut_key: 'Alt+T', category: 'Navigation', is_active: true },
  { page_name: 'Orders', page_route: '/orders', description: 'Navigate to Sales & Order Processing', shortcut_key: 'Alt+O', category: 'Navigation', is_active: true },
  { page_name: 'Invoices', page_route: '/invoices', description: 'Navigate to Invoices List & Billing', shortcut_key: 'Alt+I', category: 'Navigation', is_active: true },
  { page_name: 'Expenses', page_route: '/expenses', description: 'Navigate to Expense Tracker', shortcut_key: 'Alt+E', category: 'Navigation', is_active: true },
  { page_name: 'Employees', page_route: '/employees', description: 'Navigate to Employee Directory', shortcut_key: 'Alt+M', category: 'Navigation', is_active: true },
  { page_name: 'Salary', page_route: '/salary', description: 'Navigate to Employee Salary & Payroll', shortcut_key: 'Alt+S', category: 'Navigation', is_active: true },
  { page_name: 'Loans', page_route: '/loans', description: 'Navigate to Loans Ledger', shortcut_key: 'Alt+L', category: 'Navigation', is_active: true },
  { page_name: 'Accounts', page_route: '/accounts', description: 'Navigate to Financial Accounts Ledger', shortcut_key: 'Alt+K', category: 'Navigation', is_active: true },
  { page_name: 'Credit List', page_route: '/credit-list', description: 'Navigate to Credit Transactions', shortcut_key: 'Alt+R', category: 'Navigation', is_active: true },
  { page_name: 'Udhar List', page_route: '/udhar-list', description: 'Navigate to Udhar / Khata Book', shortcut_key: 'Alt+U', category: 'Navigation', is_active: true },
  { page_name: 'Reports', page_route: '/reports', description: 'Navigate to Analytics & Financial Reports', shortcut_key: 'Alt+N', category: 'Navigation', is_active: true },
  { page_name: 'Roles & Permissions', page_route: '/roles', description: 'Navigate to Security & Access Controls', shortcut_key: 'Alt+Y', category: 'Navigation', is_active: true },
  { page_name: 'Financial Year', page_route: '/financial-year', description: 'Navigate to Financial Year Accounting', shortcut_key: 'Alt+F', category: 'Navigation', is_active: true },
  { page_name: 'GST / PST', page_route: '/gst-pst', description: 'Navigate to Tax Rates & Calculations', shortcut_key: 'Alt+G', category: 'Navigation', is_active: true },
  { page_name: 'Audit Logs', page_route: '/history', description: 'Navigate to System Audit Logs & History', shortcut_key: 'Alt+H', category: 'Navigation', is_active: true },
  { page_name: 'Delivery Memos', page_route: '/memos', description: 'Navigate to Delivery Memos & COD Returns', shortcut_key: 'Alt+V', category: 'Navigation', is_active: true },
  { page_name: 'Create Memo', page_route: '/memos?openAdd=true', description: 'Open Create New Memo Form Modal', shortcut_key: 'Shift+M', category: 'Action', is_active: true },
  { page_name: 'Settings', page_route: '/settings', description: 'Navigate to System Settings & Shortcuts Manager', shortcut_key: 'Alt+X', category: 'Navigation', is_active: true },
];

class ShortcutController {
  static async getShortcuts(req, res, next) {
    try {
      let shortcuts = await ShortcutModel.findAll();
      
      // If table is empty, auto-seed standard default shortcuts
      if (!shortcuts || shortcuts.length === 0) {
        for (const item of defaultShortcutsList) {
          await ShortcutModel.create(item);
        }
        shortcuts = await ShortcutModel.findAll();
      }

      res.status(200).json({
        success: true,
        data: shortcuts,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createShortcut(req, res, next) {
    try {
      const { page_name, page_route, description, shortcut_key, category, is_active } = req.body;
      if (!page_name || !shortcut_key) {
        return res.status(400).json({
          success: false,
          message: 'Page name and shortcut key are required.',
        });
      }

      const newShortcut = await ShortcutModel.create({
        page_name,
        page_route: page_route || '/dashboard',
        description: description || `Navigate to ${page_name}`,
        shortcut_key,
        category: category || 'Navigation',
        is_active: is_active !== undefined ? is_active : true,
      });

      res.status(201).json({
        success: true,
        message: 'Shortcut added successfully',
        data: newShortcut,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateShortcut(req, res, next) {
    try {
      const { id } = req.params;
      const updated = await ShortcutModel.update(id, req.body);
      if (!updated) {
        return res.status(404).json({
          success: false,
          message: 'Shortcut not found',
        });
      }

      res.status(200).json({
        success: true,
        message: 'Shortcut updated successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  static async batchUpdateShortcuts(req, res, next) {
    try {
      const { shortcuts } = req.body;
      if (!Array.isArray(shortcuts)) {
        return res.status(400).json({
          success: false,
          message: 'shortcuts array is required',
        });
      }

      const result = await ShortcutModel.batchUpdate(shortcuts);
      res.status(200).json({
        success: true,
        message: 'Shortcuts batch updated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteShortcut(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await ShortcutModel.delete(id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Shortcut not found',
        });
      }

      res.status(200).json({
        success: true,
        message: 'Shortcut deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async resetShortcuts(req, res, next) {
    try {
      await ShortcutModel.deleteAll();
      for (const item of defaultShortcutsList) {
        await ShortcutModel.create(item);
      }
      const shortcuts = await ShortcutModel.findAll();
      res.status(200).json({
        success: true,
        message: 'Shortcuts reset to defaults successfully',
        data: shortcuts,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = ShortcutController;
