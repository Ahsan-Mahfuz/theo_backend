import { AppSettings } from "./settings.model";
import config from "../../config";

// Always operate on a single "global" settings document, creating it lazily.
const getSettings = async () => {
  let settings = await AppSettings.findOne({ key: "global" });
  if (!settings) {
    settings = await AppSettings.create({
      key: "global",
      platformCommission: config.platform_fee_percent,
      icalSyncInterval: 20,
      supportEmail: (config.admin_email as string) || "",
    });
  }
  return settings;
};

// The slice any signed-in user may read: the commission the host is charged on
// top of the cleaning rate, so the app can show the same breakdown as checkout.
const getPublicSettings = async () => {
  const settings = await getSettings();
  return { platformCommission: settings.platformCommission };
};

const updateSettings = async (payload: {
  platformCommission?: number;
  icalSyncInterval?: number;
  supportEmail?: string;
}) => {
  const update: Record<string, unknown> = {};
  if (payload.platformCommission !== undefined)
    update.platformCommission = payload.platformCommission;
  if (payload.icalSyncInterval !== undefined)
    update.icalSyncInterval = payload.icalSyncInterval;
  if (payload.supportEmail !== undefined)
    update.supportEmail = payload.supportEmail;

  const settings = await AppSettings.findOneAndUpdate(
    { key: "global" },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return settings;
};

export const SettingsService = {
  getSettings,
  getPublicSettings,
  updateSettings,
};
