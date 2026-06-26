import express from "express";
import { auth } from "../../middleware/auth";
import { validateRequest } from "../../middleware/validateRequest";
import { AccommodationController } from "./accommodation.controller";
import {
  createAccommodationSchema,
  updateAccommodationSchema,
} from "./accommodation.validation";
import { upload } from "../../middleware/multer";

const router = express.Router();

// POST /api/v1/accommodation — Create (formdata: photos[])
router.post(
  "/",
  auth("admin", "host"),
  upload.array("photos", 10),
  validateRequest(createAccommodationSchema),
  AccommodationController.createAccommodation,
);

// GET /api/v1/accommodation — List with filter + pagination
// Query: ?status=scheduled&accommodationType=Apartment&city=Paris&search=T3&page=1&limit=10
router.get(
  "/",
  auth("admin", "host"),
  AccommodationController.getMyAccommodations,
);

// GET /api/v1/accommodation/:id — Single
router.get(
  "/:id",
  auth("admin", "host"),
  AccommodationController.getAccommodationById,
);

// PATCH /api/v1/accommodation/:id — Update (formdata: photos[])
router.patch(
  "/:id",
  auth("admin", "host"),
  upload.array("photos", 10),
  validateRequest(updateAccommodationSchema),
  AccommodationController.updateAccommodation,
);

// DELETE /api/v1/accommodation/:id — Soft delete
router.delete(
  "/:id",
  auth("admin", "host"),
  AccommodationController.deleteAccommodation,
);

export const AccommodationRoutes = router;
