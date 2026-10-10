import mongoose, { InferSchemaType, Schema } from "mongoose";

const apiKeySchema = new Schema(
  {
    keyHash: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    requestLimit: { type: Number, required: true, min: 1 },
    requestsUsed: { type: Number, required: true, default: 0, min: 0 },
    active: { type: Boolean, required: true, default: true }
  },
  { timestamps: true }
);

export type ApiKeyDocument = InferSchemaType<typeof apiKeySchema>;
export const ApiKey = mongoose.model("ApiKey", apiKeySchema);