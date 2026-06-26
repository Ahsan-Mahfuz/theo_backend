import express from "express";
import { auth } from "../../middleware/auth";
import { UserController } from "./user.controller";

const router = express.Router();

// GET /api/v1/user/all
// Admin → can see everyone
router.get("/all", auth("admin"), UserController.getAllUsers);

export const UserRoutes = router;
