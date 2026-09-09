// Notification Router interface only.
// Hard boundary: AlertEvent -> Notification Router.
// Never Twilio. Never OneSignal. Never email-provider SDKs.
// V1 delivery is always refused unless every delivery flag is explicitly true,
// and even then this router still has no transport implementation.

import type { CatalystFlags } from "./flags.ts";
import { canAttemptDelivery } from "./flags.ts";
import type { AlertEvent, NotificationRouteResult, NotificationRouter } from "./types.ts";

export const DELIVERY_DISABLED_REASON = "ALERT_DELIVERY_ENABLED=false";
export const NO_TRANSPORT_REASON = "NO_DELIVERY_TRANSPORT_IN_V1";
export const CHANNEL_DISABLED_REASON = "ALL_NOTIFICATION_CHANNELS_DISABLED";

const NO_CHANNELS = { push: false, sms: false, email: false } as const;

export function createNotificationRouter(flags: CatalystFlags): NotificationRouter {
  return {
    route(event: AlertEvent): NotificationRouteResult {
      void event;
      if (!flags.alertDeliveryEnabled) {
        return {
          attempted: false,
          delivered: false,
          reason: DELIVERY_DISABLED_REASON,
          channels: { ...NO_CHANNELS },
        };
      }
      if (!canAttemptDelivery(flags)) {
        return {
          attempted: false,
          delivered: false,
          reason: CHANNEL_DISABLED_REASON,
          channels: { ...NO_CHANNELS },
        };
      }
      return {
        attempted: false,
        delivered: false,
        reason: NO_TRANSPORT_REASON,
        channels: { ...NO_CHANNELS },
      };
    },
  };
}
