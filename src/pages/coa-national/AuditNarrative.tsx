import type {
  ChainOfCustodyStep,
  NationalLedgerProject,
  NationalRiskProfile,
} from "./types";

interface AuditNarrativeParams {
  record: NationalLedgerProject;
  chainOfCustody: ChainOfCustodyStep[];
  riskProfile?: NationalRiskProfile;
}

function formatTimestamp(value?: string): string {
  if (!value) return "date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "date unavailable";
  return parsed.toLocaleString();
}

function toCompletionPercent(record: NationalLedgerProject): number {
  const direct = Number(record.project.progress ?? 0);
  const current = Number(record.project.currentProgress ?? 0);
  const completion = Math.max(direct, current);
  if (!Number.isFinite(completion)) return 0;
  return Math.max(0, Math.min(100, completion));
}

export function generateAuditNarrative({
  record,
  chainOfCustody,
  riskProfile,
}: AuditNarrativeParams): string {
  const regionalApprovalStep = chainOfCustody.find((step) => step.key === "REGIONAL_AUDIT_APPROVAL");
  const finalSealStep = chainOfCustody.find((step) => step.key === "NATIONAL_FINAL_SEAL");

  const completion = toCompletionPercent(record);
  const warningCount = riskProfile?.warningCount ?? record.forensicWarningCount;
  const resubmissions = riskProfile?.resubmissionCount ?? 0;

  const gpsSummary = (() => {
    if (riskProfile?.gpsVarianceMeters === null || riskProfile?.gpsVarianceMeters === undefined) {
      return "GPS variance is currently unavailable from available submissions";
    }

    const estimatedGpsAccuracy = Math.max(0, Math.min(100, 100 - riskProfile.gpsVarianceMeters / 2));
    return `GPS variance was measured at ${riskProfile.gpsVarianceMeters.toFixed(2)}m (estimated ${estimatedGpsAccuracy.toFixed(1)}% alignment)`;
  })();

  const forensicSummary = warningCount === 0
    ? "all forensic checks currently show no active warning flags"
    : `${warningCount} forensic warning flag(s) require continued oversight`;

  const regionalSummary = regionalApprovalStep?.completed
    ? `Regional audit approval was recorded by ${regionalApprovalStep.actorName || "the assigned auditor"} on ${formatTimestamp(regionalApprovalStep.timestamp)}`
    : "Regional audit approval is still pending in the custody chain";

  const nationalSummary = finalSealStep?.completed
    ? `National final seal was recorded on ${formatTimestamp(finalSealStep.timestamp)}`
    : record.blockchainStatus === "COA_REGIONAL_APPROVED" && completion >= 100 && warningCount === 0
      ? "the project is eligible for National Final Seal and ready for archiving"
      : "the project is not yet eligible for National Final Seal";

  const resubmissionSummary = resubmissions > 0
    ? `Contractor re-submission count is ${resubmissions}`
    : "no contractor re-submission pattern was detected";

  return [
    `Project ${record.projectId} in ${record.region}${record.municipality ? ` (${record.municipality})` : ""} is currently at status ${record.blockchainStatus}.`,
    `${gpsSummary}, and ${forensicSummary}.`,
    `${regionalSummary}.`,
    `${resubmissionSummary}, with completion at ${completion.toFixed(0)}%.`,
    `${nationalSummary}.`,
  ].join(" ");
}
