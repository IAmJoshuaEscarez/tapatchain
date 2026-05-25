import { useMemo } from "react";
import type { RDCProject } from "@/context/ProjectContext";

export const HIGH_RISK_GAP_THRESHOLD_PCT = 20;

const VERIFIED_MILESTONE_STATUSES = new Set<string>([
  "ENGINEER_VERIFIED",
  "INSPECTOR_APPROVED",
  "COA_AUDITED",
  "MILESTONE_PAID",
  "PUBLISHED",
  // Legacy aliases from persisted rows
  "ENGINEER_ATTESTED",
  "COA_APPROVED",
]);

const DISBURSED_MILESTONE_STATUSES = new Set<string>([
  "MILESTONE_PAID",
  "PUBLISHED",
]);

export interface IntegrityMilestoneSnapshot {
  id?: string | null;
  projectId?: string | null;
  status?: string | null;
  requestedAmount?: number | string | null;
  blockchainHash?: string | null;
  rdPaymentTxHash?: string | null;
  publishedToLedger?: boolean | null;
}

export interface IntegrityProjectMetric {
  projectId: string;
  projectTitle: string;
  region: string;
  allocatedBudget: number;
  disbursedAmount: number;
  totalMilestones: number;
  verifiedMilestones: number;
  financialProgressPct: number;
  physicalProgressPct: number;
  gapPct: number;
  isHighRisk: boolean;
  anomalyFlag: "HIGH RISK: Over-disbursement" | null;
}

export interface IntegrityRegionMetric {
  region: string;
  projectCount: number;
  allocatedBudget: number;
  disbursedAmount: number;
  totalMilestones: number;
  verifiedMilestones: number;
  financialProgressPct: number;
  physicalProgressPct: number;
  gapPct: number;
  isHighRisk: boolean;
  highRiskProjects: number;
  anomalyFlag: "HIGH RISK: Over-disbursement" | null;
}

interface UseFinancialPhysicalIntegrityParams {
  projects: RDCProject[];
  milestones: IntegrityMilestoneSnapshot[];
}

interface UseFinancialPhysicalIntegrityResult {
  projectMetrics: IntegrityProjectMetric[];
  projectMetricById: Record<string, IntegrityProjectMetric>;
  regionMetrics: IntegrityRegionMetric[];
  regionMetricByRegion: Record<string, IntegrityRegionMetric>;
  highRiskProjectCount: number;
  highRiskRegionCount: number;
}

function parseCurrency(value?: string | null): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const parsed = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseAmount(value?: number | string | null): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeStatus(status?: string | null): string {
  return String(status ?? "").trim().toUpperCase();
}

function toPercent(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const percent = (numerator / denominator) * 100;
  return Math.max(0, Math.min(100, percent));
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function getProjectPhysicalProgressPct(project: RDCProject): number {
  const currentProgress = Number(project.currentProgress ?? 0);
  if (!Number.isFinite(currentProgress)) return 0;
  return clampPercent(currentProgress);
}

function resolveRegion(project: RDCProject): string {
  const dpwhRegion = String(project.dpwhRegion ?? "").trim();
  if (dpwhRegion) return dpwhRegion;

  const region = String(project.region ?? "").trim();
  if (region) return region;

  return "UNASSIGNED";
}

function isVerifiedMilestone(status: string): boolean {
  return VERIFIED_MILESTONE_STATUSES.has(status);
}

function isDisbursedMilestone(milestone: IntegrityMilestoneSnapshot): boolean {
  const status = normalizeStatus(milestone.status);
  if (!DISBURSED_MILESTONE_STATUSES.has(status)) return false;

  // Use explicit on-chain traces when available, while allowing status-based registry fallback.
  const hasChainProof = Boolean(
    String(milestone.rdPaymentTxHash ?? "").trim() ||
      String(milestone.blockchainHash ?? "").trim() ||
      milestone.publishedToLedger
  );

  return hasChainProof || status === "MILESTONE_PAID" || status === "PUBLISHED";
}

export function buildIntegrityRestrictionMessage(metric: {
  physicalProgressPct: number;
  financialProgressPct: number;
}): string {
  return `Action Restricted: Physical progress is too low (${metric.physicalProgressPct.toFixed(0)}%) compared to disbursed funds (${metric.financialProgressPct.toFixed(0)}%). Justification required.`;
}

export function useFinancialPhysicalIntegrity({
  projects,
  milestones,
}: UseFinancialPhysicalIntegrityParams): UseFinancialPhysicalIntegrityResult {
  return useMemo(() => {
    const milestonesByProjectId: Record<string, IntegrityMilestoneSnapshot[]> = {};
    for (const milestone of milestones) {
      const projectId = String(milestone.projectId ?? "").trim();
      if (!projectId) continue;
      if (!milestonesByProjectId[projectId]) milestonesByProjectId[projectId] = [];
      milestonesByProjectId[projectId].push(milestone);
    }

    const projectMetrics: IntegrityProjectMetric[] = projects.map((project) => {
      const projectId = String(project.id ?? "").trim();
      const projectMilestones = milestonesByProjectId[projectId] ?? [];
      const allocatedBudget = parseCurrency(project.finalApprovedBudget || project.approvedBudget);

      let verifiedMilestones = 0;
      let disbursedAmount = 0;

      for (const milestone of projectMilestones) {
        const status = normalizeStatus(milestone.status);
        if (isVerifiedMilestone(status)) verifiedMilestones += 1;

        if (isDisbursedMilestone(milestone)) {
          const amount = parseAmount(milestone.requestedAmount);
          if (amount > 0) disbursedAmount += amount;
        }
      }

      const totalMilestones = projectMilestones.length;
      const financialProgressPct = toPercent(disbursedAmount, allocatedBudget);
      const physicalProgressPct = getProjectPhysicalProgressPct(project);
      const gapPct = financialProgressPct - physicalProgressPct;
      const isHighRisk = gapPct > HIGH_RISK_GAP_THRESHOLD_PCT;

      return {
        projectId,
        projectTitle: project.title,
        region: resolveRegion(project),
        allocatedBudget,
        disbursedAmount,
        totalMilestones,
        verifiedMilestones,
        financialProgressPct,
        physicalProgressPct,
        gapPct,
        isHighRisk,
        anomalyFlag: isHighRisk ? "HIGH RISK: Over-disbursement" : null,
      };
    });

    const projectMetricById = projectMetrics.reduce<Record<string, IntegrityProjectMetric>>(
      (acc, metric) => {
        acc[metric.projectId] = metric;
        return acc;
      },
      {}
    );

    const regionAccumulator: Record<
      string,
      {
        projectCount: number;
        allocatedBudget: number;
        disbursedAmount: number;
        totalMilestones: number;
        verifiedMilestones: number;
        physicalProgressSum: number;
        highRiskProjects: number;
      }
    > = {};

    for (const metric of projectMetrics) {
      const region = metric.region;
      if (!regionAccumulator[region]) {
        regionAccumulator[region] = {
          projectCount: 0,
          allocatedBudget: 0,
          disbursedAmount: 0,
          totalMilestones: 0,
          verifiedMilestones: 0,
          physicalProgressSum: 0,
          highRiskProjects: 0,
        };
      }

      const acc = regionAccumulator[region];
      acc.projectCount += 1;
      acc.allocatedBudget += metric.allocatedBudget;
      acc.disbursedAmount += metric.disbursedAmount;
      acc.totalMilestones += metric.totalMilestones;
      acc.verifiedMilestones += metric.verifiedMilestones;
      acc.physicalProgressSum += metric.physicalProgressPct;
      if (metric.isHighRisk) acc.highRiskProjects += 1;
    }

    const regionMetrics = Object.entries(regionAccumulator)
      .map(([region, acc]): IntegrityRegionMetric => {
        const financialProgressPct = toPercent(acc.disbursedAmount, acc.allocatedBudget);
        const physicalProgressPct =
          acc.projectCount > 0 ? clampPercent(acc.physicalProgressSum / acc.projectCount) : 0;
        const gapPct = financialProgressPct - physicalProgressPct;
        const isHighRisk = gapPct > HIGH_RISK_GAP_THRESHOLD_PCT;

        return {
          region,
          projectCount: acc.projectCount,
          allocatedBudget: acc.allocatedBudget,
          disbursedAmount: acc.disbursedAmount,
          totalMilestones: acc.totalMilestones,
          verifiedMilestones: acc.verifiedMilestones,
          financialProgressPct,
          physicalProgressPct,
          gapPct,
          isHighRisk,
          highRiskProjects: acc.highRiskProjects,
          anomalyFlag: isHighRisk ? "HIGH RISK: Over-disbursement" : null,
        };
      })
      .sort((left, right) => right.allocatedBudget - left.allocatedBudget || left.region.localeCompare(right.region));

    const regionMetricByRegion = regionMetrics.reduce<Record<string, IntegrityRegionMetric>>(
      (acc, metric) => {
        acc[metric.region] = metric;
        return acc;
      },
      {}
    );

    return {
      projectMetrics,
      projectMetricById,
      regionMetrics,
      regionMetricByRegion,
      highRiskProjectCount: projectMetrics.filter((metric) => metric.isHighRisk).length,
      highRiskRegionCount: regionMetrics.filter((metric) => metric.isHighRisk).length,
    };
  }, [projects, milestones]);
}
