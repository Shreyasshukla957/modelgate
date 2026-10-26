export type Usage = {
  requests: number;
  successfulRequests: number;
  pendingRequests: number;
  failedRequests: number;
  estimatedCostUsd: number;
  inputTokens: number;
  outputTokens: number;
};

export type KeyUsage = {
  name: string;
  active: boolean;
  requestLimit: number;
  requestsUsed: number;
  usage: Usage;
};

export type NewKey = {
  key: string;
  name: string;
  requestLimit: number;
  active: boolean;
  warning: string;
};

export type GatewayHealth = { status: "ok" };
