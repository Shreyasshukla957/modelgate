import express from "express";
import crypto from "node:crypto";
import { ZodError } from "zod";
import { adminRouter } from "./routes/admin.js";
import { completionRouter } from "./routes/completions.js";

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use((_req, res, next) => {
  const requestId = crypto.randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/v1/admin", adminRouter);
app.use("/v1", completionRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) return res.status(400).json({ error: { code: "invalid_request", message: "Request validation failed", requestId: res.locals.requestId, details: error.flatten() } });
  console.error(error);
  res.status(500).json({ error: { code: "internal_error", message: "Unexpected gateway error", requestId: res.locals.requestId } });
});

