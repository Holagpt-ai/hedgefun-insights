import { useCallback, useEffect, useState } from "react";
import {
  RADAR_COLUMN_STORAGE_KEY,
  canonicalizeRadarColumns,
  defaultRadarColumns,
  parseSavedRadarColumns,
  type RadarColumnId,
} from "./radar-grid-columns";

function readStoredColumns(): RadarColumnId[] {
  try {
    return parseSavedRadarColumns(window.localStorage.getItem(RADAR_COLUMN_STORAGE_KEY))
      ?? defaultRadarColumns();
  } catch {
    return defaultRadarColumns();
  }
}

function writeStoredColumns(ids: readonly RadarColumnId[]): void {
  try {
    window.localStorage.setItem(RADAR_COLUMN_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private mode / quota — column choice stays in memory for this session.
  }
}

export function useRadarColumnVisibility() {
  const [visibleColumns, setVisibleColumns] = useState<RadarColumnId[]>(defaultRadarColumns);

  useEffect(() => {
    setVisibleColumns(readStoredColumns());
  }, []);

  useEffect(() => {
    writeStoredColumns(visibleColumns);
  }, [visibleColumns]);

  const toggleColumn = useCallback((id: RadarColumnId) => {
    setVisibleColumns((current) => {
      const has = current.includes(id);
      if (has) return canonicalizeRadarColumns(current.filter((columnId) => columnId !== id));
      return canonicalizeRadarColumns([...current, id]);
    });
  }, []);

  const resetColumns = useCallback(() => {
    setVisibleColumns(defaultRadarColumns());
  }, []);

  const isColumnVisible = useCallback(
    (id: RadarColumnId) => visibleColumns.includes(id),
    [visibleColumns],
  );

  return { visibleColumns, toggleColumn, resetColumns, isColumnVisible };
}
