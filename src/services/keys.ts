import crypto from "node:crypto";
import { env } from "../config/index.js";

export function hashGatewayKey(key: string) {
  return crypto.createHmac("sha256", env.GATEWAY_KEY_PEPPER).update(key).digest("hex");
}

export function createGatewayKey() {
  return `rk_${crypto.randomBytes(24).toString("base64url")}`;
}
