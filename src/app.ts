/* eslint-disable @typescript-eslint/no-explicit-any */
import express, { Request, Response } from "express";
import cors from "cors";
import notFound from "./app/middleware/notFoundRoute";
import { timezoneContext } from "./app/middleware/timezone";
import router from "./app/routes";
import errorMiddleware from "./app/middleware/globalErrorHandler";
import { PaymentController } from "./app/modules/payment/payment.controller";
import config from "./app/config";

const app = express();

// Stripe webhook needs the RAW body for signature verification — must be
// registered BEFORE express.json() so the body isn't parsed/consumed.
app.post(
  "/api/v1/payment/webhook",
  express.raw({ type: "application/json" }),
  PaymentController.webhook,
);

app.use(express.json());

const corsOptions = {
  origin: (origin: any, callback: any) => callback(null, true),
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use("/uploads", express.static("uploads"));
// Capture the viewer's timezone (x-timezone header) into request-scoped context
// before any route runs, so responses render dates in the viewer's local zone.
app.use(timezoneContext);
app.use("/api/v1", router);

app.get("/", (_req: Request, res: Response) => {
  res.send("Gestlio API Server is running.");
});

// ─── Stripe Connect onboarding landing pages ──────────────────────────────────
// Stripe redirects the cleaner's browser here after (or during) onboarding.
// In production these should be frontend pages or app deep links.
app.get("/stripe/connect/return", (_req: Request, res: Response) => {
  res.send(
    `<html><body style="font-family:sans-serif;text-align:center;padding-top:60px">
      <h2>✅ Payout setup complete</h2>
      <p>You can close this window and return to the Gestlio app.</p>
    </body></html>`,
  );
});

app.get("/stripe/connect/refresh", (_req: Request, res: Response) => {
  res.send(
    `<html><body style="font-family:sans-serif;text-align:center;padding-top:60px">
      <h2>⏳ Onboarding link expired</h2>
      <p>Please reopen payout setup from the Gestlio app to continue.</p>
    </body></html>`,
  );
});

// ─── Test checkout page (DEV ONLY) ────────────────────────────────────────────
// Open /pay-test?cs=<paymentIntentClientSecret> in a browser and pay with the
// test card 4242 4242 4242 4242. This simulates the web/app frontend.
app.get("/pay-test", (req: Request, res: Response) => {
  const cs = String(req.query.cs || "");
  const pk = config.stripe_publishable_key || "";
  res.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://js.stripe.com/v3/"></script>
<style>body{font-family:sans-serif;max-width:420px;margin:40px auto;padding:0 16px}
button{width:100%;padding:12px;margin-top:16px;background:#635bff;color:#fff;border:0;border-radius:6px;font-size:16px;cursor:pointer}
#msg{margin-top:14px}</style></head><body>
<h2>Gestlio — Test payment</h2>
<p>Test card: <b>4242 4242 4242 4242</b>, any future date, any CVC.</p>
<div id="payment-element"></div>
<button id="pay">Pay now</button>
<div id="msg"></div>
<script>
const pk = ${JSON.stringify(pk)};
const clientSecret = ${JSON.stringify(cs)};
const msg = document.getElementById('msg');
if (!pk || pk.indexOf('replace_with') !== -1) {
  msg.textContent = '⚠️ Set a real STRIPE_PUBLISHABLE_KEY (pk_test_...) in .env and restart the server.';
  document.getElementById('pay').disabled = true;
} else if (!clientSecret) {
  msg.textContent = '⚠️ Missing ?cs=<paymentIntentClientSecret> in the URL.';
  document.getElementById('pay').disabled = true;
} else {
  const stripe = Stripe(pk);
  const elements = stripe.elements({ clientSecret });
  elements.create('payment').mount('#payment-element');
  document.getElementById('pay').onclick = async () => {
    msg.textContent = 'Processing…';
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
    if (error) { msg.textContent = '❌ ' + error.message; }
    else { msg.textContent = '✅ ' + paymentIntent.status + ' — check your webhook/DB'; }
  };
}
</script></body></html>`);
});

app.use(errorMiddleware);
app.use(notFound);

export default app;
