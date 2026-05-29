import type { Types } from "mongoose";
import type { IUser } from "../models/User.js";
import type { IProductRequest } from "../models/ProductRequest.js";
import { AppError } from "../middleware/errorMiddleware.js";

export function assertProductRequestAccess(user: IUser, doc: IProductRequest): void {
  if (user.role === "admin") return;
  if (String(doc.userId) !== String(user._id)) {
    throw new AppError(403, "You do not have permission to modify this product request");
  }
}

export function productRequestOwnerFilter(user: IUser): { userId?: Types.ObjectId } {
  if (user.role === "admin") return {};
  return { userId: user._id };
}
