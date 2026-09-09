// Catalyst Intelligence V1A feature flags.
// Delivery channels stay disabled. No provider SDKs are loaded here.
// Values are exact string matches against "true" — anything else is off.

export const FLAG_TRUE = "true";

export interface CatalystFlags {
  catalystIntelligenceEnabled: boolean;
  catalystIntelligenceWriteEnabled: boolean;
  catalystAlertGenerationEnabled: boolean;
  alertDeliveryEnabled: boolean;
  pushNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
}

/** Mandatory V1A configuration. Delivery remains off. */
export const V1A_MANDATORY_FLAGS: CatalystFlags = {
  catalystIntelligenceEnabled: true,
  catalystIntelligenceWriteEnabled: false,
  catalystAlertGenerationEnabled: true,
  alertDeliveryEnabled: false,
  pushNotificationsEnabled: false,
  smsNotificationsEnabled: false,
  emailNotificationsEnabled: false,
};

export const FLAG_ENV_KEYS = {
  CATALYST_INTELLIGENCE_ENABLED: "CATALYST_INTELLIGENCE_ENABLED",
  CATALYST_INTELLIGENCE_WRITE_ENABLED: "CATALYST_INTELLIGENCE_WRITE_ENABLED",
  CATALYST_ALERT_GENERATION_ENABLED: "CATALYST_ALERT_GENERATION_ENABLED",
  ALERT_DELIVERY_ENABLED: "ALERT_DELIVERY_ENABLED",
  PUSH_NOTIFICATIONS_ENABLED: "PUSH_NOTIFICATIONS_ENABLED",
  SMS_NOTIFICATIONS_ENABLED: "SMS_NOTIFICATIONS_ENABLED",
  EMAIL_NOTIFICATIONS_ENABLED: "EMAIL_NOTIFICATIONS_ENABLED",
} as const;

export function isFlagEnabled(value: string | undefined | null): boolean {
  return value === FLAG_TRUE;
}

export function readCatalystFlags(
  env: Record<string, string | undefined> | ((key: string) => string | undefined),
): CatalystFlags {
  const get = typeof env === "function"
    ? env
    : (key: string) => env[key];
  return {
    catalystIntelligenceEnabled: isFlagEnabled(get(FLAG_ENV_KEYS.CATALYST_INTELLIGENCE_ENABLED)),
    catalystIntelligenceWriteEnabled: isFlagEnabled(get(FLAG_ENV_KEYS.CATALYST_INTELLIGENCE_WRITE_ENABLED)),
    catalystAlertGenerationEnabled: isFlagEnabled(get(FLAG_ENV_KEYS.CATALYST_ALERT_GENERATION_ENABLED)),
    alertDeliveryEnabled: isFlagEnabled(get(FLAG_ENV_KEYS.ALERT_DELIVERY_ENABLED)),
    pushNotificationsEnabled: isFlagEnabled(get(FLAG_ENV_KEYS.PUSH_NOTIFICATIONS_ENABLED)),
    smsNotificationsEnabled: isFlagEnabled(get(FLAG_ENV_KEYS.SMS_NOTIFICATIONS_ENABLED)),
    emailNotificationsEnabled: isFlagEnabled(get(FLAG_ENV_KEYS.EMAIL_NOTIFICATIONS_ENABLED)),
  };
}

/** Fail-closed defaults when env is unset: intelligence off, delivery off. */
export function failClosedFlags(): CatalystFlags {
  return {
    catalystIntelligenceEnabled: false,
    catalystIntelligenceWriteEnabled: false,
    catalystAlertGenerationEnabled: false,
    alertDeliveryEnabled: false,
    pushNotificationsEnabled: false,
    smsNotificationsEnabled: false,
    emailNotificationsEnabled: false,
  };
}

export function anyDeliveryChannelEnabled(flags: CatalystFlags): boolean {
  return flags.pushNotificationsEnabled ||
    flags.smsNotificationsEnabled ||
    flags.emailNotificationsEnabled;
}

export function canAttemptDelivery(flags: CatalystFlags): boolean {
  return flags.alertDeliveryEnabled && anyDeliveryChannelEnabled(flags);
}
