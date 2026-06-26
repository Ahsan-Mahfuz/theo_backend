import { Schema, model } from "mongoose";
import { IContentPage } from "./content.interface";

const contentSchema = new Schema<IContentPage>(
  {
    type: {
      type: String,
      enum: ["about_us", "terms_of_use", "privacy_policy", "legal_notice"],
      required: true,
      unique: true,
    },
    content: { type: String, default: "" },
  },
  { timestamps: true },
);

export const ContentPage = model<IContentPage>("ContentPage", contentSchema);
