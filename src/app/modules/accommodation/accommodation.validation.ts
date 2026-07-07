import { z } from "zod";
import { ACCOMMODATION_TYPES } from "./accommodation.interface";

// Since this comes via formData, all fields arrive as strings.
// We use z.preprocess to coerce numbers and booleans.

const toNumber = (v: unknown) => {
  if (typeof v === "string") return Number(v);
  return v;
};

const toBoolean = (v: unknown) => {
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
};

export const createAccommodationSchema = z.object({
  // Step 1: General Information
  name: z.string().min(2, "Accommodation name must be at least 2 characters"),
  accommodationType: z.enum(ACCOMMODATION_TYPES as [string, ...string[]], {
    errorMap: () => ({ message: "Invalid accommodation type" }),
  }),
  address: z.string().min(5, "Address must be at least 5 characters"),
  city: z.string().min(1, "City is required"), // free text
  zipCode: z.string().min(1, "Zip code is required"),

  // Step 2: Accommodation Details
  floor: z.string().optional(),
  doorCode: z.string().optional(),
  numberOfRooms: z.preprocess(toNumber, z.number().int().min(1, "At least 1 room")),
  surface: z.preprocess(toNumber, z.number().min(1, "Surface area must be > 0")),
  hasElevator: z.preprocess(toBoolean, z.boolean()).optional(),
  cleaningRate: z.preprocess(toNumber, z.number().min(0, "Cleaning rate must be >= 0")),
  notes: z.string().optional(),

  // Step 4: Practical Information
  keys: z.string().optional(),
  accessCode: z.string().optional(),
  instructions: z.string().optional(),
  frequency: z.string().optional(),
});

export const updateAccommodationSchema = z.object({
  name: z.string().min(2).optional(),
  accommodationType: z
    .enum(ACCOMMODATION_TYPES as [string, ...string[]], {
      errorMap: () => ({ message: "Invalid accommodation type" }),
    })
    .optional(),
  address: z.string().min(5).optional(),
  city: z.string().optional(),
  zipCode: z.string().optional(),
  floor: z.string().optional(),
  doorCode: z.string().optional(),
  numberOfRooms: z.preprocess(toNumber, z.number().int().min(1)).optional(),
  surface: z.preprocess(toNumber, z.number().min(1)).optional(),
  hasElevator: z.preprocess(toBoolean, z.boolean()).optional(),
  cleaningRate: z.preprocess(toNumber, z.number().min(0)).optional(),
  notes: z.string().optional(),
  keys: z.string().optional(),
  accessCode: z.string().optional(),
  instructions: z.string().optional(),
  frequency: z.string().optional(),
  status: z.enum(["scheduled", "not_scheduled"]).optional(),
});
