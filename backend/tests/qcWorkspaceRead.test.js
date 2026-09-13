import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
process.env.ENCRYPTION_KEY ||= "12345678901234567890123456789012";
const { default: Order } = await import("../models/order.model.js");
const { getQCJobs, getQCActivity, approveJob, returnJob } = await import(
  "../controllers/qc.controller.js"
);
const { default: qcRoutes } = await import("../routes/qc.routes.js");
const { clearResponseCache } = await import("../utils/responseCache.utils.js");
const qcId = "000000000000000000000001";
let seenFilter;
function seedRead() {
  const orders = Array.from({ length: 45 }, (_, i) => ({
    _id: String(i + 1).padStart(24, "0"),
    orderNumber: `TEST-${i}`,
    customerName: `Customer ${i}`,
    status: "confirmed",
    archived: false,
    assignedDetailer: i % 2 ? qcId : "000000000000000000000002",
    vehiclePlate: `TEST${i}`,
    createdAt: i === 43 ? null : "2026-09-05T00:00:00Z",
    updatedAt: i === 43 ? null : "2026-09-05T01:00:00Z",
    trackerStageMedia: [
      {
        stage: "received",
        slot: "front",
        photoUrl: i === 44 ? "https://example.test/front.jpg" : "",
      },
    ],
  }));
  mock.method(Order, "find", (filter) => {
    seenFilter = filter;
    let skip = 0,
      limit = Infinity;
    const query = {
      select() {
        return this;
      },
      sort() {
        return this;
      },
      maxTimeMS() {
        return this;
      },
      lean() {
        return this;
      },
      skip(n) {
        skip = n;
        return this;
      },
      limit(n) {
        limit = n;
        return this;
      },
      then(resolve, reject) {
        return Promise.resolve(
          orders
            .filter(
              (o) =>
                (!filter.assignedDetailer ||
                  String(o.assignedDetailer) ===
                    String(filter.assignedDetailer)) &&
                (!filter._id || o._id === String(filter._id)),
            )
            .slice(skip, skip + limit),
        ).then(resolve, reject);
      },
    };
    return query;
  });
}
async function read(
  query = {},
  user = { id: qcId, role: "staff_quality_checker" },
) {
  let value,
    status = 200;
  const res = {
    status(s) {
      status = s;
      return this;
    },
    json(data) {
      value = data;
      return this;
    },
  };
  await getQCJobs({ query, user }, res, (error) => {
    throw error;
  });
  return { data: value, status };
}
afterEach(() => {
  mock.restoreAll();
  clearResponseCache();
});
test("workspace activity applies My Jobs scope and never invents outcomes from order state", async () => {
  seedRead();
  let response;
  await getQCActivity(
    { query: { workspace: "true", scope: "mine" }, user: { id: qcId } },
    {
      json(data) {
        response = data;
      },
    },
    (error) => {
      throw error;
    },
  );
  assert.equal(String(seenFilter.assignedDetailer), qcId);
  assert.deepEqual(response.data, []);
});
test("workspace read returns exact scoped counts and server-side searches beyond page one", async () => {
  seedRead();
  const all = await read({ workspace: "true", search: "TEST-44" });
  assert.equal(all.data.summary.total, 45);
  assert.equal(all.data.total, 1);
  assert.equal(all.data.jobs[0].jobId, "TEST-44");
  assert.equal(all.data.jobs[0].trackerStageMedia[0].hasPhoto, true);
  assert.equal("photoUrl" in all.data.jobs[0].trackerStageMedia[0], false);
  assert.equal(seenFilter.archived, false);
  assert.ok(seenFilter.status.$in.includes("confirmed"));
});
test("My Jobs uses existing assignedDetailer scope before summaries and pagination", async () => {
  seedRead();
  const mine = await read({ workspace: "true", scope: "mine" });
  assert.equal(mine.data.summary.total, 22);
  assert.equal(String(seenFilter.assignedDetailer), qcId);
  assert.equal(mine.data.jobs.length, 20);
  const all = await read({ workspace: "true", scope: "all" });
  assert.equal(all.data.summary.total, 45);
});
test("missing waiting-time origin remains unavailable instead of breaking the read or inventing a timestamp", async () => {
  seedRead();
  const result = await read({ workspace: "true", search: "TEST-43" });
  assert.equal(result.data.jobs[0].waitingTimeAvailable, false);
  assert.equal(result.data.jobs[0].submittedAt, "");
  assert.equal(result.data.jobs[0].operational.overdue, false);
});
test("default read preserves legacy bounded response and marks empty media honestly", async () => {
  seedRead();
  const result = await read();
  assert.equal(result.data.jobs.length, 20);
  assert.equal(result.data.summary, undefined);
  assert.equal(result.data.jobs[0].trackerStageMedia[0].hasPhoto, false);
});
test("deep-link read supports scoped order lookup; invalid identifiers remain rejected", async () => {
  seedRead();
  const result = await read({
    workspace: "true",
    orderId: "000000000000000000000045",
    filter: "all",
  });
  assert.equal(result.data.jobs.length, 1);
  assert.equal(
    (await read({ workspace: "true", orderId: "bad-id" })).status,
    400,
  );
});
test("the existing QC read route continues enforcing role restrictions", () => {
  const route = qcRoutes.stack.find((layer) => layer.route?.path === "/jobs");
  const authorize = route.route.stack[0].handle;
  for (const role of [
    "staff_quality_checker",
    "administrator",
    "office_admin",
    "customer",
    "staff_sales",
  ]) {
    let passed = false,
      status = 0;
    authorize(
      { user: { role } },
      {
        status(n) {
          status = n;
          return this;
        },
        json() {
          return this;
        },
      },
      () => {
        passed = true;
      },
    );
    assert.equal(
      passed,
      ["staff_quality_checker", "administrator", "office_admin"].includes(role),
    );
    if (!passed) assert.equal(status, 403);
  }
  let status = 0;
  authorize(
    {},
    {
      status(n) {
        status = n;
        return this;
      },
      json() {
        return this;
      },
    },
    () => assert.fail("must reject unauthenticated"),
  );
  assert.equal(status, 401);
});

test("existing approval mutations reject payment, stage, and missing-evidence blockers without saving", async () => {
  for (const [status, media, expected] of [
    ["ready_for_payment", [], /POS/],
    ["confirmed", [], /Cannot approve/],
    ["in_progress", [], /QC form photo/],
    [
      "in_progress",
      [{ stage: "quality_check", photoUrl: "https://example.test/qc.jpg" }],
      /final output photos/,
    ],
  ]) {
    const order = {
      status,
      trackerStageMedia: media,
      save() {
        assert.fail("blocked approval must not save");
      },
    };
    const find = mock.method(Order, "findById", () => ({
      populate() {
        return this;
      },
      then(resolve) {
        return Promise.resolve(order).then(resolve);
      },
    }));
    let code = 0,
      payload;
    await approveJob(
      {
        params: { id: qcId },
        user: { id: qcId, role: "staff_quality_checker" },
      },
      {
        status(value) {
          code = value;
          return this;
        },
        json(value) {
          payload = value;
          return this;
        },
      },
      (error) => {
        throw error;
      },
    );
    assert.equal(code, 400);
    assert.match(payload.message, expected);
    find.mock.restore();
  }
});
test("existing return mutation requires a reason before any database write", async () => {
  mock.method(Order, "findById", () =>
    assert.fail("must validate reason first"),
  );
  let code = 0;
  await returnJob(
    { params: { id: qcId }, body: {} },
    {
      status(value) {
        code = value;
        return this;
      },
      json() {
        return this;
      },
    },
    (error) => {
      throw error;
    },
  );
  assert.equal(code, 400);
});
