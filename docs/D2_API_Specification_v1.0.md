# D2: API Specification Document (v1.0)

**Project:** Custom API Integration Between Client's ERP (SAP S/4HANA) and Financial Analytics Platform (FinSight)  
**Standard:** OpenAPI 3.0.3 Compliant  
**Environment:** Production / Simulated Ingestion  

---

## 1. Overview & Protocol Architecture

The Integration Bridge manages communication across two primary API interfaces:
1. **Source Endpoints (`SRC-001` to `SRC-012`)**: Representing SAP S/4HANA OData v2 and CDS View delta extraction services.
2. **Destination Endpoints (`DST-001` to `DST-012`)**: Representing Zetheta FinSight Analytics ingestion REST APIs.

---

## 2. Global Standards & Cross-Cutting Headers

### 2.1 Authentication & Authorization
* **SAP S/4HANA**: Mutual TLS (mTLS) with Basic Auth over RFC Gateway or OAuth 2.0 SAML Bearer Assertion.
* **FinSight Analytics**: OAuth 2.0 Client Credentials Grant. Access tokens are JWTs with 1-hour expiration.
  - Header: `Authorization: Bearer <access_token>`

### 2.2 Idempotency & Concurrency
* All mutation requests (`POST`, `PUT`) require an `Idempotency-Key` header containing a unique SHA-256 hash of the payload:
  - Header: `Idempotency-Key: <sha256_hash>`
* If a duplicate key is presented with identical payload, HTTP 200/201 returns the cached response. If the payload differs, HTTP 409 Conflict is raised.

### 2.3 Rate Limiting Standards
All endpoints enforce API rate limits and surface standard headers:
* `X-RateLimit-Limit`: Maximum requests permitted per 60-second window (e.g., `1000`).
* `X-RateLimit-Remaining`: Remaining request capacity in current window.
* `X-RateLimit-Reset`: Epoch seconds timestamp when quota resets.
* On breach, returns `HTTP 429 Too Many Requests` with a `Retry-After: <seconds>` header.

---

## 3. SAP S/4HANA Source Endpoint Registry (12 Domains)

| Endpoint ID | Domain Name | SAP Table / CDS View | HTTP Method & Path | Extraction Trigger & Cadence |
| :--- | :--- | :--- | :--- | :--- |
| **SRC-001** | General Ledger | `ACDOCA` / `ZZ_CDS_ACDOCA_DELTA` | `GET /sap/opu/odata/sap/ZGL_EXTRACT_SRV/JournalEntries` | ODP Delta (Every 30 mins) |
| **SRC-002** | Accounts Payable | `BSIK`, `LFA1`, `LFC1` | `GET /sap/opu/odata/sap/ZAP_EXTRACT_SRV/VendorOpenItems` | ODP Delta (Hourly) |
| **SRC-003** | Accounts Receivable | `BSID`, `KNA1`, `KNC1` | `GET /sap/opu/odata/sap/ZAR_EXTRACT_SRV/CustomerOpenItems` | ODP Delta (Hourly) |
| **SRC-004** | Cost Centre | `CSKS`, `CSKT`, `COSP` | `GET /sap/opu/odata/sap/ZCO_EXTRACT_SRV/CostCenterPostings` | Daily at 01:00 IST |
| **SRC-005** | Profit Centre | `CEPC`, `CEPCT` | `GET /sap/opu/odata/sap/ZPC_EXTRACT_SRV/ProfitCenterMaster` | Daily at 01:30 IST |
| **SRC-006** | Material Ledger | `MBEW`, `CKMLCR` | `GET /sap/opu/odata/sap/ZML_EXTRACT_SRV/MaterialValuations` | Daily at 02:00 IST |
| **SRC-007** | Purchase Orders | `EKKO`, `EKPO`, `EKET` | `GET /sap/opu/odata/sap/ZMM_EXTRACT_SRV/PurchaseOrders` | ODP Delta (Every 30 mins) |
| **SRC-008** | Sales Orders | `VBAK`, `VBAP`, `VBEP` | `GET /sap/opu/odata/sap/ZSD_EXTRACT_SRV/SalesOrders` | ODP Delta (Every 15 mins) |
| **SRC-009** | Fixed Assets | `ANLA`, `ANLZ`, `ANLP` | `GET /sap/opu/odata/sap/ZFA_EXTRACT_SRV/AssetTransactions` | Daily at 02:30 IST |
| **SRC-010** | Bank Statements | `FEBEP`, `FEBKO` | `GET /sap/opu/odata/sap/ZFI_EXTRACT_SRV/BankStatementItems` | Daily at 06:00 IST |
| **SRC-011** | Budget vs Actual | `BPJA`, `COSS` | `GET /sap/opu/odata/sap/ZCO_EXTRACT_SRV/BudgetActuals` | Monthly at 00:00 IST |
| **SRC-012** | Inventory & Goods | `MARD`, `MSEG` | `GET /sap/opu/odata/sap/ZMM_EXTRACT_SRV/InventoryMovements` | Every 6 hours |

---

## 4. FinSight Destination Endpoint Registry (12 Domains)

| Endpoint ID | Target Resource | FinSight REST Endpoint Path | HTTP Method | Expected Payload Format |
| :--- | :--- | :--- | :--- | :--- |
| **DST-001** | Consolidated GL | `/api/v2/analytics/journal-entries` | `POST` | Verified Line Item Array (INR) |
| **DST-002** | Vendor Aging | `/api/v2/analytics/ap/open-items` | `POST` | Vendor Open Items with Aging |
| **DST-003** | Customer Aging | `/api/v2/analytics/ar/open-items` | `POST` | Customer Open Items & Dunning |
| **DST-004** | Cost Allocation | `/api/v2/analytics/cost-centers/actuals` | `POST` | Flattened 7-Level Hierarchy |
| **DST-005** | Segment P&L | `/api/v2/analytics/profit-centers/flows` | `POST` | Operating Margin Summary |
| **DST-006** | Material Valuation| `/api/v2/analytics/materials/valuations` | `POST` | Inventory Moving Average INR |
| **DST-007** | Procurement P2P | `/api/v2/analytics/procurement/orders` | `POST` | PO with GR/IR Clearing Status |
| **DST-008** | Revenue Orders | `/api/v2/analytics/sales/orders` | `POST` | Sales Revenue with GST Splits |
| **DST-009** | Asset Register | `/api/v2/analytics/assets/depreciations` | `POST` | Asset Cost & Book Value INR |
| **DST-010** | Cash Position | `/api/v2/analytics/treasury/cash-flows` | `POST` | Reconciled Bank Statements |
| **DST-011** | Variance Analysis| `/api/v2/analytics/controlling/variances`| `POST` | Budget vs Actual Plan Gaps |
| **DST-012** | Plant Inventory | `/api/v2/analytics/supply-chain/stock` | `POST` | Multi-Plant Stock Positions |

---

## 5. Sample API Contract: Sales Orders (`SRC-008` & `DST-008`)

### 5.1 Source Extraction Request (`SRC-008`)
```http
GET /sap/opu/odata/sap/ZSD_EXTRACT_SRV/SalesOrders?$filter=ERDAT ge datetime'2026-03-01T00:00:00' and BUKRS eq '1000'&$top=100&$skiptoken=DELTA_TOKEN_093000 HTTP/1.1
Host: s4h-prd.meridian.internal
Authorization: Basic UzRIVEVURUxUOk1lcmlkaWFuMjAyNiE=
Accept: application/json
```

### 5.2 Destination Ingestion Request (`DST-008`)
```http
POST /api/v2/analytics/sales/orders HTTP/1.1
Host: analytics-api.finsight.zetheta.in
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Idempotency-Key: a5f162e3d36b8c8d0a8b940984f185ef378619bc3e8
Content-Type: application/json

{
  "batch_id": "BATCH-SO-20260315-0930",
  "company_code": "1000",
  "records": [
    {
      "finsight_ref": "SO-1000-2026-0090001001",
      "sap_doc_no": "0090001001",
      "customer_id": "CUST-1001",
      "customer_name": "Tata Motors Ltd",
      "plant_code": "PL-101",
      "plant_name": "Chakan Plant",
      "doc_date": "2026-03-15",
      "net_amount_inr": 2500000.00,
      "tax_amount_inr": 450000.00,
      "gross_amount_inr": 2950000.00,
      "gst_treatment": "intra",
      "cgst_inr": 225000.00,
      "sgst_inr": 225000.00,
      "igst_inr": 0.00,
      "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  ]
}
```

---

## 6. Standard Error Schemas & HTTP Status Mapping

All FinSight APIs return RFC 7807 compliant problem details:

```json
{
  "type": "https://api.finsight.zetheta.in/errors/INVALID_DATE_FORMAT",
  "title": "Invalid Date Format",
  "status": 400,
  "detail": "Field 'doc_date' must conform to ISO 8601 (YYYY-MM-DD). Received '15/03/2026'.",
  "instance": "/errors/80e44f60-0668-42df-ba3c-8157954f7ef3",
  "error_code": "ERR-MAP-002",
  "retryable": false
}
```
