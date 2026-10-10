import mongoose from "mongoose";
import { env } from "./index.js";

export async function connectDatabase() {
  await mongoose.connect(env.MONGODB_URI);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
