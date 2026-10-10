import mongoose, { InferSchemaType, Schema } from "mongoose";

const usageLogSchema = new Schema(
  {
    apiKeyId: { type: Schema.Types.ObjectId, required: true, index: true, ref: "ApiKey" },
    requestId: { type: String, required: true, index: true },
    model: { type: String, required: true },
    provider: { type: String, required: true },
    inputTokens: { type: Number, required: true, default: 0 },
    outputTokens: { type: Number, required: true, default: 0 },
    estimatedCostUsd: { type: Number, required: true, default: 0 },
    status: { type: String, required: true, enum: ["success", "failed"] },
    errorCode: { type: String }
  },
  { timestamps: true }
);

export type UsageLogDocument = InferSchemaType<typeof usageLogSchema>;
export const UsageLog = mongoose.model("UsageLog", usageLogSchema);
