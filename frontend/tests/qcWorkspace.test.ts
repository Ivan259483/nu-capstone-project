import assert from "node:assert/strict";
import { test } from "node:test";
import {
  qcPrimaryState,
  qcDuration,
  qcVehicle,
  reconcileQCSelection,
} from "../src/lib/qc-workspace.ts";
import type { QCJob } from "../src/hooks/useQCData.ts";
const job = {
  id: "test-1",
  customer: "Test Customer",
  vehicle: "Vehicle fallback",
  vehicleYear: "2026",
  vehicleMake: "Test",
  vehicleModel: "Vehicle",
  status: "pending-review",
  aiFlag: false,
} as QCJob;
test("selection is retained across updates and cleared after removal, never reassigned", () => {
  assert.equal(
    reconcileQCSelection("test-1", [{ ...job, plate: "UPDATED" }]),
    "test-1",
  );
  assert.equal(reconcileQCSelection("removed", [job]), null);
  assert.equal(reconcileQCSelection(null, [job]), null);
});
test("job identity leads with real vehicle values and duration is bounded", () => {
  assert.equal(qcVehicle(job), "2026 Test Vehicle");
  assert.equal(qcDuration(-10), "0m");
  assert.equal(qcDuration(301), "5h 1m");
});
test("missing AI data is never presented as a clear scan", () => {
  assert.equal(qcPrimaryState(job).label, "In progress");
  assert.equal(qcPrimaryState({ ...job, aiFlag: true }).label, "AI flagged");
});
test("critical and recorded human states outrank lower priority badges", () => {
  const op = {
    terminal: false,
    issues: true,
    overdue: true,
    needsEvidence: true,
  } as QCJob["operational"];
  assert.equal(
    qcPrimaryState({ ...job, operational: op }).label,
    "Rework required",
  );
  assert.equal(
    qcPrimaryState({ ...job, operational: { ...op, issues: false } }).label,
    "Overdue",
  );
  assert.equal(
    qcPrimaryState({ ...job, operational: { ...op, terminal: true } }).label,
    "Completed",
  );
});
