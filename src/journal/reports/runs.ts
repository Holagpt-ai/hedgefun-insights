import { REPORTS_KEY, readJson } from "../lib/storage";

export interface ReportRun {
  id: string;
  templateId: string;
  createdAt: string;
  snapshot: Record<string, string | number | null>;
  watermark?: boolean;
}

export function loadRuns(): ReportRun[] {
  return readJson<ReportRun[]>(REPORTS_KEY, []);
}
