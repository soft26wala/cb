const db = require('../config/db');

class ColorModel {
  static async ensureColorTableExists() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS colors (
          color_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          color_name VARCHAR(150) UNIQUE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (e) {
      // Table or type already exists
    }

    try {
      const checkRes = await db.query(`SELECT COUNT(*) FROM colors;`);
      if (parseInt(checkRes.rows[0].count, 10) === 0) {
        const defaultColors = [
          'Raw / Unfinished',
          'White',
          'Black',
          'Natural / Clear',
          'Walnut Stain',
          'Espresso',
          'Dark Oak',
          'Light Oak',
          'Cherry Stain',
          'Mahogany',
          'Slate Grey',
          'Navy Blue',
        ];

        for (const name of defaultColors) {
          await db.query(
            `INSERT INTO colors (color_name) VALUES ($1) ON CONFLICT (color_name) DO NOTHING;`,
            [name]
          );
        }
        console.log('Seeded 12 default colors into colors table.');
      }
    } catch (err) {
      console.error('Failed to initialize colors table', err);
    }
  }

  static async findAll() {
    await this.ensureColorTableExists();
    const result = await db.query(`SELECT * FROM colors ORDER BY created_at ASC, color_name ASC;`);
    return result.rows;
  }

  static async create(colorName) {
    await this.ensureColorTableExists();
    const cleanName = String(colorName).trim();
    if (!cleanName) {
      throw new Error('Color name cannot be empty.');
    }
    const result = await db.query(
      `INSERT INTO colors (color_name) VALUES ($1) ON CONFLICT (color_name) DO UPDATE SET color_name = EXCLUDED.color_name RETURNING *;`,
      [cleanName]
    );
    return result.rows[0];
  }
}

ColorModel.ensureColorTableExists();

module.exports = ColorModel;
