/**
 * Wrap an async Express handler so rejections reach the error middleware
 * (Express 4 does not catch async rejections itself — an unguarded await in a
 * route would otherwise crash the whole process).
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
