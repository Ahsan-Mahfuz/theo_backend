import { Document, Types } from "mongoose";

export type TPaymentStatus =
  | "pending" // PaymentIntent created, not yet paid
  | "paid_held" // paid; funds held in the platform balance (escrow)
  | "released" // transferred to the cleaner
  | "refunded" // refunded to the host
  | "failed";

export interface IPayment extends Document {
  schedule: Types.ObjectId;
  host: Types.ObjectId;
  cleaner: Types.ObjectId;
  accommodation: Types.ObjectId;

  amount: number; // total charged, in the smallest currency unit (cents)
  currency: string; // e.g. "usd"
  platformFee: number; // platform commission, in cents
  cleanerAmount: number; // amount transferred to the cleaner, in cents

  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  stripeTransferId?: string;
  stripeRefundId?: string;

  status: TPaymentStatus;

  createdAt: Date;
  updatedAt: Date;
}
