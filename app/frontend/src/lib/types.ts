/** Hand-written mirrors of the backend Pydantic models — keep in sync in the same edit. */

// ---------- auth ----------
export interface User {
    id: string;
    email: string;
    name: string;
    role: "admin" | "viewer";
    created_at: string | null;
}

// ---------- records ----------
export interface SourceRecord {
    id: string;
    sap_doc_no: string;
    domain: string;
    domain_name: string;
    sap_table: string;
    record_type: string;
    company_code: string;
    plant_code: string;
    plant_name: string;
    gstin: string | null;
    party_no: string | null;
    party_name: string | null;
    party_gstin: string | null;
    material_no: string | null;
    quantity: number | null;
    uom: string | null;
    cost_centre: string | null;
    profit_centre: string | null;
    currency: string;
    amount: number | null;
    debit_credit: string;
    fx_rate: number;
    amount_inr: number | null;
    doc_date: string | null;
    sap_doc_date: string;
    due_date: string | null;
    aging_days: number | null;
    fiscal_year: string | null;
    fiscal_period: string | null;
    fiscal_quarter: string | null;
    gst_treatment: string | null;
    cgst: number;
    sgst: number;
    igst: number;
    gst_note: string | null;
    status: string;
    sync_job_id: string | null;
    error_id: string | null;
    checksum: string;
    created_at: string | null;
}

export interface DestRecord {
    id: string;
    finsight_ref: string;
    source_id: string;
    source_doc_no: string | null;
    domain: string;
    domain_name: string | null;
    checksum: string;
    company_code: string | null;
    plant_code: string | null;
    plant_name: string | null;
    party_name: string | null;
    material_no: string | null;
    quantity: number | null;
    uom: string | null;
    cost_center_code: string | null;
    profit_center_code: string | null;
    gl_account: string | null;
    source_currency: string;
    source_amount: number | null;
    fx_rate_used: number;
    currency: string;
    gross_amount_inr: number;
    net_amount_inr: number | null;
    tax_amount_inr: number | null;
    cgst_inr: number;
    sgst_inr: number;
    igst_inr: number;
    gst_treatment: string | null;
    debit_credit: string;
    doc_date: string | null;
    fiscal_year: string | null;
    posting_period: string | null;
    fiscal_quarter: string | null;
    sync_job_id: string | null;
    region: string;
    loaded_at: string | null;
}

export interface RecordPage {
    items: SourceRecord[];
    total: number;
    page: number;
    page_size: number;
}

export interface DomainStat {
    key: string;
    name: string;
    sap_table: string;
    doc_type: string;
    total: number;
    pending: number;
    synced: number;
    failed: number;
    dest_count: number;
    last_sync_at: string | null;
}

export interface DomainMeta {
    key: string;
    name: string;
    sap_table: string;
    doc_type: string;
}

export interface PlantMeta {
    code: string;
    name: string;
    segment: string;
    state: string;
    state_code: string;
    gstin: string;
}

// ---------- integration ----------
export interface ApiEndpoint {
    id: string;
    key: string;
    side: "source" | "destination";
    domain: string;
    domain_name: string;
    name: string;
    method: string;
    path: string;
    base_url: string;
    auth_type: string;
    auth_doc: string;
    description: string;
    status: string;
    request_sample: Record<string, unknown>;
    response_sample: Record<string, unknown>;
    headers: Record<string, unknown>;
    test_count: number;
    test_success_count: number;
    avg_latency_ms: number | null;
    last_test_at: string | null;
    last_test_success: boolean | null;
}

export interface EndpointTest {
    id: string;
    endpoint_id: string;
    endpoint_key: string;
    method: string;
    path: string;
    status_code: number;
    success: boolean;
    latency_ms: number;
    request_sample: Record<string, unknown>;
    response_sample: Record<string, unknown>;
    tested_by_email: string;
    created_at: string;
}

export interface FieldMapping {
    id: string;
    domain: string;
    domain_name: string;
    sap_field: string;
    finsight_field: string;
    transform: string;
    sample: string;
    required: boolean;
    active: boolean;
}

export interface SyncJob {
    id: string;
    domain: string;
    domain_name: string;
    batch_size: number;
    strategy: string;
    reprocess: boolean;
    mode: string;
    extracted: number;
    transformed: number;
    loaded: number;
    duplicates_skipped: number;
    validation_failed: number;
    failed: number;
    duration_ms: number;
    status: string;
    triggered_by_email: string | null;
    message: string;
    created_at: string;
    finished_at: string | null;
}

export interface ErrorRecord {
    id: string;
    source_id: string | null;
    source_doc_no: string | null;
    domain: string | null;
    domain_name: string | null;
    classification: string;
    message: string;
    job_id: string | null;
    attempts: number;
    status: string;
    dead_letter: boolean;
    next_retry_at: string | null;
    payload_snapshot: Record<string, unknown>;
    region: string;
    created_at: string;
    resolved_at: string | null;
}

export interface ErrorPage {
    items: ErrorRecord[];
    counts: Record<string, number>;
}

export interface CircuitBreaker {
    key: string;
    domain: string;
    state: string;
    consecutive_failures: number;
    total_failures: number;
    opened_at: string | null;
    updated_at: string | null;
    endpoint_key: string | null;
    endpoint_status: string | null;
}

export interface ReconRow {
    source_id: string;
    dest_id: string | null;
    domain: string;
    domain_name: string | null;
    sap_doc_no: string;
    finsight_ref: string | null;
    plant_code: string;
    party_name: string | null;
    source_amount_inr: number | null;
    dest_amount_inr: number | null;
    source_debit_credit: string;
    dest_debit_credit: string | null;
    delta_inr: number | null;
    kind: string;
}

export interface ReconciliationRun {
    id: string;
    scope: string;
    domain: string | null;
    counts: Record<string, number>;
    totals: Record<string, number>;
    status: string;
    adjusted: boolean;
    rows: ReconRow[];
    duration_ms: number;
    created_by_email: string | null;
    created_at: string;
}

export interface MonitoringMetric {
    id: string;
    key: string;
    name: string;
    unit: string;
    category: string;
    description: string;
    direction: string;
    warn_threshold: number;
    crit_threshold: number;
    value: number | null;
    state: string;
    computed_at: string | null;
}

export interface AlertItem {
    metric_key: string;
    metric_name: string;
    severity: string;
    value: number;
    threshold: number;
    unit: string;
    message: string;
}

export interface AuditEntry {
    id: string;
    action: string;
    actor_email: string;
    actor_role: string;
    detail: Record<string, unknown>;
    severity: string;
    region: string;
    created_at: string;
}

export interface SyncSchedule {
    domain: string;
    domain_name: string;
    interval: string;
    updated_at: string | null;
}

// ---------- aggregates ----------
export interface FinancialKpis {
    revenue_inr: number;
    expenses_inr: number;
    ebitda_inr: number;
    cash_inflow_inr: number;
    cash_outflow_inr: number;
    net_cash_flow_inr: number;
    ap_outstanding_inr: number;
    ar_outstanding_inr: number;
    inventory_value_inr: number;
    gst_collected_inr: number;
}

export interface LatencyPoint {
    hour: string;
    avg_latency_ms: number;
    error_rate_pct: number;
}

export interface PlantPerformance {
    plant_code: string;
    revenue_inr: number;
    expenses_inr: number;
    gst_paid_inr: number;
    records_synced: number;
    reliability_pct: number;
}

export interface DashboardSummary {
    records: { total: number; pending: number; synced: number; failed: number; destination: number };
    api: { total_tests: number; success_rate_pct: number; avg_latency_ms: number };
    sync: {
        jobs_30d: number;
        successful_jobs_30d: number;
        last_job: SyncJob | null;
    };
    financial: FinancialKpis;
    pipeline: { source_endpoints_up: number; source_endpoints_total: number; breakers_open: number };
    domain_health: Array<{
        key: string;
        name: string;
        total: number;
        pending: number;
        synced: number;
        failed: number;
        dest_count: number;
        last_sync_at: string | null;
    }>;
    status_mix: Array<{ status: string; count: number }>;
    latency_trend: LatencyPoint[];
    plants: PlantPerformance[];
    audit_recent: AuditEntry[];
    generated_at: string;
}

export interface MonthlyPoint {
    month: string;
    revenue_inr: number;
    expenses_inr: number;
    net_cash_flow_inr: number;
}

export interface AgingBucket {
    bucket: string;
    amount_inr: number;
    count: number;
}

export interface FinancialAnalytics {
    kpis: FinancialKpis;
    monthly: MonthlyPoint[];
    aging: { payables: AgingBucket[]; receivables: AgingBucket[] };
    generated_at: string;
}

// ---------- misc ----------
export interface FxRates {
    source: string;
    synced_at: string | null;
    rates: Array<{ currency: string; rate_to_inr: number }>;
}

export interface SandboxResult {
    dest: DestRecord | null;
    steps: Array<{ field: string; rule: string; detail: string }>;
    issues: Array<{ field: string; code: string; message: string }>;
}

export interface SimulatorMeta {
    domains: DomainMeta[];
    plants: PlantMeta[];
}

export interface Timeseries {
    latency: Array<{ hour: string; avg_latency_ms: number; errors: number }>;
    throughput: Array<{ hour: string; records: number }>;
}
