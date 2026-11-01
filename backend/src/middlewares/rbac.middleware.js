import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.membership) {
      return next(new UnauthorizedError('Tenant context and membership must be established before checking permissions'));
    }

    const userRole = req.membership.role;

    if (!allowedRoles.includes(userRole)) {
      return next(
        new ForbiddenError(
          `Access forbidden: Operation requires one of [${allowedRoles.join(', ')}], but current role is ${userRole}`
        )
      );
    }

    next();
  };
}
