// Maps HedgeFun's internal language codes to BCP-47 speech recognition
// language tags. Decoupled from LanguageContext's `Language` type so this
// can grow independently — add a new key here when a language is added
// to LanguageContext, no other changes required.
export const SPEECH_LANG_MAP: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
};

export const DEFAULT_SPEECH_LANG = "en-US";

export function getSpeechLang(language: string): string {
  return SPEECH_LANG_MAP[language] ?? DEFAULT_SPEECH_LANG;
}
