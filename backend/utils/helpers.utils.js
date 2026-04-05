/**
 * API Response Formatter
 */
export const formatResponse = (success, message, data = null, status = 200) => {
  return {
    status,
    body: {
      success,
      message,
      ...(data && { data }),
    },
  };
};

/**
 * Generate unique ID
 */
export const generateId = () => {
  return Math.random().toString(36).substr(2, 9);
};

/**
 * Pagination helper
 */
export const getPagination = (skip = 0, limit = 10) => {
  return {
    skip: parseInt(skip),
    limit: parseInt(limit),
  };
};

/**
 * Sort helper
 */
export const getSort = (sortBy = 'createdAt', sortOrder = -1) => {
  return {
    [sortBy]: parseInt(sortOrder),
  };
};

export default {
  formatResponse,
  generateId,
  getPagination,
  getSort,
};
