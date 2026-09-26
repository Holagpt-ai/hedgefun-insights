export type EpisodeTemporalRelationship =
  | "EVENT_PRECEDES_EPISODE"
  | "EVENT_SAME_SESSION"
  | "EVENT_FOLLOWS_EPISODE"
  | "TEMPORALLY_ASSOCIATED";

export function eventRelationToTemporalRelationship(
  relation: string,
): EpisodeTemporalRelationship {
  switch (relation) {
    case "PRECEDES_EPISODE":
      return "EVENT_PRECEDES_EPISODE";
    case "SAME_WINDOW":
    case "OVERLAPS_EPISODE":
      return "EVENT_SAME_SESSION";
    case "FOLLOWS_EPISODE":
      return "EVENT_FOLLOWS_EPISODE";
    default:
      return "TEMPORALLY_ASSOCIATED";
  }
}
