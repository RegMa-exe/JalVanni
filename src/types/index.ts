export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type IncidentStatus = 'new' | 'triaged' | 'dispatched' | 'in_progress' | 'resolved'

export type IncidentCategory =
  | 'Pipe Burst'
  | 'Leakage'
  | 'No Supply'
  | 'Low Pressure'
  | 'Contamination'
  | 'Sewage Overflow'
  | 'Meter Fault'
  | 'Other'

export type ReportChannel = 'voice' | 'app' | 'sensor' | 'field'

export interface Zone {
  id: string
  name: string
  ward: string
  pressureBar: number
  supplyHours: number
  health: 'normal' | 'watch' | 'alert'
}

export interface Incident {
  id: string
  title: string
  category: IncidentCategory
  severity: Severity
  status: IncidentStatus
  channel: ReportChannel
  zoneId: string
  location: string
  reportedAt: string // ISO
  reporter: string
  language: string
  affectedHouseholds: number
  transcript?: string
  aiSummary: string
  aiConfidence: number // 0-1
  workOrderId?: string
  /** Structured AI (or rule-based fallback) analysis attached at intake. */
  analysis?: IncidentAnalysisRecord
  /** Operator has reviewed the analysis (human-in-the-loop). */
  reviewed?: boolean
}

export type AiIncidentType =
  | 'pipeline_leak'
  | 'pipe_burst'
  | 'low_pressure'
  | 'water_shortage'
  | 'suspected_contamination'
  | 'other'
  | 'unclear'

export type SupplyImpact = 'no_supply' | 'reduced_supply' | 'quality_affected' | 'none_reported' | 'unknown'

/** Mirrors the server-validated JSON returned by /api/analyze. */
export interface AiIncidentAnalysis {
  incident_type: AiIncidentType
  location: string | null
  landmark: string | null
  severity: Severity
  description: string
  water_supply_impact: SupplyImpact
  severity_rationale: string
  /** Evidence factors the model reported; the server caps severity to what these support. */
  severity_factors?: string[]
  /** Set when the server capped the severity to the rubric maximum, or applied the illness safety floor. */
  severity_adjusted?: { from: Severity; to: Severity; reason?: string }
  /** Factors the model claimed that its own structured fields do not support (dropped by the server). */
  severity_factors_dropped?: string[]
  reported_duration?: string | null
  affected_population: { scope: string | null; estimated_households: number | null }
  recommended_action: RecommendedActions
  missing_information: MissingInformation
  requires_human_review: true
  reasoning: string
  verification_status: 'reported_unverified' | 'verified'
  /** Qualitative, uncalibrated — never shown as a probability. */
  confidence: 'high' | 'medium' | 'low'
  /** Count of immediate actions the server guard moved to after-verification. */
  guard_moved_actions?: number
}

export interface RecommendedActions {
  /** Safe before verification: call-back, site verification, precautionary advice. */
  immediate_actions: string[]
  /** Repair/operational steps, only after verification or authorised emergency triage. */
  after_verification_actions: string[]
}

export interface MissingInformation {
  essential: string[]
  optional_evidence: string[]
}

export interface AnalysisMeta {
  provider: string
  requestedModel: string
  model: string
  structuredOutput: 'json_schema' | 'json_object' | 'prompt_only'
  generationId: string | null
  attempts: number
  latencyMs: number
}

export type IncidentAnalysisRecord =
  | { source: 'ai'; result: AiIncidentAnalysis; meta: AnalysisMeta; analysedAt: string }
  | { source: 'rule_based_fallback'; result: AiIncidentAnalysis; fallbackReason: string; analysedAt: string }


export type WorkOrderStatus = 'open' | 'assigned' | 'en_route' | 'on_site' | 'completed' | 'on_hold'

export interface Crew {
  id: string
  name: string
  lead: string
  specialty: string
  available: boolean
}

export interface WorkOrder {
  id: string
  incidentId: string
  title: string
  zoneId: string
  priority: Severity
  status: WorkOrderStatus
  crewId?: string
  createdAt: string
  dueAt: string
  progress: number // 0-100
  materials: string[]
}
