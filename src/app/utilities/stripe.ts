import Stripe from "stripe";
import config from "../config";

if (!config.stripe_secret_key) {
  // Fail fast: payment features cannot work without the secret key.
  throw new Error("STRIPE_SECRET_KEY is not set in the environment");
}

// Pinned API version — keep stable across the codebase so behaviour doesn't
// shift when Stripe rolls out new versions. Matches stripe SDK v22 (dahlia).
export const stripe = new Stripe(config.stripe_secret_key, {
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

// Same value as a plain string for APIs that take apiVersion as a string
// (e.g. ephemeralKeys.create).
export const PINNED_API_VERSION = "2026-03-25.dahlia";
