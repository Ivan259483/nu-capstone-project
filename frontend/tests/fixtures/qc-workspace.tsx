/** Development-only visual harness. Not imported by the app or its production entry point. */
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import api from "../../src/lib/api";
import "../../src/index.css";
import "../../src/pages/DetailerDashboard.css";
import "../../src/components/technician/qc/QCWorkspace.css";
import QCDashboardView from "../../src/components/technician/qc/QCDashboardView";
import QCJobsTable from "../../src/components/technician/qc/QCJobsTable";
import QCSidebar from "../../src/components/technician/qc/QCSidebar";
import { DEFAULT_QC_QUERY } from "../../src/lib/qc-workspace";
import { buildQCWorkspace } from "../../../backend/utils/qcWorkspace.utils.js";
const fixedNow = Date.now();
const fixture = (i: number, populated: boolean) => ({
  id: `fixture-${i}`,
  jobId: `TEST-ORDER-${i}`,
  customer: "Test Customer",
  vehicle: "2024 Test Sedan",
  vehicleYear: "2024",
  vehicleMake: "Test",
  vehicleModel: "Sedan",
  plate: `TEST${i}`,
  service: "Test service package",
  technician: "Test Technician",
  status: "pending-review",
  orderStatus: "in_progress",
  serviceTrackingStage: populated ? "ready_pickup" : "confirmed",
  elapsedMinutes: 6480,
  submittedAt: new Date(fixedNow - 6480 * 60000).toISOString(),
  updatedAt: new Date(fixedNow).toISOString(),
  aiFlag: false,
  trackerStageMedia: populated
    ? [
        ...["received", "in_progress", "ready_pickup"].flatMap((stage) =>
          [
            "front",
            "rear",
            "left",
            "right",
            "close_up",
            ...(stage === "received" ? ["preassessment_form"] : []),
          ].map((slot) => ({
            stage,
            slot,
            hasPhoto: true,
            photoUrl: "/images/login/porsche.png",
          })),
        ),
        {
          stage: "quality_check",
          slot: "qc_form",
          hasPhoto: true,
          photoUrl: "/images/login/correction.png",
        },
      ]
    : [],
  qcChecklist: populated
    ? [
        { item: "Saved inspection item", passed: true },
        {
          item: "Another saved inspection item",
          passed: false,
          note: "Test note",
        },
      ]
    : [],
  qcHandoffSheet: populated
    ? {
        clientName: "Test Customer",
        serviceDate: "09-05-26",
        makeModel: "Test Sedan",
      }
    : {},
  staffNotes: populated
    ? [
        {
          content: "Test fixture technician note",
          detailerName: "Test Technician",
          createdAt: new Date(fixedNow).toISOString(),
        },
      ]
    : [],
});
let collection: any[] = [];
let detailFailure = false;
let delayDetail = false;
api.defaults.adapter = async (config) => {
  if (detailFailure)
    throw Object.assign(new Error("Simulated detail read failure"), { config });
  const params = config.params || {};
  const data = String(config.url).startsWith("/bookings/")
    ? {
        success: true,
        data: collection.find(
          (j) => j.id === String(config.url).split("/").pop(),
        ),
      }
    : buildQCWorkspace(
        params.orderId
          ? collection.filter((j) => j.id === params.orderId)
          : collection,
        params,
        Date.now(),
      );
  if (delayDetail) await new Promise((resolve) => setTimeout(resolve, 1500));
  return { data, status: 200, statusText: "OK", headers: {}, config };
};
function Harness() {
  const [view, setView] = useState<any>("dashboard");
  const [count, setCount] = useState(1);
  const [offset, setOffset] = useState(0);
  const [populated, setPopulated] = useState(false);
  const [connected, setConnected] = useState(true);
  const [failure, setFailure] = useState(false);
  const [query, setQuery] = useState(DEFAULT_QC_QUERY);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [range, setRange] = useState<any>(7);
  const [scope, setScope] = useState<any>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  collection = Array.from({ length: count }, (_, i) =>
    fixture(i + offset, populated),
  );
  const data = buildQCWorkspace(
    collection,
    view === "dashboard"
      ? { filter: stage ? "active" : "attention", stage, rangeDays: range }
      : {
          ...query,
          search,
          rangeDays: range,
          aiFlagged: String(query.aiFlagged),
        },
    fixedNow + revision,
  );
  const filter = (filter: any, stage = "") => {
    setQuery({ ...DEFAULT_QC_QUERY, filter, stage });
    setSelected(null);
    setView("jobs");
  };
  const action = async () => {
    setNotice("TEST ONLY: decision callback invoked");
    return true;
  };
  return (
    <div
      className="detailer-shell"
      style={{
        fontFamily: "Inter, sans-serif",
        color: "#203346",
        background: "#f4f6f8",
        minHeight: "100vh",
      }}
    >
      <div
        className="qcw"
        style={{
          padding: 8,
          background: "#fcf1ce",
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <strong>ISOLATED TEST FIXTURES — no production API requests</strong>
        {[0, 1, 27].map((n) => (
          <button
            className="qcw-button"
            key={n}
            onClick={() => {
              setCount(n);
              setOffset(0);
              setSelected(null);
              setRevision((v) => v + 1);
            }}
          >
            {n} jobs
          </button>
        ))}
        <button
          className="qcw-button"
          onClick={() => {
            setPopulated((v) => !v);
            setRevision((v) => v + 1);
          }}
        >
          Toggle evidence
        </button>
        <button className="qcw-button" onClick={() => setConnected((v) => !v)}>
          Toggle connection
        </button>
        <button className="qcw-button" onClick={() => setFailure((v) => !v)}>
          Toggle read error
        </button>
        <button
          className="qcw-button"
          onClick={() => {
            detailFailure = !detailFailure;
            setRevision((v) => v + 1);
          }}
        >
          Toggle detail failure
        </button>
        <button
          className="qcw-button"
          onClick={() => {
            delayDetail = !delayDetail;
            setNotice(
              delayDetail
                ? "Detail requests delayed 1.5 seconds"
                : "Detail delay off",
            );
          }}
        >
          Toggle detail delay
        </button>
        <button
          className="qcw-button"
          onClick={() => {
            collection = collection.slice(1);
            setOffset((v) => v + 1);
            setCount((v) => Math.max(0, v - 1));
            setRevision((v) => v + 1);
          }}
        >
          Remove a job
        </button>
        {notice && <span role="status">{notice}</span>}
      </div>
      <div
        className="qc-dashboard-root"
        style={{
          display: "flex",
          height: "calc(100dvh - 100px)",
          minHeight: 500,
        }}
      >
        <QCSidebar
          collapsed={false}
          onToggle={() => {}}
          activeView={view}
          onNavigate={setView}
          connected={connected}
          hasData
          pendingCount={count}
        />
        <main style={{ overflowY: "auto", padding: 20, flex: 1, minWidth: 0 }}>
          {view === "dashboard" ? (
            <QCDashboardView
              data={data as any}
              loading={false}
              error={failure ? "Test read failure" : null}
              connected={connected}
              onRetry={() => setFailure(false)}
              onSelectJob={(job) => {
                setSelected(job.id);
                setView("jobs");
              }}
              onFilter={filter}
              selectedStage={stage}
              onStageChange={setStage}
              activity={[]}
              activityLoading={false}
              selectedRangeDays={range}
              selectedScope={scope}
              onRangeChange={setRange}
              onScopeChange={setScope}
            />
          ) : (
            <QCJobsTable
              data={data as any}
              loading={false}
              settled={!failure}
              error={failure ? "Test read failure" : null}
              connected={connected}
              query={query}
              onQueryChange={setQuery}
              selectedJobId={selected}
              onSelectJob={setSelected}
              searchQuery={search}
              onSearchQueryChange={setSearch}
              onRetry={() => setFailure(false)}
              onApprove={action}
              onReturn={action}
              onOpenLiveTracker={() =>
                setNotice("TEST ONLY: Live Tracker navigation callback invoked")
              }
              scope={scope}
            />
          )}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(<Harness />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
