import type { GatewayHealth, KeyUsage, NewKey } from "../types/gateway";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

const parseResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  const data = text ? tryParseJson(text) : undefined;

  if (!response.ok) {
    throw new Error(
      (isRecord(data) && isRecord(data.error) && typeof data.error.message === "string" ? data.error.message : undefined) ??
        (response.status === 502
          ? "The local ModelGate API is unavailable. Start it with pnpm run dev."
          : "The gateway returned an empty response.")
    );
  }

  if (!data) {
    throw new Error("The gateway returned an invalid response.");
  }

  return data;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const assertNewKey = (value: unknown): NewKey => {
  if (!isRecord(value) || typeof value.key !== "string" || typeof value.name !== "string" || !isNumber(value.requestLimit) || typeof value.active !== "boolean" || typeof value.warning !== "string") throw new Error("The gateway returned an invalid key response.");
  return value as NewKey;
};

const assertKeyUsage = (value: unknown): KeyUsage => {
  if (!isRecord(value) || !isRecord(value.usage) || typeof value.name !== "string" || typeof value.active !== "boolean" || !isNumber(value.requestLimit) || !isNumber(value.requestsUsed)) throw new Error("The gateway returned an invalid usage response.");
  const usage = value.usage;
  if (!["requests", "successfulRequests", "pendingRequests", "failedRequests", "estimatedCostUsd", "inputTokens", "outputTokens"].every((field) => isNumber(usage[field]))) throw new Error("The gateway returned an invalid usage response.");
  return value as KeyUsage;
};

const tryParseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

export const createVirtualKey = async ({
  adminKey,
  name,
  requestLimit,
}: {
  adminKey: string;
  name: string;
  requestLimit: number;
}): Promise<NewKey> => {
  return assertNewKey(await parseResponse(
    await fetch(`${apiBaseUrl}/v1/admin/keys`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-key": adminKey,
      },
      body: JSON.stringify({ name, requestLimit }),
    })
  ));
};

export const getKeyUsage = async ({
  adminKey,
  gatewayKey,
}: {
  adminKey: string;
  gatewayKey: string;
}): Promise<KeyUsage> => {
  return assertKeyUsage(await parseResponse(
    await fetch(`${apiBaseUrl}/v1/admin/usage`, {
      headers: {
        "x-admin-key": adminKey,
        "x-api-key": gatewayKey,
      },
    })
  ));
};

export const getGatewayHealth = async (): Promise<GatewayHealth> => {
  const value = await parseResponse(await fetch(`${apiBaseUrl}/health`));
  if (!isRecord(value) || value.status !== "ok") throw new Error("The gateway health response is invalid.");
  return value as GatewayHealth;
};
