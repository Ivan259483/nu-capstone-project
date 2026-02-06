/**
 * Request validation middleware
 */
export const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors,
      });
    }
  };
};

export default validateRequest;
