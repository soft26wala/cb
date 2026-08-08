const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_AWARDS = [
  {
    id: 'award-1',
    year: '2025',
    title: 'Best Architectural Joinery System',
    organization: 'Milan Architecture Biennale',
    location: 'Milan, Italy',
    category: 'Haute Joinery Gold Medal',
  },
  {
    id: 'award-2',
    year: '2024',
    title: 'Excellence in Sustainable Luxury',
    organization: 'Geneva Design & Forestry Guild',
    location: 'Geneva, Switzerland',
    category: '100% FSC Provenance',
  },
  {
    id: 'award-3',
    year: '2024',
    title: 'Innovative Sommelier Vault System',
    organization: 'Wallpaper* Design Awards',
    location: 'London, UK',
    category: 'Best Storage Architecture',
  },
  {
    id: 'award-4',
    year: '2023',
    title: 'Master Joiner Craftsmanship Trophy',
    organization: 'European Millwork Federation',
    location: 'Paris, France',
    category: 'Precision Engineering',
  },
];

let inMemoryAwards = [...DEFAULT_AWARDS];

const ensureAwardsTableExists = async () => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS awards (
        id VARCHAR(100) PRIMARY KEY,
        year VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        organization VARCHAR(255),
        location VARCHAR(255),
        category VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const checkCount = await db.query('SELECT COUNT(*) as count FROM awards');
    if (parseInt(checkCount.rows[0]?.count || 0, 10) === 0) {
      for (const item of DEFAULT_AWARDS) {
        await db.query(
          `INSERT INTO awards (id, year, title, category, organization, location)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
          [item.id, item.year, item.title, item.category, item.organization, item.location]
        );
      }
    }
  } catch (err) {
    // Ignore error
  }
};
ensureAwardsTableExists();

class AwardModel {
  static async findAll() {
    try {
      const result = await db.query('SELECT * FROM awards ORDER BY year DESC, created_at DESC');
      if (result && Array.isArray(result.rows) && result.rows.length > 0) {
        return result.rows;
      } else {
        await AwardModel.resetDefaults();
        const seeded = await db.query('SELECT * FROM awards ORDER BY year DESC, created_at DESC');
        if (seeded && Array.isArray(seeded.rows) && seeded.rows.length > 0) {
          return seeded.rows;
        }
      }
    } catch (err) {
      // Ignore DB missing table error, return memory store fallback
    }
    return inMemoryAwards;
  }

  static async findById(id) {
    try {
      const result = await db.query('SELECT * FROM awards WHERE id = $1', [id]);
      if (result && result.rows && result.rows[0]) {
        return result.rows[0];
      }
    } catch (err) {
      // Ignore DB missing error
    }
    return inMemoryAwards.find((item) => String(item.id) === String(id)) || null;
  }

  static async create({ year, title, category, organization, location }) {
    const id = `award-${Date.now()}-${uuidv4().substring(0, 4)}`;
    const newAward = {
      id,
      year: String(year || new Date().getFullYear()),
      title: String(title),
      category: String(category || 'Excellence Award'),
      organization: String(organization || 'Global Design Guild'),
      location: String(location || 'Vancouver, Canada'),
    };

    try {
      const query = `
        INSERT INTO awards (id, year, title, category, organization, location)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const result = await db.query(query, [
        id,
        newAward.year,
        newAward.title,
        newAward.category,
        newAward.organization,
        newAward.location,
      ]);
      if (result && result.rows && result.rows[0]) {
        inMemoryAwards.unshift(result.rows[0]);
        return result.rows[0];
      }
    } catch (err) {
      // Ignore DB missing error
    }

    inMemoryAwards.unshift(newAward);
    return newAward;
  }

  static async update(id, { year, title, category, organization, location }) {
    try {
      const query = `
        UPDATE awards
        SET year = COALESCE($1, year),
            title = COALESCE($2, title),
            category = COALESCE($3, category),
            organization = COALESCE($4, organization),
            location = COALESCE($5, location),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *
      `;
      const result = await db.query(query, [
        year || null,
        title || null,
        category || null,
        organization || null,
        location || null,
        id,
      ]);
      if (result && result.rows && result.rows[0]) {
        const idx = inMemoryAwards.findIndex((item) => String(item.id) === String(id));
        if (idx !== -1) inMemoryAwards[idx] = result.rows[0];
        return result.rows[0];
      }
    } catch (err) {
      // Fallback
    }

    const idx = inMemoryAwards.findIndex((item) => String(item.id) === String(id));
    if (idx === -1) return null;

    const updated = {
      ...inMemoryAwards[idx],
      year: year !== undefined && year !== null ? String(year) : inMemoryAwards[idx].year,
      title: title !== undefined && title !== null ? String(title) : inMemoryAwards[idx].title,
      category: category !== undefined && category !== null ? String(category) : inMemoryAwards[idx].category,
      organization: organization !== undefined && organization !== null ? String(organization) : inMemoryAwards[idx].organization,
      location: location !== undefined && location !== null ? String(location) : inMemoryAwards[idx].location,
    };
    inMemoryAwards[idx] = updated;
    return updated;
  }

  static async delete(id) {
    let dbSuccess = false;
    try {
      const res = await db.query('DELETE FROM awards WHERE id = $1', [id]);
      if (res && res.rowCount > 0) {
        dbSuccess = true;
      }
    } catch (err) {
      // Fallback
    }

    const initialLen = inMemoryAwards.length;
    inMemoryAwards = inMemoryAwards.filter((item) => String(item.id) !== String(id));
    return dbSuccess || inMemoryAwards.length < initialLen;
  }

  static async resetDefaults() {
    try {
      await db.query('DELETE FROM awards');
      for (const item of DEFAULT_AWARDS) {
        await db.query(
          `INSERT INTO awards (id, year, title, category, organization, location)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
          [item.id, item.year, item.title, item.category, item.organization, item.location]
        );
      }
    } catch (err) {
      // DB fallback
    }

    inMemoryAwards = [...DEFAULT_AWARDS];
    return inMemoryAwards;
  }
}

module.exports = AwardModel;
