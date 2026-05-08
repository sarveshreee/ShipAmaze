import type { Request, Response } from "express";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: "Not found",
    error: "Not found",
    path: req.originalUrl,
  });
}
