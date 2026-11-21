/** The 12 monitored SAP domains — mirrors lib/sap_sim.py DOMAINS. */
export const DOMAINS = [
    { key: "gl", name: "General Ledger", sap_table: "BKPF/BSEG", doc_type: "FI-GL" },
    { key: "ap", name: "Accounts Payable", sap_table: "BSIK/BSAK", doc_type: "FI-AP" },
    { key: "ar", name: "Accounts Receivable", sap_table: "BSID/BSAD", doc_type: "FI-AR" },
    { key: "cc", name: "Cost Centre Accounting", sap_table: "COEP/CSKS", doc_type: "CO-CCA" },
    { key: "pc", name: "Profit Centre Accounting", sap_table: "GLPCA/CEPC", doc_type: "CO-PCA" },
    { key: "ml", name: "Material Ledger", sap_table: "CKMLCR/MLDOC", doc_type: "CO-PC-ACT" },
    { key: "po", name: "Purchase Orders", sap_table: "EKKO/EKPO", doc_type: "MM-PUR" },
    { key: "so", name: "Sales Orders", sap_table: "VBAK/VBAP", doc_type: "SD-SLS" },
    { key: "fa", name: "Fixed Assets", sap_table: "ANEP/ANLA", doc_type: "FI-AA" },
    { key: "bs", name: "Bank Statements", sap_table: "FEBEP/FEBKO", doc_type: "FI-BL" },
    { key: "bg", name: "Budget & Forecasting", sap_table: "BPJA/BPGE", doc_type: "CO-OM-CCA" },
    { key: "inv", name: "Inventory & Valuation", sap_table: "MBEW/MARD", doc_type: "MM-IM" },
] as const;

export type DomainKey = (typeof DOMAINS)[number]["key"];

export function domainName(key: string): string {
    return DOMAINS.find((d) => d.key === key)?.name ?? key;
}

/** The 7 Meridian Manufacturing plants — mirrors lib/sap_sim.py PLANTS. */
export const PLANTS = [
    { code: "PL-101", name: "Chakan Plant", state: "Maharashtra" },
    { code: "PL-102", name: "Sriperumbudur Plant", state: "Tamil Nadu" },
    { code: "PL-103", name: "Sanand Plant", state: "Gujarat" },
    { code: "PL-104", name: "Baddi Plant", state: "Himachal Pradesh" },
    { code: "PL-105", name: "Jamshedpur Plant", state: "Jharkhand" },
    { code: "PL-106", name: "Hosur Plant", state: "Tamil Nadu" },
    { code: "PL-107", name: "Noida Plant", state: "Uttar Pradesh" },
] as const;
