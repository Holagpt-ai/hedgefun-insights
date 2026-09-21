/**
 * Security Intelligence V1 record contract.
 *
 * Persists historical facts keyed by securityId. Does not fetch providers,
 * detect episodes, calculate outcomes, or assert causation.
 */

import type { DataFreshnessState, DataProvenanceState, DataQualityState } from "@/config/data-quality.config";
import {
  BACKFILL_JOB_STATES,
  BACKFILL_JOB_TRANSITIONS,
  CORPORATE_EVENT_TYPES,
  EPISODE_DIRECTIONS,
  EPISODE_EVENT_TYPES,
  EPISODE_ORIGINS,
  EPISODE_TIERS,
  EVENT_RELATION_TYPES,
  FORWARD_OUTCOME_HORIZONS,
  INTELLIGENCE_FRESHNESS_STATES,
  INTELLIGENCE_PROVENANCE_STATES,
  INTELLIGENCE_QUALITY_STATES,
  SECURITY_INTELLIGENCE_VERSION,
  type BackfillJobState,
  type CorporateEventType,
  type EpisodeDirection,
  type EpisodeEventType,
  type EpisodeOrigin,
  type EpisodeTier,
  type EventRelationType,
  type ForwardOutcomeHorizon,
} from "@/config/security-intelligence.config";
import { parseTimestampMs } from "@/lib/screeners/contract";
import type {
  CorporateEvent,
  EventReactionLink,
  ForwardOutcome,
  IntelligenceEvidence,
  IntelligenceWriteResult,
  MarketBehaviorEpisode,
  SecurityBackfillJob,
  SecurityDailyHistory,
  SecurityEpisodeEvent,
} from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,11}$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

type EvidenceInput = {
  source?: string | null;
  sourceAsOf?: string | null;
  fetchedAt?: string | null;
  computedAt?: string | null;
  quality?: string | null;
  freshness?: string | null;
  provenance?: string | null;
};

function fail(reason: string): IntelligenceWriteResult<never> {
  return { version: SECURITY_INTELLIGENCE_VERSION, ok: false, reason };
}

function ok<T>(record: T): IntelligenceWriteResult<T> {
  return { version: SECURITY_INTELLIGENCE_VERSION, ok: true, record };
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isCalendarDate(value: string): boolean {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1970 || year > 2100) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function asEnum<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  if (value == null) return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function timestamp(value: string | null | undefined, label: string): { ok: true; iso: string | null } | { ok: false; reason: string } {
  if (value == null || value.trim() === "") return { ok: true, iso: null };
  const ms = parseTimestampMs(value);
  if (ms === null) return { ok: false, reason: `invalid ${label}` };
  return { ok: true, iso: new Date(ms).toISOString() };
}

function optionalNumber(
  value: number | null | undefined,
  label: string,
  options?: { allowNegative?: boolean; integer?: boolean },
): { ok: true; value: number | null } | { ok: false; reason: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, reason: `invalid ${label}` };
  if (options?.integer && !Number.isInteger(value)) return { ok: false, reason: `invalid ${label}` };
  if (!options?.allowNegative && value < 0) return { ok: false, reason: `invalid ${label}` };
  return { ok: true, value };
}

function optionalSymbol(value: string | null | undefined): { ok: true; value: string | null } | { ok: false; reason: string } {
  const symbol = blankToNull(value);
  if (symbol === null) return { ok: true, value: null };
  const upper = symbol.toUpperCase();
  if (!SYMBOL_RE.test(upper)) return { ok: false, reason: "invalid observed symbol" };
  return { ok: true, value: upper };
}

function evidence(input: EvidenceInput): { ok: true; value: IntelligenceEvidence } | { ok: false; reason: string } {
  const sourceAsOf = timestamp(input.sourceAsOf, "sourceAsOf");
  const fetchedAt = timestamp(input.fetchedAt, "fetchedAt");
  const computedAt = timestamp(input.computedAt, "computedAt");
  if (!sourceAsOf.ok) return sourceAsOf;
  if (!fetchedAt.ok) return fetchedAt;
  if (!computedAt.ok) return computedAt;
  const quality = input.quality == null || input.quality === ""
    ? "UNAVAILABLE"
    : asEnum(input.quality, INTELLIGENCE_QUALITY_STATES);
  const freshness = input.freshness == null || input.freshness === ""
    ? "UNKNOWN"
    : asEnum(input.freshness, INTELLIGENCE_FRESHNESS_STATES);
  const provenance = input.provenance == null || input.provenance === ""
    ? "UNKNOWN"
    : asEnum(input.provenance, INTELLIGENCE_PROVENANCE_STATES);
  if (!quality) return { ok: false, reason: "invalid quality" };
  if (!freshness) return { ok: false, reason: "invalid freshness" };
  if (!provenance) return { ok: false, reason: "invalid provenance" };
  return {
    ok: true,
    value: {
      source: blankToNull(input.source),
      sourceAsOf: sourceAsOf.iso,
      fetchedAt: fetchedAt.iso,
      computedAt: computedAt.iso,
      quality: quality as DataQualityState,
      freshness: freshness as DataFreshnessState,
      provenance: provenance as DataProvenanceState,
    },
  };
}

function requiredId(value: string | null | undefined): string | null {
  const id = blankToNull(value);
  if (id === null) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : null;
}

function newId(createId: () => string, supplied?: string | null): string | null {
  if (supplied == null || supplied.trim() === "") return createId();
  return requiredId(supplied);
}

export interface DailyHistoryInput extends EvidenceInput {
  securityId: SecurityId;
  sessionDate: string;
  observedSymbol?: string | null;
  exchange?: string | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  dollarVolume?: number | null;
  previousClose?: number | null;
  movePct?: number | null;
}

export interface EpisodeInput extends EvidenceInput {
  episodeId?: string | null;
  securityId: SecurityId;
  episodeStart: string;
  episodeEnd?: string | null;
  observedSymbol?: string | null;
  direction: string;
  tier: string;
  startPrice?: number | null;
  highPrice?: number | null;
  lowPrice?: number | null;
  endPrice?: number | null;
  maxPositiveMovePct?: number | null;
  maxNegativeMovePct?: number | null;
  volume?: number | null;
  dollarVolume?: number | null;
  rvol?: number | null;
  floatTurnover?: number | null;
  haltCount?: number | null;
  closeStrength?: number | null;
  detectedBy?: string | null;
  origin: string;
  recordedAt: string;
}

export interface CorporateEventInput extends EvidenceInput {
  eventId?: string | null;
  securityId: SecurityId;
  observedSymbol?: string | null;
  eventType: string;
  eventAt: string;
  title: string;
  summary?: string | null;
  sourceUrl?: string | null;
  providerEventId?: string | null;
  accessionId?: string | null;
  metadata?: Record<string, unknown> | null;
  recordedAt: string;
}

export interface EventReactionLinkInput {
  linkId?: string | null;
  eventId: string;
  episodeId: string;
  securityId: SecurityId;
  relationType: string;
  timeDeltaSeconds?: number | null;
  timeDeltaMinutes?: number | null;
  confidence?: number | null;
  evidence?: string | null;
  provenance?: string | null;
  source?: string | null;
  sourceAsOf?: string | null;
  recordedAt: string;
}

export interface ForwardOutcomeInput extends EvidenceInput {
  episodeId: string;
  horizon: string;
  referenceTimestamp?: string | null;
  referencePrice?: number | null;
  outcomePrice?: number | null;
  returnPct?: number | null;
  maxGainPct?: number | null;
  maxDrawdownPct?: number | null;
  highPrice?: number | null;
  lowPrice?: number | null;
  dataAvailable?: boolean | null;
}

export interface EpisodeEventInput {
  episodeEventId?: string | null;
  episodeId: string;
  securityId: SecurityId;
  eventType: string;
  eventAt: string;
  price?: number | null;
  volume?: number | null;
  metadata?: Record<string, unknown> | null;
  provenance?: string | null;
  source?: string | null;
  sourceAsOf?: string | null;
  recordedAt: string;
}

export interface BackfillJobInput {
  jobId?: string | null;
  jobType: string;
  dateFrom: string;
  dateTo: string;
  metadata?: Record<string, unknown> | null;
  recordedAt: string;
}

export interface BackfillTransitionInput {
  to: string;
  recordedAt: string;
  cursorDate?: string | null;
  cursorToken?: string | null;
  processedCount?: number | null;
  errorCount?: number | null;
  metadata?: Record<string, unknown> | null;
}

export class SecurityIntelligenceStore {
  private readonly daily = new Map<string, SecurityDailyHistory>();
  private readonly episodes = new Map<string, MarketBehaviorEpisode>();
  private readonly events = new Map<string, CorporateEvent>();
  private readonly providerEvents = new Map<string, string>();
  private readonly links = new Map<string, EventReactionLink>();
  private readonly outcomes = new Map<string, ForwardOutcome>();
  private readonly episodeEvents = new Map<string, SecurityEpisodeEvent>();
  private readonly jobs = new Map<string, SecurityBackfillJob>();
  private readonly createId: () => string;

  constructor(createId: () => string = () => crypto.randomUUID()) {
    this.createId = createId;
  }

  listDailyHistory(): readonly SecurityDailyHistory[] {
    return [...this.daily.values()];
  }

  listEvents(): readonly CorporateEvent[] {
    return [...this.events.values()];
  }

  listLinks(): readonly EventReactionLink[] {
    return [...this.links.values()];
  }

  listEpisodes(): readonly MarketBehaviorEpisode[] {
    return [...this.episodes.values()];
  }

  listOutcomes(): readonly ForwardOutcome[] {
    return [...this.outcomes.values()];
  }

  getJob(jobId: string): SecurityBackfillJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  putDailyHistory(input: DailyHistoryInput): IntelligenceWriteResult<SecurityDailyHistory> {
    const securityId = requiredId(input.securityId);
    if (!securityId) return fail("invalid securityId");
    if (!isCalendarDate(input.sessionDate)) return fail("invalid sessionDate");
    const observedSymbol = optionalSymbol(input.observedSymbol);
    if (!observedSymbol.ok) return fail(observedSymbol.reason);
    const facts = this.marketFacts(input);
    if (!facts.ok) return fail(facts.reason);
    const proof = evidence(input);
    if (!proof.ok) return fail(proof.reason);
    const key = `${securityId}|${input.sessionDate}`;
    if (this.daily.has(key)) return fail("daily history already exists for securityId and sessionDate");
    const record: SecurityDailyHistory = {
      securityId,
      sessionDate: input.sessionDate,
      observedSymbol: observedSymbol.value,
      exchange: blankToNull(input.exchange)?.toUpperCase() ?? null,
      ...facts.value,
      ...proof.value,
    };
    this.daily.set(key, record);
    return ok(record);
  }

  putEpisode(input: EpisodeInput): IntelligenceWriteResult<MarketBehaviorEpisode> {
    const securityId = requiredId(input.securityId);
    if (!securityId) return fail("invalid securityId");
    const episodeId = newId(this.createId, input.episodeId);
    if (!episodeId) return fail("invalid episodeId");
    if (this.episodes.has(episodeId)) return fail("episode already exists");
    const direction = asEnum(input.direction, EPISODE_DIRECTIONS);
    const tier = asEnum(input.tier, EPISODE_TIERS);
    const origin = asEnum(input.origin, EPISODE_ORIGINS);
    if (!direction) return fail("invalid episode direction");
    if (!tier) return fail("invalid episode tier");
    if (!origin) return fail("invalid episode origin");
    const episodeStart = timestamp(input.episodeStart, "episodeStart");
    const episodeEnd = timestamp(input.episodeEnd, "episodeEnd");
    const recordedAt = timestamp(input.recordedAt, "recordedAt");
    if (!episodeStart.ok || episodeStart.iso === null) return fail("invalid episodeStart");
    if (!episodeEnd.ok) return fail(episodeEnd.reason);
    if (!recordedAt.ok || recordedAt.iso === null) return fail("invalid recordedAt");
    if (episodeEnd.iso !== null && episodeEnd.iso < episodeStart.iso) return fail("episodeEnd before episodeStart");
    const observedSymbol = optionalSymbol(input.observedSymbol);
    if (!observedSymbol.ok) return fail(observedSymbol.reason);
    const startPrice = optionalNumber(input.startPrice, "startPrice");
    const highPrice = optionalNumber(input.highPrice, "highPrice");
    const lowPrice = optionalNumber(input.lowPrice, "lowPrice");
    const endPrice = optionalNumber(input.endPrice, "endPrice");
    const maxPositiveMovePct = optionalNumber(input.maxPositiveMovePct, "maxPositiveMovePct", { allowNegative: true });
    const maxNegativeMovePct = optionalNumber(input.maxNegativeMovePct, "maxNegativeMovePct", { allowNegative: true });
    const volume = optionalNumber(input.volume, "volume");
    const dollarVolume = optionalNumber(input.dollarVolume, "dollarVolume");
    const rvol = optionalNumber(input.rvol, "rvol");
    const floatTurnover = optionalNumber(input.floatTurnover, "floatTurnover");
    const haltCount = optionalNumber(input.haltCount, "haltCount", { integer: true });
    const closeStrength = optionalNumber(input.closeStrength, "closeStrength", { allowNegative: true });
    const numbers = [
      startPrice, highPrice, lowPrice, endPrice, maxPositiveMovePct, maxNegativeMovePct,
      volume, dollarVolume, rvol, floatTurnover, haltCount, closeStrength,
    ];
    for (const number of numbers) if (!number.ok) return fail(number.reason);
    const proof = evidence(input);
    if (!proof.ok) return fail(proof.reason);
    const record: MarketBehaviorEpisode = {
      episodeId,
      securityId,
      episodeStart: episodeStart.iso,
      episodeEnd: episodeEnd.iso,
      observedSymbol: observedSymbol.value,
      direction: direction as EpisodeDirection,
      tier: tier as EpisodeTier,
      startPrice: startPrice.ok ? startPrice.value : null,
      highPrice: highPrice.ok ? highPrice.value : null,
      lowPrice: lowPrice.ok ? lowPrice.value : null,
      endPrice: endPrice.ok ? endPrice.value : null,
      maxPositiveMovePct: maxPositiveMovePct.ok ? maxPositiveMovePct.value : null,
      maxNegativeMovePct: maxNegativeMovePct.ok ? maxNegativeMovePct.value : null,
      volume: volume.ok ? volume.value : null,
      dollarVolume: dollarVolume.ok ? dollarVolume.value : null,
      rvol: rvol.ok ? rvol.value : null,
      floatTurnover: floatTurnover.ok ? floatTurnover.value : null,
      haltCount: haltCount.ok ? haltCount.value : null,
      closeStrength: closeStrength.ok ? closeStrength.value : null,
      detectedBy: blankToNull(input.detectedBy),
      origin: origin as EpisodeOrigin,
      ...proof.value,
      createdAt: recordedAt.iso,
      updatedAt: recordedAt.iso,
    };
    this.episodes.set(episodeId, record);
    return ok(record);
  }

  putCorporateEvent(input: CorporateEventInput): IntelligenceWriteResult<CorporateEvent> {
    const securityId = requiredId(input.securityId);
    if (!securityId) return fail("invalid securityId");
    const eventId = newId(this.createId, input.eventId);
    if (!eventId) return fail("invalid eventId");
    if (this.events.has(eventId)) return fail("event already exists");
    const eventType = asEnum(input.eventType, CORPORATE_EVENT_TYPES);
    if (!eventType) return fail("invalid event type");
    const title = blankToNull(input.title);
    if (title === null) return fail("title required");
    const eventAt = timestamp(input.eventAt, "eventAt");
    const recordedAt = timestamp(input.recordedAt, "recordedAt");
    if (!eventAt.ok || eventAt.iso === null) return fail("invalid eventAt");
    if (!recordedAt.ok || recordedAt.iso === null) return fail("invalid recordedAt");
    const observedSymbol = optionalSymbol(input.observedSymbol);
    if (!observedSymbol.ok) return fail(observedSymbol.reason);
    const proof = evidence(input);
    if (!proof.ok) return fail(proof.reason);
    const providerEventId = blankToNull(input.providerEventId);
    const source = proof.value.source;
    if (providerEventId && source) {
      const providerKey = `${source}|${providerEventId}`;
      if (this.providerEvents.has(providerKey)) return fail("provider event id already stored");
      this.providerEvents.set(providerKey, eventId);
    }
    const record: CorporateEvent = {
      eventId,
      securityId,
      observedSymbol: observedSymbol.value,
      eventType: eventType as CorporateEventType,
      eventAt: eventAt.iso,
      title,
      summary: blankToNull(input.summary),
      sourceUrl: blankToNull(input.sourceUrl),
      providerEventId,
      accessionId: blankToNull(input.accessionId),
      metadata: input.metadata ?? null,
      ...proof.value,
      createdAt: recordedAt.iso,
    };
    this.events.set(eventId, record);
    return ok(record);
  }

  putEventReactionLink(input: EventReactionLinkInput): IntelligenceWriteResult<EventReactionLink> {
    const event = this.events.get(input.eventId);
    const episode = this.episodes.get(input.episodeId);
    if (!event) return fail("event not found");
    if (!episode) return fail("episode not found");
    const securityId = requiredId(input.securityId);
    if (!securityId) return fail("invalid securityId");
    if (securityId !== event.securityId || securityId !== episode.securityId) {
      return fail("link securityId does not match event and episode");
    }
    const relationType = asEnum(input.relationType, EVENT_RELATION_TYPES);
    if (!relationType) return fail("invalid relation type");
    const linkId = newId(this.createId, input.linkId);
    if (!linkId) return fail("invalid linkId");
    const recordedAt = timestamp(input.recordedAt, "recordedAt");
    const sourceAsOf = timestamp(input.sourceAsOf, "sourceAsOf");
    if (!recordedAt.ok || recordedAt.iso === null) return fail("invalid recordedAt");
    if (!sourceAsOf.ok) return fail(sourceAsOf.reason);
    const timeDeltaSeconds = optionalNumber(input.timeDeltaSeconds, "timeDeltaSeconds", { allowNegative: true, integer: true });
    const timeDeltaMinutes = optionalNumber(input.timeDeltaMinutes, "timeDeltaMinutes", { allowNegative: true, integer: true });
    const confidence = optionalNumber(input.confidence, "confidence");
    if (!timeDeltaSeconds.ok) return fail(timeDeltaSeconds.reason);
    if (!timeDeltaMinutes.ok) return fail(timeDeltaMinutes.reason);
    if (!confidence.ok) return fail(confidence.reason);
    if (confidence.value !== null && confidence.value > 1) return fail("invalid confidence");
    const provenance = input.provenance == null || input.provenance === ""
      ? "UNKNOWN"
      : asEnum(input.provenance, INTELLIGENCE_PROVENANCE_STATES);
    if (!provenance) return fail("invalid provenance");
    const record: EventReactionLink = {
      linkId,
      eventId: event.eventId,
      episodeId: episode.episodeId,
      securityId,
      relationType: relationType as EventRelationType,
      timeDeltaSeconds: timeDeltaSeconds.value,
      timeDeltaMinutes: timeDeltaMinutes.value,
      confidence: confidence.value,
      evidence: blankToNull(input.evidence),
      provenance,
      source: blankToNull(input.source),
      sourceAsOf: sourceAsOf.iso,
      createdAt: recordedAt.iso,
    };
    this.links.set(linkId, record);
    return ok(record);
  }

  putForwardOutcome(input: ForwardOutcomeInput): IntelligenceWriteResult<ForwardOutcome> {
    const episode = this.episodes.get(input.episodeId);
    if (!episode) return fail("episode not found");
    const horizon = asEnum(input.horizon, FORWARD_OUTCOME_HORIZONS);
    if (!horizon) return fail("invalid horizon");
    const key = `${episode.episodeId}|${horizon}`;
    if (this.outcomes.has(key)) return fail("forward outcome already exists for episode and horizon");
    const referenceTimestamp = timestamp(input.referenceTimestamp, "referenceTimestamp");
    if (!referenceTimestamp.ok) return fail(referenceTimestamp.reason);
    const referencePrice = optionalNumber(input.referencePrice, "referencePrice");
    const outcomePrice = optionalNumber(input.outcomePrice, "outcomePrice");
    const returnPct = optionalNumber(input.returnPct, "returnPct", { allowNegative: true });
    const maxGainPct = optionalNumber(input.maxGainPct, "maxGainPct", { allowNegative: true });
    const maxDrawdownPct = optionalNumber(input.maxDrawdownPct, "maxDrawdownPct", { allowNegative: true });
    const highPrice = optionalNumber(input.highPrice, "highPrice");
    const lowPrice = optionalNumber(input.lowPrice, "lowPrice");
    const numbers = [referencePrice, outcomePrice, returnPct, maxGainPct, maxDrawdownPct, highPrice, lowPrice];
    for (const number of numbers) if (!number.ok) return fail(number.reason);
    const proof = evidence(input);
    if (!proof.ok) return fail(proof.reason);
    const dataAvailable = input.dataAvailable === true;
    const record: ForwardOutcome = {
      episodeId: episode.episodeId,
      horizon: horizon as ForwardOutcomeHorizon,
      referenceTimestamp: referenceTimestamp.iso,
      referencePrice: referencePrice.ok ? referencePrice.value : null,
      outcomePrice: outcomePrice.ok ? outcomePrice.value : null,
      returnPct: returnPct.ok ? returnPct.value : null,
      maxGainPct: maxGainPct.ok ? maxGainPct.value : null,
      maxDrawdownPct: maxDrawdownPct.ok ? maxDrawdownPct.value : null,
      highPrice: highPrice.ok ? highPrice.value : null,
      lowPrice: lowPrice.ok ? lowPrice.value : null,
      dataAvailable,
      ...proof.value,
    };
    this.outcomes.set(key, record);
    return ok(record);
  }

  putEpisodeEvent(input: EpisodeEventInput): IntelligenceWriteResult<SecurityEpisodeEvent> {
    const episode = this.episodes.get(input.episodeId);
    if (!episode) return fail("episode not found");
    const securityId = requiredId(input.securityId);
    if (!securityId || securityId !== episode.securityId) return fail("episode event securityId mismatch");
    const eventType = asEnum(input.eventType, EPISODE_EVENT_TYPES);
    if (!eventType) return fail("invalid episode event type");
    const episodeEventId = newId(this.createId, input.episodeEventId);
    if (!episodeEventId) return fail("invalid episodeEventId");
    const eventAt = timestamp(input.eventAt, "eventAt");
    const recordedAt = timestamp(input.recordedAt, "recordedAt");
    const sourceAsOf = timestamp(input.sourceAsOf, "sourceAsOf");
    if (!eventAt.ok || eventAt.iso === null) return fail("invalid eventAt");
    if (!recordedAt.ok || recordedAt.iso === null) return fail("invalid recordedAt");
    if (!sourceAsOf.ok) return fail(sourceAsOf.reason);
    const price = optionalNumber(input.price, "price");
    const volume = optionalNumber(input.volume, "volume");
    if (!price.ok) return fail(price.reason);
    if (!volume.ok) return fail(volume.reason);
    const provenance = input.provenance == null || input.provenance === ""
      ? "UNKNOWN"
      : asEnum(input.provenance, INTELLIGENCE_PROVENANCE_STATES);
    if (!provenance) return fail("invalid provenance");
    const record: SecurityEpisodeEvent = {
      episodeEventId,
      episodeId: episode.episodeId,
      securityId,
      eventType: eventType as EpisodeEventType,
      eventAt: eventAt.iso,
      price: price.value,
      volume: volume.value,
      metadata: input.metadata ?? null,
      provenance,
      source: blankToNull(input.source),
      sourceAsOf: sourceAsOf.iso,
      createdAt: recordedAt.iso,
    };
    this.episodeEvents.set(episodeEventId, record);
    return ok(record);
  }

  createBackfillJob(input: BackfillJobInput): IntelligenceWriteResult<SecurityBackfillJob> {
    const jobType = blankToNull(input.jobType);
    if (jobType === null) return fail("jobType required");
    if (!isCalendarDate(input.dateFrom) || !isCalendarDate(input.dateTo)) return fail("invalid backfill range");
    if (input.dateFrom > input.dateTo) return fail("dateFrom after dateTo");
    const recordedAt = timestamp(input.recordedAt, "recordedAt");
    if (!recordedAt.ok || recordedAt.iso === null) return fail("invalid recordedAt");
    const jobId = newId(this.createId, input.jobId);
    if (!jobId) return fail("invalid jobId");
    if (this.jobs.has(jobId)) return fail("job already exists");
    const record: SecurityBackfillJob = {
      jobId,
      jobType,
      state: "PENDING",
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      cursorDate: null,
      cursorToken: null,
      processedCount: 0,
      errorCount: 0,
      startedAt: null,
      updatedAt: recordedAt.iso,
      completedAt: null,
      metadata: input.metadata ?? null,
    };
    this.jobs.set(jobId, record);
    return ok(record);
  }

  transitionBackfillJob(jobId: string, input: BackfillTransitionInput): IntelligenceWriteResult<SecurityBackfillJob> {
    const current = this.jobs.get(jobId);
    if (!current) return fail("job not found");
    const to = asEnum(input.to, BACKFILL_JOB_STATES);
    if (!to) return fail("invalid backfill state");
    if (!(BACKFILL_JOB_TRANSITIONS[current.state] as readonly string[]).includes(to)) {
      return fail(`cannot transition ${current.state} to ${to}`);
    }
    const recordedAt = timestamp(input.recordedAt, "recordedAt");
    if (!recordedAt.ok || recordedAt.iso === null) return fail("invalid recordedAt");
    let cursorDate = current.cursorDate;
    if (input.cursorDate !== undefined) {
      if (input.cursorDate !== null && !isCalendarDate(input.cursorDate)) return fail("invalid cursorDate");
      if (input.cursorDate !== null && (input.cursorDate < current.dateFrom || input.cursorDate > current.dateTo)) {
        return fail("cursorDate outside job range");
      }
      cursorDate = input.cursorDate;
    }
    const processedCount = input.processedCount == null
      ? current.processedCount
      : optionalNumber(input.processedCount, "processedCount", { integer: true });
    const errorCount = input.errorCount == null
      ? current.errorCount
      : optionalNumber(input.errorCount, "errorCount", { integer: true });
    if (typeof processedCount !== "number" && !processedCount.ok) return fail(processedCount.reason);
    if (typeof errorCount !== "number" && !errorCount.ok) return fail(errorCount.reason);
    const next: SecurityBackfillJob = {
      ...current,
      state: to as BackfillJobState,
      cursorDate,
      cursorToken: input.cursorToken === undefined ? current.cursorToken : blankToNull(input.cursorToken),
      processedCount: typeof processedCount === "number" ? processedCount : processedCount.value ?? current.processedCount,
      errorCount: typeof errorCount === "number" ? errorCount : errorCount.value ?? current.errorCount,
      startedAt: to === "RUNNING" && current.startedAt === null ? recordedAt.iso : current.startedAt,
      updatedAt: recordedAt.iso,
      completedAt: to === "COMPLETE" ? recordedAt.iso : current.completedAt,
      metadata: input.metadata === undefined ? current.metadata : input.metadata,
    };
    this.jobs.set(jobId, next);
    return ok(next);
  }

  private marketFacts(input: DailyHistoryInput): { ok: true; value: Pick<SecurityDailyHistory, "open" | "high" | "low" | "close" | "volume" | "dollarVolume" | "previousClose" | "movePct"> } | { ok: false; reason: string } {
    const open = optionalNumber(input.open, "open");
    const high = optionalNumber(input.high, "high");
    const low = optionalNumber(input.low, "low");
    const close = optionalNumber(input.close, "close");
    const volume = optionalNumber(input.volume, "volume");
    const dollarVolume = optionalNumber(input.dollarVolume, "dollarVolume");
    const previousClose = optionalNumber(input.previousClose, "previousClose");
    const movePct = optionalNumber(input.movePct, "movePct", { allowNegative: true });
    const numbers = [open, high, low, close, volume, dollarVolume, previousClose, movePct];
    for (const number of numbers) if (!number.ok) return number;
    return {
      ok: true,
      value: {
        open: open.ok ? open.value : null,
        high: high.ok ? high.value : null,
        low: low.ok ? low.value : null,
        close: close.ok ? close.value : null,
        volume: volume.ok ? volume.value : null,
        dollarVolume: dollarVolume.ok ? dollarVolume.value : null,
        previousClose: previousClose.ok ? previousClose.value : null,
        movePct: movePct.ok ? movePct.value : null,
      },
    };
  }
}

export function createSecurityIntelligenceStore(createId?: () => string): SecurityIntelligenceStore {
  return new SecurityIntelligenceStore(createId);
}
