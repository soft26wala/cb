const db = require('../config/db');
const OrderModel = require('../models/order.model');
const InvoiceModel = require('../models/invoice.model');
const { successResponse, errorResponse } = require('../utils/response');
const { recordHistory } = require('../services/audit.service');
const { validatePstNumber } = require('../utils/pstValidator');

class OrderController {
  static async verifyPstNumber(req, res, next) {
    try {
      const { pstNumber } = req.body;
      const result = validatePstNumber(pstNumber);

      const effectiveUserId = (req.user && req.user.id)
        ? req.user.id
        : (req.cookies?.userId || req.body?.user_id || null);

      // Audit log every PST verification attempt (Requirement 7)
      await recordHistory({
        userId: effectiveUserId,
        action: 'OTHER',
        tableName: 'pst_verifications',
        recordId: result.valid ? result.pstNumber : (pstNumber || 'INVALID'),
        newData: {
          pstNumber: pstNumber || '',
          verifiedNumber: result.pstNumber || null,
          isValid: result.valid,
          message: result.message,
          timestamp: new Date().toISOString(),
        },
        ipAddress: req.ip,
      }).catch(() => {});

      if (!result.valid) {
        return res.status(400).json({
          success: false,
          valid: false,
          pstNumber: pstNumber || '',
          message: result.message,
        });
      }

      return successResponse(res, result.message, {
        valid: true,
        pstNumber: result.pstNumber,
        pstExempt: true,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createOrder(req, res, next) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const effectiveUserId = req.body.user_id || req.body.client_id || (req.user && req.user.id ? req.user.id : null);

      const orderPayload = {
        ...req.body,
        user_id: effectiveUserId,
      };

      const newOrder = await OrderModel.createOrder(orderPayload, client);

      await client.query('COMMIT');

      await recordHistory({
        userId: effectiveUserId,
        action: 'INSERT',
        tableName: 'orders',
        recordId: newOrder.order_id,
        newData: { order_id: newOrder.order_id, total_amount: newOrder.total_amount, order_number: newOrder.order_number },
        ipAddress: req.ip,
      }).catch(() => {});

      return successResponse(res, 'Order created successfully', newOrder, 201);
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  static async updateOrder(req, res, next) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const updatedOrder = await OrderModel.updateOrder(id, req.body, client);

      await client.query('COMMIT');

      await recordHistory({
        userId: req.user ? req.user.id : null,
        action: 'UPDATE',
        tableName: 'orders',
        recordId: id,
        newData: { order_id: id, status: updatedOrder.status, total_amount: updatedOrder.total_amount },
        ipAddress: req.ip,
      }).catch(() => {});

      return successResponse(res, 'Order updated successfully', updatedOrder);
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  static async getOrders(req, res, next) {
    try {
      const { userId, status, search, categoryId, productId, unit, limit, offset } = req.query;

      const orders = await OrderModel.findAll({
        userId: userId || null,
        status,
        search,
        categoryId,
        productId,
        unit,
        limit: parseInt(limit, 10) || 100,
        offset: parseInt(offset, 10) || 0,
      });

      return successResponse(res, 'Orders fetched successfully', orders);
    } catch (error) {
      next(error);
    }
  }

  static async getOrderById(req, res, next) {
    try {
      const { id } = req.params;
      const order = await OrderModel.findById(id);

      if (!order) {
        return errorResponse(res, 'Order not found', null, 404);
      }

      if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
        return errorResponse(res, 'Access denied', null, 403);
      }

      return successResponse(res, 'Order details fetched successfully', order);
    } catch (error) {
      next(error);
    }
  }

  static async getInvoiceByOrderId(req, res, next) {
    try {
      const { id } = req.params;
      const invoice = await InvoiceModel.findByOrderId(id);

      if (!invoice) {
        return errorResponse(res, 'Invoice not found for this order', null, 404);
      }

      if (req.user.role !== 'admin' && invoice.user_id !== req.user.id) {
        return errorResponse(res, 'Access denied', null, 403);
      }

      return successResponse(res, 'Invoice fetched successfully', invoice);
    } catch (error) {
      next(error);
    }
  }

  static async updateOrderStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const updatedOrder = await OrderModel.updateStatus(id, status);

      await recordHistory({
        userId: req.user.id,
        action: 'UPDATE',
        tableName: 'orders',
        recordId: id,
        newData: { status },
        ipAddress: req.ip,
      });

      return successResponse(res, 'Order status updated successfully', updatedOrder);
    } catch (error) {
      next(error);
    }
  }

  static async addPayment(req, res, next) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { amount, payment_method } = req.body;

      const updatedOrder = await OrderModel.addPayment(id, amount, payment_method, client);

      await client.query('COMMIT');

      await recordHistory({
        userId: req.user.id,
        action: 'INSERT',
        tableName: 'payments',
        recordId: id,
        newData: { amount, payment_method },
        ipAddress: req.ip,
      });

      return successResponse(res, 'Payment recorded successfully', updatedOrder);
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  static async deleteOrder(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await OrderModel.delete(id);

      await recordHistory({
        userId: req.user.id,
        action: 'DELETE',
        tableName: 'orders',
        recordId: id,
        ipAddress: req.ip,
      });

      return successResponse(res, 'Order deleted successfully', deleted);
    } catch (error) {
      next(error);
    }
  }

  static async getInvoices(req, res, next) {
    try {
      const { userId, paymentStatus, limit, offset } = req.query;
      const filterUserId = req.user.role === 'admin' || req.user.role === 'employee' ? userId : req.user.id;

      const invoices = await InvoiceModel.findAll({
        userId: filterUserId,
        paymentStatus,
        limit: parseInt(limit, 10) || 50,
        offset: parseInt(offset, 10) || 0,
      });

      return successResponse(res, 'Invoices fetched successfully', invoices);
    } catch (error) {
      next(error);
    }
  }

  static async updateDeliveryAndDiscount(req, res, next) {
    try {
      const { id } = req.params;
      const { delivery_charge, discount_amount } = req.body;

      const updatedOrder = await OrderModel.updateDeliveryAndDiscount(id, {
        delivery_charge,
        discount_amount,
      });

      await recordHistory({
        userId: req.user ? req.user.id : null,
        action: 'UPDATE',
        tableName: 'orders',
        recordId: id,
        newData: { delivery_charge, discount_amount, total_amount: updatedOrder.total_amount },
        ipAddress: req.ip,
      }).catch(() => {});

      return successResponse(res, 'Delivery charge & discount updated successfully', updatedOrder);
    } catch (error) {
      next(error);
    }
  }

  static async updateShipTo(req, res, next) {
    try {
      const { id } = req.params;
      const { ship_to_name, ship_to_address, delivery_notes } = req.body;

      const updatedOrder = await OrderModel.updateShipTo(id, {
        ship_to_name,
        ship_to_address,
        delivery_notes,
      });

      await recordHistory({
        userId: req.user ? req.user.id : null,
        action: 'UPDATE',
        tableName: 'orders',
        recordId: id,
        newData: { ship_to_name, ship_to_address, delivery_notes },
        ipAddress: req.ip,
      }).catch(() => {});

      return successResponse(res, 'Ship To delivery details updated successfully', updatedOrder);
    } catch (error) {
      next(error);
    }
  }

  static async updateShippingDate(req, res, next) {
    try {
      const { id } = req.params;
      const { shipping_date, delivery_date } = req.body;
      const targetDate = shipping_date !== undefined ? shipping_date : delivery_date;

      const updatedOrder = await OrderModel.updateShippingDate(id, targetDate);

      await recordHistory({
        userId: req.user ? req.user.id : null,
        action: 'UPDATE',
        tableName: 'orders',
        recordId: id,
        newData: { shipping_date: targetDate },
        ipAddress: req.ip,
      }).catch(() => {});

      return successResponse(res, 'Shipping date updated successfully', updatedOrder);
    } catch (error) {
      next(error);
    }
  }

  static async deletePayment(req, res, next) {
    try {
      const { paymentId } = req.params;
      const deleted = await OrderModel.deletePayment(paymentId);
      return successResponse(res, 'Payment entry removed successfully', deleted);
    } catch (error) {
      next(error);
    }
  }

}

module.exports = OrderController;
