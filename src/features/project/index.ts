// Project Feature — Public API
export { projectApi } from "./api/projectApi";
export type { CreateProjectPayload, UpdateProjectStatusPayload } from "./api/projectApi";

export {
  ProjectProvider,
  useProjectContext,
  REQUIRED_PROPOSAL_DOCUMENTS,
} from "./context/ProjectContext";
export type {
  RDCProject,
  ProposalDocument,
} from "./context/ProjectContext";

export {
  useFinancialPhysicalIntegrity,
  buildIntegrityRestrictionMessage,
  HIGH_RISK_GAP_THRESHOLD_PCT,
} from "./hooks/useFinancialPhysicalIntegrity";
export type {
  IntegrityMilestoneSnapshot,
  IntegrityProjectMetric,
  IntegrityRegionMetric,
} from "./hooks/useFinancialPhysicalIntegrity";
