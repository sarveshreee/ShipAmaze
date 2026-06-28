import multer from "multer";
import { AppError } from "./errorMiddleware.js";
import {
  PRODUCT_IMAGE_MAX_BYTES,
  validateImageMimeAndSize,
} from "../services/cloudinary.service.js";

export const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PRODUCT_IMAGE_MAX_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    try {
      validateImageMimeAndSize(file.mimetype, file.size ?? 0, file.originalname);
      cb(null, true);
    } catch (error) {
      cb(error instanceof Error ? error : new AppError(400, "Invalid image"));
    }
  },
});
