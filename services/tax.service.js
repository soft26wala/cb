/**
 * Builds SQL date filtering conditions based on filter type
 */
const getDateRangeFilter = (filterType, customStartDate = null, customEndDate = null, dateColumn = 'created_at') => {
  let dateCondition = '';
  const params = [];

  switch (filterType) {
    case 'today':
      dateCondition = `DATE(${dateColumn}) = CURRENT_DATE`;
      break;
    case 'yesterday':
      dateCondition = `DATE(${dateColumn}) = CURRENT_DATE - INTERVAL '1 day'`;
      break;
    case 'weekly':
      dateCondition = `${dateColumn} >= CURRENT_DATE - INTERVAL '7 days'`;
      break;
    case '15days':
      dateCondition = `${dateColumn} >= CURRENT_DATE - INTERVAL '15 days'`;
      break;
    case 'monthly':
      dateCondition = `${dateColumn} >= CURRENT_DATE - INTERVAL '1 month'`;
      break;
    case 'quarterly':
      dateCondition = `${dateColumn} >= CURRENT_DATE - INTERVAL '3 months'`;
      break;
    case 'yearly':
      dateCondition = `${dateColumn} >= CURRENT_DATE - INTERVAL '1 year'`;
      break;
    case 'custom':
      if (customStartDate && customEndDate) {
        dateCondition = `DATE(${dateColumn}) BETWEEN $1 AND $2`;
        params.push(customStartDate, customEndDate);
      } else if (customStartDate) {
        dateCondition = `DATE(${dateColumn}) >= $1`;
        params.push(customStartDate);
      } else if (customEndDate) {
        dateCondition = `DATE(${dateColumn}) <= $1`;
        params.push(customEndDate);
      } else {
        dateCondition = '1=1';
      }
      break;
    default:
      dateCondition = '1=1';
      break;
  }

  return { dateCondition, params };
};

module.exports = {
  getDateRangeFilter,
};
