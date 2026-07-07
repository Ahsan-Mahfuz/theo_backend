/**
 * Branded, email-client-safe OTP template for Gestlio.
 *
 * Uses table-based layout with inline styles so it renders consistently across
 * Gmail, Apple Mail, and Outlook (which ignore <style> blocks and flexbox).
 * The OTP is shown as individual digit boxes, mirroring the app's input UI.
 */

type OtpEmailOptions = {
  otp: string;
  /** Big title inside the card, e.g. "Verify your email". */
  heading?: string;
  /** Short sentence under the title explaining the purpose. */
  intro?: string;
  /** Minutes until the code expires (for the copy). */
  minutes?: number;
};

const BRAND = "#0088FF";
const BRAND_DARK = "#0063CC";
const INK = "#0F172A";
const MUTED = "#64748B";
const BG = "#EEF3F8";
const BORDER = "#E2E8F0";

const digitBoxes = (otp: string): string =>
  otp
    .split("")
    .map(
      (d) => `
              <td align="center" style="padding:0 6px;">
                <div style="width:52px;height:60px;line-height:60px;background-color:#F4F8FF;border:1px solid ${BORDER};border-radius:12px;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:700;color:${BRAND};text-align:center;">${d}</div>
              </td>`
    )
    .join("");

const otpEmailTemplate = ({
  otp,
  heading = "Verify your email",
  intro = "Use the verification code below to continue.",
  minutes = 10,
}: OtpEmailOptions): string => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light only" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${BG};">
    <!-- preheader (hidden) -->
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};">
      Your Gestlio code is ${otp}. It expires in ${minutes} minutes.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG};padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">

            <!-- header / brand -->
            <tr>
              <td style="background-color:${BRAND};background:linear-gradient(135deg,${BRAND} 0%,${BRAND_DARK} 100%);padding:28px 32px;" align="left">
                <span style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">Gestlio</span>
              </td>
            </tr>

            <!-- body -->
            <tr>
              <td style="padding:36px 32px 8px 32px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
                <h1 style="margin:0 0 10px 0;font-size:22px;line-height:1.3;font-weight:700;color:${INK};">${heading}</h1>
                <p style="margin:0 0 26px 0;font-size:15px;line-height:1.6;color:${MUTED};">${intro}</p>

                <!-- OTP boxes -->
                <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 22px auto;">
                  <tr>${digitBoxes(otp)}
                  </tr>
                </table>

                <!-- expiry pill -->
                <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 8px auto;">
                  <tr>
                    <td style="background-color:#F1F5F9;border-radius:999px;padding:8px 16px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${MUTED};">
                      ⏱ This code expires in <strong style="color:${INK};">${minutes} minutes</strong>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- divider -->
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <div style="height:1px;background-color:${BORDER};"></div>
              </td>
            </tr>

            <!-- security note -->
            <tr>
              <td style="padding:18px 32px 30px 32px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">
                  For your security, never share this code with anyone. If you didn't request it, you can safely ignore this email.
                </p>
              </td>
            </tr>

            <!-- footer -->
            <tr>
              <td style="background-color:#F8FAFC;padding:20px 32px;text-align:center;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
                <p style="margin:0;font-size:12px;color:#94A3B8;">&copy; ${new Date().getFullYear()} Gestlio. All rights reserved.</p>
                <p style="margin:6px 0 0 0;font-size:12px;color:#94A3B8;">Effortless cleaning management for your properties.</p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

export default otpEmailTemplate;
