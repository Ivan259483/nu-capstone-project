# AutoGloss Capstone Manuscript — Revision Guide

**Purpose:** Align the manuscript with the **AutoSPF+** codebase (as of May 2026).  
**Action:** Copy each block into your Word/Google Doc at the section indicated.

---

## Branding note (add after title page or in §1.2)

> **Note on naming:** *AutoGloss* is the capstone project name for this study. The system is deployed for **AutoSPF+**, the client detailing shop specializing in paint protection film (PPF), ceramic coating, and related services. References to AutoGloss in this document refer to the same system unless otherwise stated.

---

## Chapter 1 — §1.2 Purpose and Description

**Replace** the paragraph that says technicians will 3D scan vehicles **with:**

> Quality Checkers (field staff; legacy labels: detailer/technician) use the web Detailer portal and the mobile staff application to capture vehicle condition, update job stages, complete quality checklists, and document before-and-after results. Customers use the web and mobile apps for booking, live tracking, AI-assisted damage inspection, and AR previews. Administrators and office administrators oversee operations, inventory, and analytics on the web dashboard. Sales staff manage appointments, customer assistance, and point-of-sale transactions on the web.

---

## Chapter 1 — §1.3 Specific Objectives

### Objective 3 — AI Chatbot & Voice Assistant

**Replace** the voice-assistant bullet **with:**

> • To design a voice-assisted workflow module for quality checkers to update job status and log inventory usage hands-free. *(Initial implementation provides the user interface and workflow design; full speech recognition and command execution are identified as future enhancement.)*

### Objective 6 — Inventory & Admin Dashboard

**Replace** emphasis on “predictive analytics” **with:**

> • To build an **operational analytics dashboard** that summarizes sales, job throughput, inventory usage, and service performance using historical shop data. Insights support scheduling and business decisions at AutoSPF+. *Machine-learning-based predictive maintenance and demand forecasting are outside the current implementation scope but are supported by related literature reviewed in Chapter 2.*

---

## Chapter 1 — §1.4 Scope

### Add after “For Admin & Sales”

> **For Office Administrator:** Supports user and role management, appointment oversight, inventory monitoring, live job tracking, waiver and document management, and operational reporting with permissions between full administrator and sales staff.

### Quality Checker scope — replace “technicians” wording

> Allows Quality Checkers (`staff_quality_checker`) to view assigned jobs, perform pre-assessment, update live tracker stages, complete QC checklists, and validate service outcomes through the web Detailer portal and mobile staff application.

### System Capabilities — analytics line

**Replace** “predictive analytics” phrasing **with:**

> Operational analytics dashboards fed by real-time booking, job, and POS data.

---

## Chapter 1 — §1.4 Delimitation

### Replace entire POS block

> **POS and Payment Restrictions**
> • At AutoSPF+, the primary customer booking flow uses **GCash downpayment** (QR/proof upload) as the standard method.
> • The web POS module additionally supports **cash, credit/debit card, Maya, and bank transfer** for onsite completion; Stripe integration is available for digital checkout where configured.
> • Installment plans and integration with external Philippine e-wallets beyond those listed are not part of the shop's current operational policy.
> • Mobile application payment handling focuses on downpayment proof and balance tracking; full POS checkout is performed on the web sales dashboard.

### Add new subsection: Platform Scope

> **Platform Scope**
> • **Web application:** Full functionality for Administrator, Office Administrator, Sales, Quality Checker, and Customer (including POS, inventory management, admin analytics, and sales reporting).
> • **Mobile application:** Optimized for **Customer** (registration, booking, live tracker, AI/AR scan, chatbot, waivers) and **Quality Checker / field staff** (job queue, workflow steps, QC tasks). Sales and full administrative modules are **web-only**; sales users on mobile are routed to the customer experience.

### Add after AI Damage Detection Restrictions

> • On the **mobile app and backend API**, damage analysis uses cloud-based AI vision processing on uploaded vehicle images.
> • On the **public web AI estimator page**, a **local rule-based demonstration engine** is used for offline-capable capstone demonstration when cloud API access is limited.

### Fix typo

| Wrong | Correct |
|-------|---------|
| SO/IEC | **ISO/IEC** |

---

## Chapter 2 — §2.3 Synthesis

**Replace:**

> predictive analytics to elevate the overall service experience

**With:**

> operational analytics and data-driven dashboards to elevate transparency and business visibility, with predictive analytics identified in literature as a future extension

---

## Chapter 3 — Peopleware (target users)

| User | Platform | System role |
|------|----------|-------------|
| Shop Owner / Management (AutoSPF+) | Web | `administrator` or `office_admin` |
| Sales Staff | Web | `sales` |
| Quality Checker | Web + Mobile | `staff_quality_checker` |
| Customer | Web + Mobile | `customer` |

**Remove** implication that all staff use mobile for full admin/sales/POS.

---

## Chapter 3 — §3.1 Networks

**Replace:**

> predictive analytics models to access the latest data

**With:**

> operational analytics and cloud database synchronization to keep booking, job, and inventory data current across web and mobile clients

---

## Chapter 3 — §3.2 AI module (Special Software)

**Replace** predictive analytics sentence **with:**

> The AI module uses computer vision (cloud-based on production paths) to detect surface scratches, dents, and paint defects from photos. **Operational analytics** on the admin and sales dashboards summarize historical jobs, revenue, and inventory trends. Machine-learning forecasting is not implemented in the current release.

---

## Chapter 3 — Figure 1 caption (add one sentence)

> Sales and administrative modules are deployed on the web tier; the mobile tier serves customers and quality-check field workflows.

---

## Table 1 — Gap Analysis

**Rename row:**

| Old label | New label |
|-----------|-----------|
| Predictive Service Analytics | **Operational / Business Analytics Dashboard** |

**Footnote for AutoGloss column:** *Descriptive KPIs and trends; not ML-based failure prediction.*

---

## Table 5 — Web functional requirements

### Voice Activated Assistant Module

- **Actor:** Quality Checker (Web Detailer Portal) — not Admin only.
- **Description addendum:** *Full voice recognition is planned; current release provides the voice-assistant module layout and supported command categories.*

### Rewards Module

**Footnote:** *Partial implementation: loyalty points are recorded on completed services; full redemption catalog is under development.*

---

## Table 6 — Mobile functional requirements

### Dashboard/Home Page — replace Output

**Delete:**

> For Admin, the Admin Dashboard / For Sales, the Sales Dashboard / For Quality Checker...

**Use:**

> • **Customer:** Customer dashboard (bookings, vehicles, services, live updates)
> • **Quality Checker / Office Admin / Administrator on mobile:** Staff dashboard (assigned jobs, workflow, QC tasks)
> • **Sales staff** do not have a dedicated mobile sales dashboard; sales operations are performed on the web.

---

## Table 20 — Use Case: Voice Assistant (Web)

| Field | Value |
|-------|-------|
| Actor | Quality Checker |
| Description | Designed hands-free interface for job and inventory commands (speech recognition: future enhancement) |

---

## Table 38 — Use Case: Live Status Tracker (Mobile)

| Field | Correct text |
|-------|----------------|
| Description | To allow customers to monitor real-time progress of their vehicle detailing service, including job stage updates and notifications. |
| Successful completion | 1. Log in to mobile app → 2. Open Live Status Tracker → 3. System retrieves job stage → 4. Customer views updates and progress photos |
| Remove | All text about “preliminary check-up” or “free preliminary report” |

---

## Table of contents & figures — formatting

| Issue | Fix |
|-------|-----|
| TABLES OF CONTENTS | **TABLE OF CONTENTS** |
| Duplicate Figure 32 | Fig 32 = Appointment; **Fig 33** = Digital Waiver; **Fig 34** = Live Tracker; **Fig 35** = Chatbot |
| Figure 7 listed twice | Fig 6 = Sales FDD; **Fig 7** = Quality Checker FDD only |
| MobileLive Tracker | **Mobile Live Tracker** |

---

## Chapter 4 — §4.1 Integration and Testing (add paragraph)

> The team validated cloud AI damage detection on the mobile–backend path, AR visualization via WebAR and Three.js, and offline rule-based damage demonstration on the web estimator page for defense scenarios without API dependency.

---

## Codebase reference (for panel Q&A)

| Topic | Evidence |
|-------|----------|
| Roles | `backend/constants/roles.js` |
| Mobile routing (sales → customer) | `mobile/src/utils/routeResolver.ts` |
| Web AI demo (offline) | `frontend/src/pages/AIEstimatorPage.tsx` |
| Voice UI placeholder | `frontend/src/pages/DetailerDashboard.tsx` (`voice_assistant` tab) |
| Payment methods | `frontend/src/lib/salesData.ts` |
| Production brand | `README.md`, `frontend/index.html` |

---

## Pre-defense checklist

- [ ] AutoGloss vs AutoSPF+ explained in Ch. 1
- [ ] “Predictive” → operational analytics (unless ML is built)
- [ ] Voice = designed / partial
- [ ] POS delimitation matches GCash + card/Maya/bank/Stripe
- [ ] Mobile scope = customer + QC staff; sales/admin web-only
- [ ] Table 38 and Table 6 mobile dashboard fixed
- [ ] Figure numbers unique; ISO/IEC spelled correctly
- [ ] Table 20 actor = Quality Checker

---

*Generated from codebase audit — AutoSPF+ repository.*
