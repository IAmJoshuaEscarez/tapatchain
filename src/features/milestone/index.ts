// Milestone Feature — Public API
export { milestoneApi } from "./api/milestoneApi";
export type { CreateMilestonePayload, UpdateMilestoneStatusPayload } from "./api/milestoneApi";

export { MilestoneProvider, useMilestoneContext } from "./context/MilestoneContext";
export type { Milestone, MilestonePhoto, MilestoneExpense } from "./context/MilestoneContext";
