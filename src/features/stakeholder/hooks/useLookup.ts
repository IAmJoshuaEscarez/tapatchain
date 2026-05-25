import { useState, useEffect, useCallback } from "react";
import {
  stakeholderApi,
  type StakeholderResponse,
} from "@/features/stakeholder/api/stakeholderApi";

// ============================================
// useLookup — fetch dropdown / lookup data
// from the Stakeholder table by Type
// ============================================

export interface LookupItem {
  id: string;
  name: string;
  description?: string;
  code?: number;          // parsed from Description for Region type
}

/** Canonical type keys matching the seeded Type values in the database */
export type LookupType =
  | "Region"
  | "ProjectPhase"
  | "PriorityLevel"
  | "ProjectCategory"
  | "ExpenseCategory"
  | "ReportType"
  | "ActionType"
  | "SystemRole"
  | "FundSource"
  | "InfrastructureType"
  | "ProjectType"
  | "Contractor"
  | "Inspector";

// Simple in-memory cache so the same type is not fetched twice per session
const lookupCache = new Map<string, LookupItem[]>();

function mapToLookup(items: StakeholderResponse[]): LookupItem[] {
  return items.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? undefined,
    code: s.description ? parseInt(s.description, 10) || undefined : undefined,
  }));
}

/**
 * Fetch a single lookup type.
 * Returns `{ items, loading, error, reload }`.
 */
export function useLookup(type: LookupType) {
  const [items, setItems] = useState<LookupItem[]>(() => lookupCache.get(type) ?? []);
  const [loading, setLoading] = useState(!lookupCache.has(type));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (lookupCache.has(type)) {
      setItems(lookupCache.get(type)!);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await stakeholderApi.getByType(type);
      const mapped = mapToLookup(res.data ?? []);
      lookupCache.set(type, mapped);
      setItems(mapped);
      setError(null);
    } catch (err) {
      console.error(`Failed to load lookup [${type}]:`, err);
      setError(`Failed to load ${type}`);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { load(); }, [load]);

  const reload = useCallback(() => {
    lookupCache.delete(type);
    return load();
  }, [type, load]);

  return { items, loading, error, reload };
}

/**
 * Fetch multiple lookup types in one call.
 * Returns an object keyed by LookupType.
 */
export function useLookups<T extends LookupType>(types: T[]) {
  const [data, setData] = useState<Record<T, LookupItem[]>>(() => {
    const init = {} as Record<T, LookupItem[]>;
    types.forEach((t) => { init[t] = lookupCache.get(t) ?? []; });
    return init;
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        types.map(async (type) => {
          if (lookupCache.has(type)) return { type, items: lookupCache.get(type)! };
          const res = await stakeholderApi.getByType(type).catch(() => ({ data: [] as StakeholderResponse[] }));
          const mapped = mapToLookup(res.data ?? []);
          lookupCache.set(type, mapped);
          return { type, items: mapped };
        })
      );
      const obj = {} as Record<T, LookupItem[]>;
      results.forEach(({ type, items }) => { obj[type as T] = items; });
      setData(obj);
    } catch (err) {
      console.error("Failed to load lookups:", err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types.join(",")]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}

/** Clear the entire lookup cache (useful after admin CRUD operations) */
export function clearLookupCache() {
  lookupCache.clear();
}
