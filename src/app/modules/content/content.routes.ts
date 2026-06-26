import express from "express";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { ContentController } from "./content.controller";
import { upsertContentSchema } from "./content.validation";

const router = express.Router();

// GET /api/v1/content — all pages (public)
router.get("/", ContentController.getAllContent);

// GET /api/v1/content/:type — single page (public)
// :type = about_us | terms_of_use | privacy_policy
router.get("/:type", ContentController.getContent);

// PUT /api/v1/content/:type — admin create/update
router.put(
  "/:type",
  auth("admin"),
  validateRequest(upsertContentSchema),
  ContentController.upsertContent,
);

export const ContentRoutes = router;
