import { Router } from "express";
import { createCompletion } from "../controllers/completion.controller.js";

export const completionRouter = Router();
completionRouter.post("/chat/completions", createCompletion);
