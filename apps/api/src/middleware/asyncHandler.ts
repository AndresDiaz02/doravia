import { Request, Response, NextFunction } from "express";

/**
 * Envuelve un handler async de Express para que los errores rechazados
 * se pasen automáticamente a next() sin necesidad de try/catch manual.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
