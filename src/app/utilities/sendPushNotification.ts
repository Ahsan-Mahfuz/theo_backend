import config from "../config";

interface IPushPayload {
  title:    string;
  message:  string;
  data?:    Record<string, unknown>;
}

/**
 * Send a push notification to a single user via OneSignal.
 * @param playerId  - OneSignal player/subscription ID saved on the User model
 * @param payload   - { title, message, data }
 */
const sendPushNotification = async (
  playerId: string,
  payload: IPushPayload,
): Promise<void> => {
  if (!playerId) return; // user hasn't granted push permission yet

  try {
    const body = {
      app_id:             config.onesignal_app_id,
      include_player_ids: [playerId],
      headings:           { en: payload.title },
      contents:           { en: payload.message },
      data:               payload.data || {},         // extra key-value pairs for the app
      ios_badgeType:      "Increase",
      ios_badgeCount:     1,
    };

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Basic ${config.onesignal_rest_api_key}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json() as Record<string, unknown>;

    if (!response.ok) {
      console.error("❌ OneSignal push failed:", result);
    } else {
      console.log(`✅ Push sent — playerId: ${playerId}, id: ${result.id}`);
    }
  } catch (err: unknown) {
    // never throw — push failure should not break the main flow
    console.error("❌ OneSignal error:", (err as Error).message);
  }
};

export default sendPushNotification;