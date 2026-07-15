import { Schema, model } from "mongoose";
import { IPayment } from "./payment.interface";

const paymentSchema = new Schema<IPayment>(
  {
    schedule: {
      type: Schema.Types.ObjectId,
      ref: "CleaningSchedule",
      required: true,
      index: true,
    },
    host: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    cleaner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    accommodation: {
      type: Schema.Types.ObjectId,
      ref: "Accommodation",
      required: true,
    },

    amount: { type: Number, required: true },
    currency: { type: String, default: "eur" },
    platformFee: { type: Number, required: true },
    cleanerAmount: { type: Number, required: true },

    stripePaymentIntentId: { type: String, index: true },
    stripeChargeId: { type: String },
    stripeTransferId: { type: String },
    stripeRefundId: { type: String },

    status: {
      type: String,
      enum: ["pending", "paid_held", "released", "refunded", "failed"],
      default: "pending",
      index: true,
    },

    releasedAt: { type: Date, index: true },
  },
  { timestamps: true },
);

export const Payment = model<IPayment>("Payment", paymentSchema);
