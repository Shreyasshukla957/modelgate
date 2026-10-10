import { Router } from "express";
import { env } from "../config/index.js";
import { createVirtualKey, getKeyUsage } from "../controllers/admin.controller.js";

export const adminRouter = Router();

adminRouter.use((req, res, next) => {
  if (req.header("x-admin-key") !== env.ADMIN_API_KEY) {
    return res.status(401).json({ error: { code: "admin_unauthorized", message: "Invalid admin key", requestId: res.locals.requestId } });
  }
  next();
});

adminRouter.post("/keys", createVirtualKey);
adminRouter.get("/usage/:key", getKeyUsage);
