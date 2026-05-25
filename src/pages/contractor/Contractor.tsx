import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CollapsibleSection, SummaryBar, StatItem } from "@/components/ui/collapsible-section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaginationControls } from "@/components/ui";
import {
  ArrowLeft,
  Wallet,
  Building2,
  MapPin,
  Eye,
  Upload,
  Camera,
  CheckCircle,
  AlertCircle,
  Send,
  FolderOpen,
  Plus,
  Save,
  Trash2,
  X,
  Search,
  HardHat,
  Shield,
  ExternalLink,
  Loader2,
  Target,
  FileText,
  Crosshair,
  Lock,
} from "lucide-react";
import { formatCurrency, formatCurrencyPHP, getStatusColor } from "@/lib/utils";
import { InsufficientGasModal } from "@/components/ui";
import { GeoCamera } from "@/components/ui";
import { useContractorDashboard } from "@/hooks";
import { blueprintApi } from "@/features/milestone/api/milestoneApi";

interface ContractorDashboardProps {
  setCurrentPage: (page: string) => void;
}

const CONTRACTOR_PROJECT_PAGE_SIZE = 8;

export function ContractorDashboard({ setCurrentPage }: ContractorDashboardProps) {
  const {
    disconnectWallet,
    selectedProject,
    setSelectedProject,
    milestoneProgress,
    setMilestoneProgress,
    milestoneName,
    setMilestoneName,
    profile,
    isDragging,
    uploadedPhotos,
    materialSpecs,
    setMaterialSpecs,
    submissionStatus,
    signingStep,
    searchQuery,
    setSearchQuery,
    selectedMunicipality,
    setSelectedMunicipality,
    selectedBarangay,
    setSelectedBarangay,
    targetPercent,
    setTargetPercent,
    targetLocked,
    showGeoCamera,
    setShowGeoCamera,
    siteAnchor,
    geofenceWarnings,
    blueprintFile,
    setBlueprintFile,
    blueprintLabel,
    setBlueprintLabel,
    isUploadingBlueprint,
    setIsUploadingBlueprint,
    blueprintUploaded,
    setBlueprintUploaded,
    existingBlueprints,
    setExistingBlueprints,
    isCheckingBlueprint,
    billingReady,
    assignedRegion,
    isConnected,
    walletAddress,
    projectsLoading,
    gasError,
    clearGasError,
    expenseCategories,
    allProjects,
    totalPersonnelAssigned,
    expenses,
    newExpense,
    setNewExpense,
    showAddExpense,
    setShowAddExpense,
    isSigning,
    lastSignResult,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInput,
    handleDeletePhoto,
    handleGeoCapture,
    submitMilestone,
    municipalities,
    barangays,
    filteredProjects,
    handleAddExpense,
    handleDeleteExpense,
    totalExpenses,
    walletMismatch,
    hasValidGps,
    GEOFENCE_RADIUS_M,
  } = useContractorDashboard();

  const [projectPage, setProjectPage] = useState(1);
  const projectTotalPages = Math.max(1, Math.ceil(filteredProjects.length / CONTRACTOR_PROJECT_PAGE_SIZE));

  useEffect(() => {
    setProjectPage(1);
  }, [searchQuery, selectedMunicipality, selectedBarangay, filteredProjects.length]);

  const pagedProjects = useMemo(() => {
    const safePage = Math.min(projectPage, projectTotalPages);
    const start = (safePage - 1) * CONTRACTOR_PROJECT_PAGE_SIZE;
    return filteredProjects.slice(start, start + CONTRACTOR_PROJECT_PAGE_SIZE);
  }, [filteredProjects, projectPage, projectTotalPages]);

  if (walletMismatch) {
    return (
      <div className="pt-20 min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md mx-auto text-center p-8 bg-card border border-destructive/30 rounded-xl space-y-4">
          <Shield className="w-16 h-16 text-destructive mx-auto" />
          <h2 className="text-xl font-bold text-foreground">Wallet Mismatch Detected</h2>
          <p className="text-muted-foreground text-sm">
            The connected MetaMask wallet does not match the authorized wallet for your Contractor account.
          </p>
          <p className="text-xs text-muted-foreground">
            Connected: <code className="text-destructive">{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</code><br />
            Authorized: <code className="text-primary">{profile?.walletAddress?.slice(0, 6)}...{profile?.walletAddress?.slice(-4)}</code>
          </p>
          <Button
            onClick={async () => { await disconnectWallet(); setCurrentPage("home"); }}
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10"
          >
            Disconnect & Return
          </Button>
        </div>
      </div>
    );
  }

  // Safety check - only check if there are no projects assigned to this contractor
  if (!projectsLoading && allProjects.length === 0) {
    return (
      <div className="pt-20 min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 py-5">
          <Card className="p-5 text-center">
            <HardHat className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-base font-bold text-foreground mb-2">No Assigned Projects</h2>
            <p className="text-muted-foreground text-sm">
              No projects are currently assigned to your wallet.
              Projects will appear here after the Regional Director assigns you as contractor.
            </p>
            {walletAddress && (
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                Your wallet: {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
              </p>
            )}
            {totalPersonnelAssigned > 0 && (
              <p className="text-xs text-amber-500 mt-2">
                {totalPersonnelAssigned} project(s) have personnel assigned but none match your wallet.
                Ask the Regional Director to re-assign using your exact wallet address above.
              </p>
            )}
            {assignedRegion && assignedRegion !== "All Regions" && (
              <p className="text-xs text-muted-foreground mt-1">
                Assigned Region: {assignedRegion}
              </p>
            )}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-20 min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">Contractor | Blueprint & Progress Upload</h1>
              <p className="text-muted-foreground text-xs mt-0.5">
                Manage your projects and submit progress updates
              </p>
              <span className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                Contractor | {assignedRegion}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                submissionStatus === 'Draft' 
                  ? 'text-foreground ' + getStatusColor(submissionStatus)
                  : 'text-white ' + getStatusColor(submissionStatus)
              }`}>
                Status: {submissionStatus}
              </div>
              <Button
                onClick={async () => { await disconnectWallet(); setCurrentPage('home'); }}
                variant="outline"
                size="sm"
                className="border-border text-muted-foreground hover:bg-muted text-xs h-8"
              >
                <Wallet className="w-3.5 h-3.5 mr-1.5" />
                Disconnect
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
        {/* Search and Filters */}
        <CollapsibleSection
          title="Search & Filters"
          icon={<Search />}
          badge={
            (searchQuery || selectedMunicipality !== "All" || selectedBarangay !== "All") ? (
              <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">Active</span>
            ) : undefined
          }
          className="mb-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
            {/* Search Bar */}
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input
                type="text"
                placeholder="Search projects by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground rounded-lg focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            {/* Region (locked) */}
            <div className="relative md:col-span-1">
              <div className="w-full px-3 py-2 border border-border bg-muted text-foreground text-sm rounded-lg flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="truncate">{assignedRegion}</span>
              </div>
            </div>

            {/* Municipality Filter */}
            <div className="relative md:col-span-1.5">
              <select
                value={selectedMunicipality}
                onChange={(e) => {
                  setSelectedMunicipality(e.target.value);
                  setSelectedBarangay("All");
                }}
                className="w-full px-3 py-2 border border-border bg-background text-foreground text-sm rounded-lg focus:outline-none focus:border-primary appearance-none cursor-pointer transition-colors"
              >
                {municipalities.map(municipality => (
                  <option key={municipality} value={municipality} className="bg-background text-foreground">
                    {municipality === "All" ? "All Municipalities" : municipality}
                  </option>
                ))}
              </select>
              <Building2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none" />
            </div>

            {/* Barangay Filter */}
            <div className="relative md:col-span-1.5">
              <select
                value={selectedBarangay}
                onChange={(e) => setSelectedBarangay(e.target.value)}
                className="w-full px-3 py-2 border border-border bg-background text-foreground text-sm rounded-lg focus:outline-none focus:border-primary appearance-none cursor-pointer transition-colors"
              >
                {barangays.map(brgy => (
                  <option key={brgy} value={brgy} className="bg-background text-foreground">
                    {brgy === "All" ? "All Barangays" : `Brgy. ${brgy}`}
                  </option>
                ))}
              </select>
              <MapPin className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none" />
            </div>
          </div>

          {/* Active Filters Display */}
          {(searchQuery || selectedMunicipality !== "All" || selectedBarangay !== "All") && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Active filters:</span>
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-muted text-foreground rounded-full text-sm">
                  Search: "{searchQuery}"
                  <X 
                    className="w-3 h-3 cursor-pointer hover:text-muted-foreground" 
                    onClick={() => setSearchQuery("")}
                  />
                </span>
              )}
              {selectedMunicipality !== "All" && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-muted text-foreground rounded-full text-sm">
                  Municipality: {selectedMunicipality}
                  <X 
                    className="w-3 h-3 cursor-pointer hover:text-muted-foreground" 
                    onClick={() => setSelectedMunicipality("All")}
                  />
                </span>
              )}
              {selectedBarangay !== "All" && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-muted text-foreground rounded-full text-sm">
                  Barangay: {selectedBarangay}
                  <X 
                    className="w-3 h-3 cursor-pointer hover:text-muted-foreground" 
                    onClick={() => setSelectedBarangay("All")}
                  />
                </span>
              )}
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSelectedMunicipality("All");
                  setSelectedBarangay("All");
                }}
                className="text-sm text-muted-foreground hover:text-foreground underline"
              >
                Clear all
              </button>
            </div>
          )}
        </CollapsibleSection>

        {/* Projects List - Table View */}
        {!selectedProject ? (
          <>
            {filteredProjects.length > 0 ? (
              <>
                <div className="rounded-lg border border-border bg-card overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project Name</TableHead>
                        <TableHead>Project ID</TableHead>
                        <TableHead>Municipality</TableHead>
                        <TableHead>Barangay</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Budget</TableHead>
                        <TableHead>Spent</TableHead>
                        <TableHead className="text-center">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedProjects.map((project) => (
                        <TableRow key={project.id}>
                          <TableCell className="font-medium">{project.name}</TableCell>
                          <TableCell>
                            <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-semibold">
                              {project.id}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm">
                              <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                              {project.municipality}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">Brgy. {project.barangay}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-muted rounded-full h-2">
                                <div 
                                  className={`rounded-full h-2 ${
                                    project.progress >= (project.targetPercent ?? 100) ? "bg-accent" : "bg-primary"
                                  }`}
                                  style={{ width: `${project.progress}%` }} 
                                />
                              </div>
                              <span className="text-sm font-medium">{project.progress}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-semibold text-muted-foreground">
                              {project.targetPercent ?? 100}%
                            </span>
                          </TableCell>
                          <TableCell className="text-sm font-medium">{formatCurrency(project.budget)}</TableCell>
                          <TableCell className="text-sm font-medium text-primary">{formatCurrency(project.spent)}</TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedProject(project)}
                              className="hover:bg-primary hover:text-primary-foreground"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <PaginationControls
                  page={Math.min(projectPage, projectTotalPages)}
                  totalPages={projectTotalPages}
                  onPageChange={setProjectPage}
                />
              </>
            ) : (
              <div className="text-center py-16 bg-card rounded-lg border border-border">
                <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm font-medium text-foreground">No projects found</p>
                <p className="text-xs text-muted-foreground mb-4">Try adjusting your search or filter criteria</p>
                {(searchQuery || selectedMunicipality !== "All" || selectedBarangay !== "All") && (
                  <Button
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedMunicipality("All");
                      setSelectedBarangay("All");
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            )}

            {/* Workflow Pipeline Indicator */}
            <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground py-2 flex-wrap">
              <span>Step 1: RDC Proposed</span>
              <span>&rarr;</span>
              <span>Step 2: National Funded</span>
              <span>&rarr;</span>
              <span>Step 3: RD Assigned Personnel</span>
              <span>&rarr;</span>
              <span className="font-bold text-primary">Step 4: Contractor Submits Progress &larr; You are here</span>
              <span>&rarr;</span>
              <span>Step 5: Site Engineer Review</span>
              <span>&rarr;</span>
              <span>Step 6: COA Regional Audit</span>
            </div>
          </>
        ) : (
          /* Project Detail Page */
          <div className="space-y-4 sm:space-y-6">
            {/* Back Button */}
            <Button
              onClick={() => setSelectedProject(null)}
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Projects
            </Button>

            {/* Project Header Card */}
            <Card className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-bold text-foreground mb-2">{selectedProject.name}</h2>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-semibold">
                      {selectedProject.id}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs">
                      <MapPin className="w-3 h-3" />
                      {selectedProject.dpwhRegion}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs">
                      <Building2 className="w-3 h-3" />
                      {selectedProject.municipality}
                    </span>
                    <span className="text-xs">Brgy. {selectedProject.barangay}</span>
                  </div>
                </div>
              </div>
              
              {/* Progress Bar — Target vs Current */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Target className="w-3 h-3" /> Target: {targetPercent}%
                  </span>
                  <span className="text-sm font-bold text-primary">{milestoneProgress}%</span>
                </div>
                <div className="relative w-full bg-muted rounded-full h-3">
                  {/* Target marker */}
                  <div
                    className="absolute top-0 h-3 border-r-2 border-dashed border-foreground/50 z-10"
                    style={{ left: `${targetPercent}%` }}
                    title={`Target: ${targetPercent}%`}
                  />
                  {/* Current progress */}
                  <div
                    className={`rounded-full h-3 transition-all ${
                      milestoneProgress >= targetPercent ? "bg-accent" : "bg-primary"
                    }`}
                    style={{ width: `${milestoneProgress}%` }}
                  />
                </div>
                {milestoneProgress >= targetPercent && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-primary font-semibold">
                    <CheckCircle className="w-3 h-3" /> Target reached — billing ready
                  </div>
                )}
              </div>

              {/* Project Stats - Compact SummaryBar */}
              <SummaryBar>
                <StatItem label="Budget" value={formatCurrency(selectedProject.budget)} icon={<Wallet />} />
                <StatItem label="Spent" value={formatCurrency(selectedProject.spent)} className="text-primary" />
                <StatItem label="Remaining" value={formatCurrency(selectedProject.budget - selectedProject.spent)} />
              </SummaryBar>
            </Card>

            {/* Milestone Submission Section */}
            <div className="space-y-4 sm:space-y-6">
                <div className="border-t border-border bg-card rounded-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
                  
                  {/* Instructions Banner */}
                  <CollapsibleSection
                    title="How to Submit"
                    icon={<AlertCircle />}
                    subtitle="Step-by-step guide"
                  >
                    <ol className="space-y-1.5 text-xs text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-foreground">1.</span>
                        <span>Set your milestone progress percentage using the slider</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-foreground">2.</span>
                        <span>Upload 4-5 photos showing your work</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-foreground">3.</span>
                        <span>Add all your expenses with prices</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-bold text-foreground">4.</span>
                        <span>Click Submit button at the bottom</span>
                      </li>
                    </ol>
                  </CollapsibleSection>

                  {/* Milestone Progress Slider + Target Definition */}
                  <div className="bg-card border border-border rounded-lg p-6">
                    <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" />
                      Step 1: Define Target & Update Progress
                      {targetLocked && (
                        <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold">
                          <Lock className="w-3 h-3" /> Baseline Locked
                        </span>
                      )}
                    </h3>
                    
                    {/* Milestone Name Input */}
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-muted-foreground mb-2">Milestone Name</label>
                      <input
                        type="text"
                        value={milestoneName}
                        onChange={(e) => setMilestoneName(e.target.value)}
                        disabled={targetLocked}
                        placeholder="e.g., Foundation Work, Column Construction"
                        className={`w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary ${targetLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                      />
                    </div>

                    {/* Target Percent Input */}
                    <div className="mb-4">
                      <label className="block text-xs font-medium text-muted-foreground mb-2">
                        Target Success Rate (%)
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          min="10"
                          max="100"
                          value={targetPercent}
                          onChange={(e) => setTargetPercent(Math.min(100, Math.max(10, Number(e.target.value))))}
                          disabled={targetLocked}
                          className={`w-24 px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary ${targetLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          Submit is disabled until progress reaches this target
                        </span>
                      </div>
                    </div>
                    
                    <div className="bg-primary/5 p-5 rounded-lg border border-primary/20">
                      <div className="text-center mb-4">
                        <div className={`text-3xl font-bold mb-2 ${
                          milestoneProgress >= targetPercent ? "text-accent" : "text-primary"
                        }`}>
                          {milestoneProgress}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {milestoneName} — Target: {targetPercent}%
                        </div>
                        {milestoneProgress >= targetPercent && (
                          <div className="mt-1 text-xs text-primary font-semibold flex items-center justify-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Target reached!
                          </div>
                        )}
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={milestoneProgress}
                        onChange={(e) => setMilestoneProgress(Number(e.target.value))}
                        className="w-full h-2.5 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-grab"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-4">
                        <span>0%</span>
                        <span className="text-primary font-semibold">{targetPercent}% target</span>
                        <span>100%</span>
                      </div>
                    </div>
                  </div>

                  {/* GPS-Tagged Photos — Live Camera + Upload */}
                  <CollapsibleSection
                    title="Step 2: GPS-Verified Photos"
                    icon={<Camera />}
                    badge={
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        uploadedPhotos.length < 4 ? 'bg-muted text-muted-foreground border border-border' : 'bg-primary/10 text-primary border border-primary/20'
                      }`}>
                        {uploadedPhotos.length}/5
                      </span>
                    }
                  >
                    {/* Geofence Status */}
                    {siteAnchor ? (
                      <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20 text-xs">
                        <Crosshair className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-foreground">
                          Site anchored at <strong>{siteAnchor.lat.toFixed(5)}, {siteAnchor.lng.toFixed(5)}</strong> — all photos must be within {GEOFENCE_RADIUS_M}m
                        </span>
                      </div>
                    ) : (
                      <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20 text-xs">
                        <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-foreground">
                          First photo will anchor the project site location for the {GEOFENCE_RADIUS_M}m geofence
                        </span>
                      </div>
                    )}

                    {/* Geofence warnings */}
                    {geofenceWarnings.length > 0 && (
                      <div className="mb-3 space-y-1">
                        {geofenceWarnings.map((warn, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            {warn}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* GPS Camera Button */}
                    <div className="mb-3">
                      <Button
                        onClick={() => setShowGeoCamera(true)}
                        className="w-full bg-primary hover:bg-primary/90 text-white gap-2"
                        size="sm"
                        disabled={uploadedPhotos.length >= 5}
                      >
                        <Camera className="w-4 h-4" />
                        Open GPS Camera ({uploadedPhotos.length}/5)
                      </Button>
                      <p className="text-xs text-muted-foreground text-center mt-1">
                        Captures live GPS coordinates burned into each photo
                      </p>
                    </div>

                    {/* Traditional file input fallback */}
                    <input
                      type="file"
                      id={`photo-upload-${selectedProject.id}`}
                      multiple
                      accept="image/*"
                      onChange={handleFileInput}
                      className="hidden"
                      disabled={uploadedPhotos.length >= 5}
                    />
                    
                    {/* Drag & Drop or Click to Browse */}
                    <label
                      htmlFor={`photo-upload-${selectedProject.id}`}
                      className={`block border-2 border-dashed rounded-lg p-5 text-center transition-all ${
                        uploadedPhotos.length >= 5 
                          ? 'border-primary bg-primary/10 cursor-not-allowed' 
                          : isDragging 
                            ? 'border-primary bg-primary/10 cursor-pointer' 
                            : 'border-border bg-background hover:border-primary cursor-pointer'
                      }`}
                      onDragOver={uploadedPhotos.length < 5 ? handleDragOver : undefined}
                      onDragLeave={uploadedPhotos.length < 5 ? handleDragLeave : undefined}
                      onDrop={uploadedPhotos.length < 5 ? handleDrop : undefined}
                    >
                      <Upload className={`w-8 h-8 mx-auto mb-2 pointer-events-none ${
                        uploadedPhotos.length >= 5 ? 'text-primary' : 'text-muted-foreground'
                      }`} />
                      {uploadedPhotos.length >= 5 ? (
                        <>
                          <p className="text-sm text-primary font-semibold mb-0.5">Maximum photos reached</p>
                          <p className="text-xs text-muted-foreground">Delete photos to upload more</p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-foreground font-semibold mb-0.5 pointer-events-none">
                            Click to select photos or drag and drop
                          </p>
                          <p className="text-xs text-muted-foreground pointer-events-none">
                            GPS metadata will be extracted automatically
                          </p>
                          <div className={`text-xs mt-4 p-1.5 rounded pointer-events-none ${
                            uploadedPhotos.length < 4 ? 'bg-muted text-muted-foreground font-semibold border border-border' : 'bg-primary/10 text-primary'
                          }`}>
                            {uploadedPhotos.length < 4 
                              ? `Need ${4 - uploadedPhotos.length} more photo(s) - minimum 4 required` 
                              : `Can add ${5 - uploadedPhotos.length} more photo(s)`
                            }
                          </div>
                        </>
                      )}
                    </label>
                    
                    {/* Photo Grid Preview */}
                    {uploadedPhotos.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-foreground mb-3">
                          Uploaded Photos ({uploadedPhotos.length})
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {uploadedPhotos.map((photo) => (
                            <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-border bg-card hover:border-primary transition-all">
                              <div className="aspect-square">
                                <img
                                  src={photo.url}
                                  alt={photo.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>

                              {/* Source & tamper badges */}
                              <div className="absolute top-1.5 left-1.5 flex flex-col gap-1">
                                {photo.sourceType === "real-time" && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/90 text-white text-[9px] font-semibold backdrop-blur-sm">
                                    <CheckCircle className="w-2.5 h-2.5" /> Live
                                  </span>
                                )}
                                {photo.isTampered && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-600/90 text-white text-[9px] font-semibold backdrop-blur-sm">
                                    <AlertCircle className="w-2.5 h-2.5" /> Tampered
                                  </span>
                                )}
                                {photo.deviceModel && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[9px] backdrop-blur-sm">
                                    {photo.deviceMake && !photo.deviceModel.toLowerCase().startsWith(photo.deviceMake.toLowerCase())
                                      ? `${photo.deviceMake} ${photo.deviceModel}`
                                      : photo.deviceModel}
                                  </span>
                                )}
                              </div>
                              
                              {/* Overlay with info */}
                              <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-5">
                                <div className="flex justify-end">
                                  <button
                                    onClick={() => handleDeletePhoto(photo.id)}
                                    className="w-10 h-10 rounded-full bg-muted hover:bg-muted/80 border border-border flex items-center justify-center transition-colors"
                                    title="Delete this photo"
                                  >
                                    <X className="w-5 h-5 text-foreground" />
                                  </button>
                                </div>
                                
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2 text-white text-xs bg-black/50 rounded p-1.5">
                                    <Camera className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{photo.name}</span>
                                  </div>
                                  {hasValidGps(photo.gpsLat, photo.gpsLng) ? (
                                    <>
                                      <div className="flex items-center gap-2 text-teal-300 text-xs bg-black/50 rounded p-1.5">
                                        <MapPin className="w-3 h-3 flex-shrink-0" />
                                        <span>{photo.gpsLat?.toFixed(5)}, {photo.gpsLng?.toFixed(5)}</span>
                                      </div>
                                      {photo.distanceFromSite !== undefined && (
                                        <div className={`flex items-center gap-2 text-xs bg-black/50 rounded p-1.5 ${
                                          photo.distanceFromSite <= GEOFENCE_RADIUS_M ? "text-teal-300" : "text-red-400"
                                        }`}>
                                          <Crosshair className="w-3 h-3 flex-shrink-0" />
                                          <span>{photo.distanceFromSite.toFixed(1)}m from site</span>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <div className="flex items-center gap-2 text-red-400 text-xs bg-black/50 rounded p-1.5">
                                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                      <span>No GPS Data — will be flagged</span>
                                    </div>
                                  )}
                                  {/* EXIF extras */}
                                  {photo.gpsAltitude !== undefined && (
                                    <div className="flex items-center gap-2 text-blue-300 text-[10px] bg-black/50 rounded p-1.5">
                                      Alt: {photo.gpsAltitude.toFixed(1)}m
                                      {photo.gpsDirection !== undefined && ` · Bearing: ${photo.gpsDirection.toFixed(0)}°`}
                                    </div>
                                  )}
                                  {photo.dateTimeOriginal && (
                                    <div className="text-gray-300 text-[10px] bg-black/50 rounded p-1.5 truncate">
                                      {photo.dateTimeOriginal}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CollapsibleSection>

                  {/* Material Specifications */}
                  <CollapsibleSection
                    title="Material Specifications"
                    subtitle="Optional notes"
                  >
                    <textarea
                      className="w-full min-h-20 p-4 rounded-lg border border-border bg-card text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Additional notes or specifications..."
                      value={materialSpecs}
                      onChange={(e) => setMaterialSpecs(e.target.value)}
                    />
                  </CollapsibleSection>

                  {/* Blueprint Upload — One-Time Only */}
                  <CollapsibleSection
                    title="Blueprint / Plan Upload"
                    subtitle={existingBlueprints.length > 0 ? "Blueprint already submitted" : "Required for Site Engineer verification"}
                    badge={blueprintUploaded ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> {existingBlueprints.length > 0 ? "Submitted" : "Uploaded"}
                      </span>
                    ) : isCheckingBlueprint ? (
                      <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Checking…
                      </span>
                    ) : undefined}
                  >
                    <div className="space-y-3">
                      {/* Show existing blueprint if already submitted */}
                      {existingBlueprints.length > 0 ? (
                        <div className="space-y-2">
                          <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-primary flex items-center gap-2">
                            <Shield className="w-4 h-4 shrink-0" />
                            <div>
                              <span className="font-semibold">Blueprint Submitted</span>
                              <span className="text-muted-foreground ml-1">— This is a one-time upload. The Site Engineer will verify it.</span>
                            </div>
                          </div>
                          {existingBlueprints.map(bp => (
                            <div key={bp.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/60 text-xs">
                              <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                              <div className="min-w-0">
                                <div className="font-medium text-foreground truncate">{bp.label}</div>
                                <div className="text-[10px] text-muted-foreground truncate">{bp.fileName}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2">Blueprint Label</label>
                            <select
                              value={blueprintLabel}
                              onChange={(e) => setBlueprintLabel(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                              <option value="Foundation Plan">Foundation Plan</option>
                              <option value="Structural Layout">Structural Layout</option>
                              <option value="Electrical Plan">Electrical Plan</option>
                              <option value="Plumbing Plan">Plumbing Plan</option>
                              <option value="Architectural Plan">Architectural Plan</option>
                              <option value="Site Development Plan">Site Development Plan</option>
                              <option value="As-Built Plan">As-Built Plan</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2">File (PDF or Image)</label>
                            <input
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) { setBlueprintFile(f); setBlueprintUploaded(false); }
                              }}
                              className="w-full text-sm text-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:text-sm file:bg-primary file:text-white hover:file:bg-accent"
                            />
                            {blueprintFile && (
                              <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5" />
                                {blueprintFile.name} ({(blueprintFile.size / 1024).toFixed(0)} KB)
                              </div>
                            )}
                          </div>
                          {blueprintFile && selectedProject && !blueprintUploaded && (
                            <Button
                              onClick={async () => {
                                if (!blueprintFile || !selectedProject) return;
                                setIsUploadingBlueprint(true);
                                try {
                                  const res = await blueprintApi.upload(
                                    selectedProject.id,
                                    blueprintLabel,
                                    blueprintFile,
                                    walletAddress || undefined
                                  );
                                  setBlueprintUploaded(true);
                                  setExistingBlueprints([{ id: res.data.id, label: res.data.label, fileName: res.data.fileName }]);
                                  alert("Blueprint uploaded successfully! Site Engineer will verify it.");
                                } catch (err) {
                                  console.error("Blueprint upload failed:", err);
                                  alert("Blueprint upload failed. Please try again.");
                                } finally {
                                  setIsUploadingBlueprint(false);
                                }
                              }}
                              disabled={isUploadingBlueprint}
                              className="w-full bg-primary hover:bg-accent text-white text-sm h-9"
                            >
                              {isUploadingBlueprint ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
                              ) : (
                                <><Upload className="w-4 h-4 mr-2" /> Upload Blueprint</>
                              )}
                            </Button>
                          )}
                          {blueprintUploaded && (
                            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-primary flex items-center gap-2">
                              <CheckCircle className="w-4 h-4" />
                              Blueprint uploaded — awaiting Site Engineer verification
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </CollapsibleSection>

                  {/* Itemized Expenses */}
                  <CollapsibleSection
                    title="Itemized Expenses"
                    badge={
                      expenses.length > 0 ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{expenses.length} item(s)</span>
                      ) : undefined
                    }
                    headerRight={
                      !showAddExpense ? (
                        <Button
                          onClick={(e) => { e.stopPropagation(); setShowAddExpense(true); }}
                          size="sm"
                          className="bg-primary hover:bg-accent h-7 text-xs"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          Add
                        </Button>
                      ) : undefined
                    }
                    defaultOpen
                  >

                    {/* Add Expense Form */}
                    {showAddExpense && (
                      <div className="mb-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2">Category</label>
                            <select
                              value={newExpense.category}
                              onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                              {expenseCategories.map((cat) => (
                                <option key={cat.id} value={cat.name}>{cat.description || cat.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2">Item Name</label>
                            <input
                              type="text"
                              value={newExpense.itemName}
                              onChange={(e) => setNewExpense({ ...newExpense, itemName: e.target.value })}
                              placeholder="e.g., Portland Cement Grade 40"
                              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2">Quantity</label>
                            <input
                              type="number"
                              value={newExpense.quantity}
                              onChange={(e) => setNewExpense({ ...newExpense, quantity: e.target.value })}
                              placeholder="e.g., 500"
                              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-2">Unit Price (₱)</label>
                            <input
                              type="number"
                              value={newExpense.unitPrice}
                              onChange={(e) => setNewExpense({ ...newExpense, unitPrice: e.target.value })}
                              placeholder="e.g., 250.00"
                              step="0.01"
                              className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <Button
                            onClick={handleAddExpense}
                            size="sm"
                            className="flex-1 bg-primary hover:bg-accent"
                          >
                            <Save className="w-4 h-4 mr-1" />
                            Add
                          </Button>
                          <Button
                            onClick={() => {
                              setShowAddExpense(false);
                              setNewExpense({ itemName: "", quantity: "", unitPrice: "", category: "" });
                            }}
                            size="sm"
                            variant="outline"
                            className="flex-1"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Expenses List */}
                    {expenses.length > 0 ? (
                      <div className="space-y-4">
                        <div className="bg-card rounded-lg border border-border overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/50 border-b border-border">
                                <tr>
                                  <th className="text-left p-4 font-semibold text-foreground">Category</th>
                                  <th className="text-left p-4 font-semibold text-foreground">Item</th>
                                  <th className="text-right p-4 font-semibold text-foreground">Qty</th>
                                  <th className="text-right p-4 font-semibold text-foreground">Unit Price</th>
                                  <th className="text-right p-4 font-semibold text-foreground">Total</th>
                                  <th className="text-center p-4 font-semibold text-foreground w-16">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expenses.map((expense) => (
                                  <tr key={expense.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                                    <td className="p-4">
                                      <span className="px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                                        {expense.category}
                                      </span>
                                    </td>
                                    <td className="p-4 text-foreground">{expense.itemName}</td>
                                    <td className="p-4 text-right text-foreground">{expense.quantity.toLocaleString()}</td>
                                    <td className="p-4 text-right text-foreground">{formatCurrencyPHP(expense.unitPrice)}</td>
                                    <td className="p-4 text-right font-semibold text-foreground">{formatCurrencyPHP(expense.total)}</td>
                                    <td className="p-4 text-center">
                                      <Button
                                        onClick={() => handleDeleteExpense(expense.id)}
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 hover:bg-muted"
                                      >
                                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-muted/50 border-t-2 border-border">
                                <tr>
                                  <td colSpan={4} className="p-4 text-right font-bold text-foreground">
                                    Total Expenses:
                                  </td>
                                  <td className="p-4 text-right font-bold text-sm text-primary">
                                    {formatCurrencyPHP(totalExpenses)}
                                  </td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-5 bg-muted/30 rounded-lg border border-dashed border-border">
                        <p className="text-xs text-muted-foreground">No expenses added yet</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Click "Add" to start itemizing costs</p>
                      </div>
                    )}
                  </CollapsibleSection>

                  {/* Billing Readiness Banner */}
                  {billingReady && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold text-primary">Draft Billing Ready</span>
                      </div>
                      <p className="text-xs text-primary/80">
                        Progress ({milestoneProgress}%) has reached the target ({targetPercent}%).
                        Total expenses: {formatCurrencyPHP(totalExpenses)}.
                        Submit this milestone for Site Engineer review and billing approval.
                      </p>
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="bg-card border border-border rounded-lg p-6">
                    {/* Compact readiness checklist */}
                    <div className="flex items-center gap-5 mb-4 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">Readiness:</span>
                      <span className={`inline-flex items-center gap-1 text-xs ${milestoneProgress >= targetPercent ? 'text-primary' : 'text-muted-foreground'}`}>
                        <CheckCircle className="w-3.5 h-3.5" /> {milestoneProgress}% / {targetPercent}% target
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs ${uploadedPhotos.length >= 4 ? 'text-primary' : 'text-muted-foreground'}`}>
                        <CheckCircle className="w-3.5 h-3.5" /> {uploadedPhotos.length}/4 photos
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs ${uploadedPhotos.every(p => hasValidGps(p.gpsLat, p.gpsLng)) ? 'text-primary' : 'text-muted-foreground'}`}>
                        <MapPin className="w-3.5 h-3.5" /> GPS {uploadedPhotos.every(p => hasValidGps(p.gpsLat, p.gpsLng)) ? 'verified' : 'missing'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs ${expenses.length > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                        <CheckCircle className="w-3.5 h-3.5" /> {expenses.length} expense(s)
                      </span>
                    </div>
                    
                    <Button
                      className={`w-full py-4 text-sm font-semibold transition-all ${
                        (submissionStatus === 'Draft' || submissionStatus === 'Approved') && !isSigning
                          ? 'bg-primary hover:bg-accent text-white'
                          : isSigning
                            ? 'bg-primary/80 text-white cursor-wait'
                            : 'bg-muted text-muted-foreground cursor-not-allowed'
                      }`}
                      onClick={submitMilestone}
                      disabled={
                        (submissionStatus !== 'Draft' && submissionStatus !== 'Approved') ||
                        isSigning
                      }
                    >
                      {isSigning ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          {signingStep || "Signing & Submitting..."}
                        </>
                      ) : submissionStatus === 'Submitted' || submissionStatus === 'Under Review' ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-1.5" />
                          Milestone Submitted
                        </>
                      ) : isConnected ? (
                        <>
                          <Shield className="w-4 h-4 mr-1.5" />
                          Sign & Submit Milestone
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-1.5" />
                          Submit Milestone (Demo Mode)
                        </>
                      )}
                    </Button>

                    {/* Signing progress steps */}
                    {isSigning && (
                      <div className="mt-3 space-y-1.5">
                        {["Preparing materials hash...", "Awaiting MetaMask signature...", "Uploading photos & saving...", "Recording audit trail...", "Finalizing..."].map((step, i) => {
                          const steps = ["Preparing materials hash...", "Awaiting MetaMask signature...", "Uploading photos & saving...", "Recording audit trail...", "Finalizing..."];
                          const currentIdx = steps.indexOf(signingStep);
                          const isDone = i < currentIdx;
                          const isCurrent = step === signingStep;
                          return (
                            <div key={step} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md transition-all ${
                              isDone ? 'text-primary bg-primary/5' : isCurrent ? 'text-foreground bg-primary/10 font-medium' : 'text-muted-foreground'
                            }`}>
                              {isDone ? (
                                <CheckCircle className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                              ) : isCurrent ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                              )}
                              {step.replace("...", "")}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {lastSignResult && !isSigning && (
                      <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                        <div className="flex items-center gap-2 text-xs text-primary font-semibold">
                          <Shield className="w-3.5 h-3.5" />
                          <span>Blockchain Verified</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Tx Hash:</span>
                          <a href={lastSignResult.etherscanUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-2 hover:text-primary/80 font-mono">
                            {lastSignResult.txHash.slice(0, 14)}...{lastSignResult.txHash.slice(-6)}
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Signer:</span>
                          <span className="font-mono text-foreground">
                            {lastSignResult.signer.slice(0, 8)}...{lastSignResult.signer.slice(-6)}
                          </span>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-center text-muted-foreground mt-4">
                      Cryptographically signed &amp; recorded on Sepolia blockchain + SQL database
                    </p>
                  </div>
                </div>
            </div>
          </div>
        )}
      </div>

      {/* ── GeoCamera Modal ── */}
      {showGeoCamera && (
        <GeoCamera
          siteAnchor={siteAnchor}
          maxRadius={GEOFENCE_RADIUS_M}
          onCapture={handleGeoCapture}
          onClose={() => setShowGeoCamera(false)}
        />
      )}

      {/* ── Insufficient Gas Modal ── */}
      <InsufficientGasModal open={gasError.open} onClose={clearGasError} message={gasError.message} />
    </div>
  );
}
