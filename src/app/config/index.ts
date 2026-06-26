import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  NODE_ENV: process.env.NODE_ENV,
  port: process.env.PORT,
  database_url: process.env.DATABASE_URL,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,

  jwt_access_secret: process.env.JWT_ACCESS_SECRET,
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN,
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN,

  // Super Admin
  admin_email: process.env.ADMIN_EMAIL,
  admin_password: process.env.ADMIN_PASSWORD,

  // Email
  smtp: {
    smtp_host: process.env.SMTP_HOST,
    smtp_port: process.env.SMTP_PORT,
    smtp_service: process.env.SMTP_SERVICE,
    smtp_mail: process.env.SMTP_MAIL,
    smtp_pass: process.env.SMTP_PASS,
    name: process.env.SMTP_NAME,
  },

  // Stripe
  stripe_secret_key: process.env.STRIPE_SECRET_KEY,
  stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
  stripe_price_id: process.env.STRIPE_PRICE_ID,
  stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY,
  platform_fee_percent: Number(process.env.PLATFORM_FEE_PERCENT) || 5,
  platform_currency: process.env.PLATFORM_CURRENCY || "usd",
  stripe_connect_return_url: process.env.STRIPE_CONNECT_RETURN_URL,
  stripe_connect_refresh_url: process.env.STRIPE_CONNECT_REFRESH_URL,

  // Traccar
  traccar_url: process.env.TRACCAR_URL,
  traccar_email: process.env.TRACCAR_EMAIL,
  traccar_password: process.env.TRACCAR_PASSWORD,

  // AWS S3
  aws_region: process.env.AWS_REGION,
  aws_access_key_id: process.env.AWS_ACCESS_KEY_ID,
  aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
  aws_s3_bucket: process.env.AWS_S3_BUCKET_NAME,
  cloudfront_url: process.env.CLOUDFRONT_URL,

  // Frontend
  frontend_url: process.env.FRONTEND_URL,

  onesignal_rest_api_key: process.env.ONESIGNAL_REST_API_KEY,
  onesignal_app_id: process.env.ONESIGNAL_APP_ID,
};
