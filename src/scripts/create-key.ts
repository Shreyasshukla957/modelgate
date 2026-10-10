import mongoose from "mongoose";
import { connectDatabase } from "../config/db.js";
import { ApiKey } from "../models/api-key.js";
import { createGatewayKey, hashGatewayKey } from "../services/keys.js";

const [name = "local-demo", limit = "20"] = process.argv.slice(2);
const requestLimit = Number(limit);
if (!Number.isInteger(requestLimit) || requestLimit < 1) throw new Error("Limit must be a positive integer");
await connectDatabase();
const key = createGatewayKey();
await ApiKey.create({ keyHash: hashGatewayKey(key), name, requestLimit });
console.log("Created gateway key: " + key);
await mongoose.disconnect();
