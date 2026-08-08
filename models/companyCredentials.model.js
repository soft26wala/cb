const db = require('../config/db');

const DEFAULT_CREDENTIALS = {
  company_name: 'GB Cabinet Doors Ltd.',
  business_number: '987654321 BC0001',
  gst_number: '12345 6789 RT0001',
  pst_number: 'PST-1001-8849',
  company_email: 'info@gbcabinetdoors.ca',
  company_phone: '(604) 503-3711',
  website: 'https://gbcabinetdoors.ca',
  address_line1: '12885 85 Ave',
  address_line2: 'Unit 104',
  city: 'Surrey',
  province: 'BC',
  postal_code: 'V3W 0K8',
  country: 'Canada',
  invoice_prefix: 'INV',
  invoice_footer: 'Thank you for your business. Payment terms: Net 30 days.',
  payment_terms: 'Net 30 Days. Payments accepted via Interac e-Transfer, Credit Card, or Direct Deposit.',
  thank_you_message: 'Thank you for choosing GB Cabinet Doors Ltd. We appreciate your business!',
  logo_url: '',
};

class CompanyCredentialsModel {
  static async getCredentials() {
    try {
      const selectRes = await db.query('SELECT * FROM company_credentials ORDER BY created_at ASC LIMIT 1');
      if (selectRes && selectRes.rows && selectRes.rows.length > 0) {
        return selectRes.rows[0];
      }

      // If no row exists, seed default row automatically
      const insertQuery = `
        INSERT INTO company_credentials (
          company_name, business_number, gst_number, pst_number, company_email, company_phone,
          website, address_line1, address_line2, city, province, postal_code, country,
          invoice_prefix, invoice_footer, payment_terms, thank_you_message, logo_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *
      `;
      const insertValues = [
        DEFAULT_CREDENTIALS.company_name,
        DEFAULT_CREDENTIALS.business_number,
        DEFAULT_CREDENTIALS.gst_number,
        DEFAULT_CREDENTIALS.pst_number,
        DEFAULT_CREDENTIALS.company_email,
        DEFAULT_CREDENTIALS.company_phone,
        DEFAULT_CREDENTIALS.website,
        DEFAULT_CREDENTIALS.address_line1,
        DEFAULT_CREDENTIALS.address_line2,
        DEFAULT_CREDENTIALS.city,
        DEFAULT_CREDENTIALS.province,
        DEFAULT_CREDENTIALS.postal_code,
        DEFAULT_CREDENTIALS.country,
        DEFAULT_CREDENTIALS.invoice_prefix,
        DEFAULT_CREDENTIALS.invoice_footer,
        DEFAULT_CREDENTIALS.payment_terms,
        DEFAULT_CREDENTIALS.thank_you_message,
        DEFAULT_CREDENTIALS.logo_url,
      ];

      const insertRes = await db.query(insertQuery, insertValues);
      return insertRes.rows[0];
    } catch (error) {
      console.error('CompanyCredentialsModel getCredentials error:', error.message);
      // Fallback return object if error
      return {
        ...DEFAULT_CREDENTIALS,
        id: '11111111-2222-3333-4444-555555555555',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
  }

  static async updateCredentials(data) {
    const current = await this.getCredentials();

    const updatedData = {
      company_name: data.company_name !== undefined ? data.company_name : current.company_name,
      business_number: data.business_number !== undefined ? data.business_number : current.business_number,
      gst_number: data.gst_number !== undefined ? data.gst_number : current.gst_number,
      pst_number: data.pst_number !== undefined ? data.pst_number : current.pst_number,
      company_email: data.company_email !== undefined ? data.company_email : current.company_email,
      company_phone: data.company_phone !== undefined ? data.company_phone : current.company_phone,
      website: data.website !== undefined ? data.website : current.website,
      address_line1: data.address_line1 !== undefined ? data.address_line1 : current.address_line1,
      address_line2: data.address_line2 !== undefined ? data.address_line2 : current.address_line2,
      city: data.city !== undefined ? data.city : current.city,
      province: data.province !== undefined ? data.province : current.province,
      postal_code: data.postal_code !== undefined ? data.postal_code : current.postal_code,
      country: data.country !== undefined ? data.country : current.country,
      invoice_prefix: data.invoice_prefix !== undefined ? data.invoice_prefix : current.invoice_prefix,
      invoice_footer: data.invoice_footer !== undefined ? data.invoice_footer : current.invoice_footer,
      payment_terms: data.payment_terms !== undefined ? data.payment_terms : current.payment_terms,
      thank_you_message: data.thank_you_message !== undefined ? data.thank_you_message : current.thank_you_message,
      logo_url: data.logo_url !== undefined ? data.logo_url : current.logo_url,
    };

    const updateQuery = `
      UPDATE company_credentials
      SET
        company_name = $1,
        business_number = $2,
        gst_number = $3,
        pst_number = $4,
        company_email = $5,
        company_phone = $6,
        website = $7,
        address_line1 = $8,
        address_line2 = $9,
        city = $10,
        province = $11,
        postal_code = $12,
        country = $13,
        invoice_prefix = $14,
        invoice_footer = $15,
        payment_terms = $16,
        thank_you_message = $17,
        logo_url = $18,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $19
      RETURNING *
    `;

    const values = [
      updatedData.company_name,
      updatedData.business_number,
      updatedData.gst_number,
      updatedData.pst_number,
      updatedData.company_email,
      updatedData.company_phone,
      updatedData.website,
      updatedData.address_line1,
      updatedData.address_line2,
      updatedData.city,
      updatedData.province,
      updatedData.postal_code,
      updatedData.country,
      updatedData.invoice_prefix,
      updatedData.invoice_footer,
      updatedData.payment_terms,
      updatedData.thank_you_message,
      updatedData.logo_url,
      current.id,
    ];

    const result = await db.query(updateQuery, values);

    // Fallback store update if in-memory mode active
    if (db.memoryStore && db.memoryStore.company_credentials) {
      db.memoryStore.company_credentials = [
        {
          ...current,
          ...updatedData,
          updated_at: new Date().toISOString(),
        },
      ];
    }

    return (result.rows && result.rows[0]) || (db.memoryStore.company_credentials ? db.memoryStore.company_credentials[0] : updatedData);
  }
}

module.exports = CompanyCredentialsModel;
