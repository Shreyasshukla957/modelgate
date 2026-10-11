import { Router } from "express";
import { timingSafeEqual, createHash } from "node:crypto";
import { env } from "../config/index.js";
import { createVirtualKey, getKeyUsage } from "../controllers/admin.controller.js";

export const adminRouter = Router();

adminRouter.use((req, res, next) => {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(req.header("x-admin-key") ?? ""), digest(env.ADMIN_API_KEY))) {
    return res.status(401).json({ error: { code: "admin_unauthorized", message: "Invalid admin key", requestId: res.locals.requestId } });
  }
  next();
});

adminRouter.post("/keys", createVirtualKey);
adminRouter.get("/usage", getKeyUsage);
