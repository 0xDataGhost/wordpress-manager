import type { RequestHandler } from "express";
import { errorResponse } from "../lib/api-response";

/** Terminal handler for unmatched routes. Mount after all real routes. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json(
      errorResponse(
        "NOT_FOUND",
        `Route not found: ${req.method} ${req.originalUrl}`,
      ),
    );
};
