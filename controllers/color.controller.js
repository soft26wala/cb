const ColorModel = require('../models/color.model');

class ColorController {
  static async getAllColors(req, res) {
    try {
      const colors = await ColorModel.findAll();
      res.json({ success: true, data: colors });
    } catch (err) {
      console.error('Error fetching colors:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch colors' });
    }
  }

  static async createColor(req, res) {
    try {
      const { color_name, colorName, name } = req.body;
      const targetName = color_name || colorName || name;
      if (!targetName || !String(targetName).trim()) {
        return res.status(400).json({ success: false, message: 'Color name is required' });
      }

      const color = await ColorModel.create(targetName);
      res.status(201).json({ success: true, data: color });
    } catch (err) {
      console.error('Error creating color:', err);
      res.status(500).json({ success: false, message: err.message || 'Failed to create color' });
    }
  }
}

module.exports = ColorController;
