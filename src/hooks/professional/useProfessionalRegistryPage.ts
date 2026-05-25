import { useState, useEffect, useCallback, useMemo } from "react";
import { stakeholderApi, type StakeholderResponse } from "@/features/stakeholder/api/stakeholderApi";
import { authApi } from "@/services/api";
import { useLookup } from "@/hooks";

export function useProfessionalRegistryPage() {
  const [allProfessionals, setAllProfessionals] = useState<StakeholderResponse[]>([]);
  const [regSearch, setRegSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [rdRegionName, setRdRegionName] = useState<string | null>(null);

  const { items: regionLookup } = useLookup("Region");
  const regionMap = useMemo(
    () => Object.fromEntries(regionLookup.map((r) => [r.code ?? 0, r.name])),
    [regionLookup]
  );

  useEffect(() => {
    authApi
      .getProfile()
      .then((res) => {
        const p = res.data;
        const name = regionMap[p.regionCode] ?? p.assignedRegion ?? null;
        setRdRegionName(name);
      })
      .catch(() => {});
  }, [regionMap]);

  const loadRegisteredProfessionals = useCallback(async () => {
    try {
      setIsLoading(true);
      const contractors = await stakeholderApi.getByType("Contractor");
      const engineers = await stakeholderApi.getByType("SiteEngineer");
      const all = [...contractors.data, ...engineers.data].filter((s) => s.isActive);
      setAllProfessionals(all);
    } catch {
      // Registry may be empty or unavailable.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRegisteredProfessionals();
  }, [loadRegisteredProfessionals]);

  const registeredProfessionals = useMemo(() => {
    if (!rdRegionName) return allProfessionals;
    return allProfessionals.filter((s) => !s.region || s.region === rdRegionName);
  }, [allProfessionals, rdRegionName]);

  const filteredProfessionals = useMemo(() => {
    const searchLower = regSearch.toLowerCase();
    return registeredProfessionals.filter((s) => {
      return (
        s.name.toLowerCase().includes(searchLower) ||
        s.licenseNo?.toLowerCase().includes(searchLower) ||
        (s.walletAddress?.toLowerCase() ?? "").includes(searchLower)
      );
    });
  }, [registeredProfessionals, regSearch]);

  return {
    regSearch,
    setRegSearch,
    isLoading,
    registeredProfessionals,
    filteredProfessionals,
  };
}
