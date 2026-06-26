import { ContentPage } from "./content.model";
import { TContentType } from "./content.interface";
import { contentTypes } from "./content.validation";
import AppError from "../../error/appError";

const isValidType = (type: string): type is TContentType =>
  (contentTypes as readonly string[]).includes(type);

// ─── Read a single page (public) ──────────────────────────────────────────────
const getContent = async (type: string) => {
  if (!isValidType(type)) throw new AppError(400, "Invalid content type");

  const page = await ContentPage.findOne({ type });
  // return an empty shell rather than 404 so the app always renders something
  return page || { type, content: "" };
};

// ─── Read all pages ───────────────────────────────────────────────────────────
const getAllContent = async () => {
  const pages = await ContentPage.find();
  const map = new Map(pages.map((p) => [p.type, p.content]));
  return contentTypes.map((type) => ({
    type,
    content: map.get(type) || "",
  }));
};

// ─── Admin: create or update a page ───────────────────────────────────────────
const upsertContent = async (type: string, content: string) => {
  if (!isValidType(type)) throw new AppError(400, "Invalid content type");

  const page = await ContentPage.findOneAndUpdate(
    { type },
    { content },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return page;
};

export const ContentService = {
  getContent,
  getAllContent,
  upsertContent,
};
