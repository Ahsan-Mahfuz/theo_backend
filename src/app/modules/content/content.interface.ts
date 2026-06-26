import { Document } from "mongoose";

export type TContentType =
  | "about_us"
  | "terms_of_use"
  | "privacy_policy"
  | "legal_notice";

export interface IContentPage extends Document {
  type: TContentType;
  content: string; // HTML or plain text
  createdAt: Date;
  updatedAt: Date;
}
