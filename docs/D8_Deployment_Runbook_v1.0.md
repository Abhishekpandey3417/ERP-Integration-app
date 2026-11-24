# D8: Deployment Runbook & Rollback Procedure (v1.0)

**Project:** Custom API Integration Between Client's ERP (SAP S/4HANA) and Financial Analytics Platform (FinSight)  
**Standard:** Enterprise Production Operations & ITIL Release Management  
**Status:** Approved for Production Deployment  

---

## 1. Pre-Deployment Operational Checklist (15 Items)

All items must be signed off by Lead FDE and VP of IT Infrastructure prior to commencing production release:

* [ ] **CHG-01**: Change Advisory Board (CAB) approval ticket logged and approved (`CAB-2026-0894`).
* [ ] **NET-02**: Dedicated MPLS tunnel between Pune DC and AWS Mumbai (`ap-south-1`) verified active (ping $< 15$ ms).
* [ ] **FW-03**: Firewall rules active on Port 443 (HTTPS outbound to FinSight) and Port 3300/8000 (SAP RFC/Gateway).
* [ ] **SAP-04**: SAP service account `S4H_FINSIGHT_SVC` provisioned with authorization profiles `S_RFC` and `S_TABU_DIS`.
* [ ] **SAP-05**: RFC destination pool quota verified at 50 connections with zero contention.
* [ ] **ODP-06**: ODP delta queues (`ZZ_CDS_ACDOCA_DELTA`) initialized in SAP transaction `RSA1`.
* [ ] **SEC-07**: Production secrets (JWT secret, DB credentials, OAuth tokens) stored in AWS Secrets Manager.
* [ ] **DB-08**: MongoDB replica set provisioned in AWS private subnets with automated EBS snapshots enabled.
* [ ] **BAK-09**: Full database backup executed and recovery tested within staging environment.
* [ ] **MON-10**: Grafana monitoring dashboards and Prometheus scrapers verified active.
* [ ] **PAG-11**: PagerDuty on-call escalation rotation verified for P1 incident triage.
* [ ] **WIN-12**: Maintenance window confirmed (Saturday 22:00–02:00 IST) avoiding nightly batch `RGGBS000`.
* [ ] **STK-13**: Stakeholder notification broadcast to CFO, Corporate Accounting, and IT Help Desk.
* [ ] **DOC-14**: Rollback trigger conditions reviewed with deployment bridge participants.
* [ ] **VER-15**: Build artifacts SHA-256 signatures verified against CI/CD release tag (`v1.0.0-prod`).

---

## 2. Step-by-Step Deployment Execution Guide

### Phase 1: Environment Preparation (T - 30 minutes)
```bash
# 1. SSH into production bastion host
ssh -i /path/to/meridian_bastion.pem ec2-user@bastion.meridian-prod.ap-south-1.internal

# 2. Verify target cluster health and environment variables
cd /opt/meridian-bridge
docker-compose --version
python3 --version
```

### Phase 2: Pull and Deploy Services (T + 00 minutes)
```bash
# 3. Pull certified production Docker images
docker pull ghcr.io/meridian/integration-backend:v1.0.0
docker pull ghcr.io/meridian/integration-frontend:v1.0.0

# 4. Stop staging instances and apply database migrations
docker-compose down --remove-orphans
docker run --rm --env-file /opt/meridian-bridge/.env \
  ghcr.io/meridian/integration-backend:v1.0.0 python -m seed

# 5. Bring up backend and worker containers
docker-compose up -d backend-service odp-worker-pool
sleep 10
docker-compose logs --tail=50 backend-service
```

### Phase 3: Frontend Web Deployment (T + 15 minutes)
```bash
# 6. Launch production UI web servers
docker-compose up -d frontend-web
docker-compose ps
```

---

## 3. Post-Deployment Verification Checks (10 Items)

Execute immediately following service launch to confirm operational integrity:

1. **PV-01 (Health Probe)**: `curl -f http://127.0.0.1:8000/api/dashboard/summary` returns HTTP 401/200 (not 500).
2. **PV-02 (Web Console)**: Open `https://bridge.meridian.internal` in browser; login page loads without asset 404s.
3. **PV-03 (Authentication)**: Sign in as `admin@meridian.com`; JWT cookie issued with `httpOnly` and `SameSite=Lax`.
4. **PV-04 (SAP Connection)**: Run endpoint probe on `SRC-001` via API Management; returns HTTP 200 with latency $< 300$ ms.
5. **PV-05 (ODP Polling)**: Verify ODP delta worker registers active subscription in SAP `RSA1`.
6. **PV-06 (Transformation)**: Execute test sandbox transformation via `/transformation`; returns 100% field mapping pass.
7. **PV-07 (Reconciliation)**: Execute on-demand sync run for domain `so`; verify batch reconciliation report shows zero breaks.
8. **PV-08 (Circuit Breakers)**: Inspect `/error-management`; all 12 domain circuit breakers report state `CLOSED`.
9. **PV-09 (Telemetry)**: Inspect `/monitoring`; all 12 Prometheus panels populate with live values.
10. **PV-10 (Audit Log)**: Query `db.audit_logs`; verify production deployment event recorded with operator identity.

---

## 4. Rapid Rollback Procedure (<15 Minute SLA)

### 4.1 Rollback Decision Matrix
A deployment rollback must be triggered if any of the following conditions occur within 45 minutes of go-live:
* Critical unresolvable database connection failure.
* More than 5% of extracted records route to DLQ due to systemic mapping faults.
* SAP RFC connection pool utilization remains at 100% for $> 5$ minutes, impacting ERP dialog users.
* Decision Authority: Lead FDE or VP of IT Infrastructure. Max decision time: 10 minutes.

### 4.2 Rollback Execution Steps
```bash
# STEP 1: Immediately halt ingestion traffic and worker extractions
docker-compose stop odp-worker-pool backend-service

# STEP 2: Revert to previous stable container release
export RELEASE_TAG=v0.9.8-stable
docker-compose up -d --force-recreate backend-service odp-worker-pool frontend-web

# STEP 3: Invalidate SAP delta tokens to force full clean catch-up on stable release
python -m lib.pipeline --reset-delta-tokens

# STEP 4: Confirm stable telemetry and notify emergency bridge
curl -f http://127.0.0.1:8000/api/dashboard/summary
# Target Recovery Time: Under 15 minutes.
```
