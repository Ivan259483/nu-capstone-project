import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildRepairSourceOptions,
  getRepairPreviewMountAction,
  pollRepairVisualizationTask,
  waitForPersistedRepairSource,
} from '../src/features/ai-scan/repairVisualization.ts';

const repairScreenSource = readFileSync(
  new URL('../src/app/(customer)/scan/repair-preview.tsx', import.meta.url),
  'utf8'
);
const resultsSource = readFileSync(
  new URL('../src/app/(customer)/scan/results.tsx', import.meta.url),
  'utf8'
);
const layoutSource = readFileSync(
  new URL('../src/app/(customer)/scan/_layout.tsx', import.meta.url),
  'utf8'
);
const aiServiceSource = readFileSync(
  new URL('../src/services/api/aiService.ts', import.meta.url),
  'utf8'
);
const storeSource = readFileSync(
  new URL('../src/features/ai-scan/scanStore.ts', import.meta.url),
  'utf8'
);
const clientSource = readFileSync(
  new URL('../src/services/api/client.ts', import.meta.url),
  'utf8'
);
const envSource = readFileSync(
  new URL('../src/config/env.ts', import.meta.url),
  'utf8'
);

const scan = {
  imageUrls: [
    'https://cdn.example/front.jpg',
    'https://cdn.example/rear.jpg',
    'https://cdn.example/right.jpg',
  ],
  angles: ['front', 'rear', 'right'],
  views: [
    { viewId: 'front', label: 'Front', index: 0, success: true },
    { viewId: 'rear', label: 'Rear', index: 1, success: true },
    { viewId: 'right', label: 'Right', index: 2, success: true },
  ],
  damages: [
    { id: 'front-scratch', imageIndex: 0, severity: 'low', confidence: 0.95, affectedAreaPercent: 8 },
    { id: 'right-dent', imageIndex: 2, severity: 'high', confidence: 0.82, affectedAreaPercent: 4 },
  ],
};

const progress = (overrides = {}) => ({
  status: 'processing',
  taskId: 'task-one',
  beforeImageUrl: 'https://cdn.example/right.jpg',
  afterImageUrl: null,
  sourceView: 'right',
  sourceImageIndex: 2,
  sourceDamageId: 'right-dent',
  aiModel: 'nano-banana',
  configuredCreditsPerImage: 3,
  consumedCredits: 3,
  progress: 20,
  precedingTasks: null,
  message: '',
  ...overrides,
});

test('highest-ranked credible damage view is the automatic default', () => {
  const options = buildRepairSourceOptions(scan);
  assert.equal(options[0].viewId, 'right');
  assert.equal(options[0].sourceDamageId, 'right-dent');
});

test('all available views remain selectable and selecting another does not create extra sources', () => {
  const options = buildRepairSourceOptions(scan);
  assert.deepEqual(options.map((option) => option.label).sort(), ['Front', 'Rear', 'Right']);
  const rear = options.find((option) => option.viewId === 'rear');
  assert.equal(rear.imageIndex, 1);
  assert.equal(rear.previewUri, 'https://cdn.example/rear.jpg');
  assert.equal(rear.isPersisted, true);
});

test('fresh scan can use local captures for selection while stable image archival finishes', () => {
  const options = buildRepairSourceOptions(
    { ...scan, imageUrls: [] },
    ['file:///front.jpg', 'file:///rear.jpg', 'file:///right.jpg']
  );
  assert.equal(options.length, 3);
  assert.equal(options[0].viewId, 'right');
  assert.equal(options[0].previewUri, 'file:///right.jpg');
  assert.equal(options[0].isPersisted, false);
});

test('repair preview mount starts for the routed completed scan when no active task exists', () => {
  assert.equal(getRepairPreviewMountAction({
    requestedScanId: 'scan-current',
    loadedScanId: 'scan-current',
    repairStateScanId: 'scan-current',
    status: 'idle',
    hasPersistedSource: true,
  }), 'start');
  assert.match(resultsSource, /params: \{ scanId: scan\.scanId \}/);
  assert.match(repairScreenSource, /action === 'resolve_source' \|\| action === 'start'/);
  assert.match(repairScreenSource, /void startGeneration\(\)/);
});

test('missing scan ID is explicit and never becomes the generic Not found message', () => {
  assert.equal(getRepairPreviewMountAction({
    requestedScanId: null,
    loadedScanId: null,
    repairStateScanId: null,
    status: 'idle',
    hasPersistedSource: false,
  }), 'missing_scan');
  assert.match(repairScreenSource, /No completed scan ID is available/);
  assert.doesNotMatch(repairScreenSource, />Not found</);
});

test('a new scan discards stale unavailable state while the same active task resumes', () => {
  assert.equal(getRepairPreviewMountAction({
    requestedScanId: 'scan-new',
    loadedScanId: 'scan-new',
    repairStateScanId: 'scan-old',
    status: 'unavailable',
    hasPersistedSource: true,
  }), 'start');
  assert.equal(getRepairPreviewMountAction({
    requestedScanId: 'scan-current',
    loadedScanId: 'scan-current',
    repairStateScanId: 'scan-current',
    status: 'queued',
    hasPersistedSource: true,
  }), 'resume');
  assert.equal(getRepairPreviewMountAction({
    requestedScanId: 'scan-current',
    loadedScanId: 'scan-current',
    repairStateScanId: 'scan-current',
    status: 'processing',
    hasPersistedSource: false,
  }), 'resume');
  assert.match(storeSource, /prepareRepairVisualizationForScan/);
  assert.match(storeSource, /repairVisualizationScanId/);
});

test('repair requests use the shared authenticated client and append api exactly once', () => {
  assert.match(aiServiceSource, /import \{ apiClient, getApiErrorMessage \} from '\.\/client'/);
  assert.match(aiServiceSource, /REPAIR_VISUALIZATION_REQUEST_PATH = '\/ai\/repair-visualization'/);
  assert.doesNotMatch(aiServiceSource, /REPAIR_VISUALIZATION_REQUEST_PATH = '\/api\/ai\//);
  assert.match(clientSource, /baseURL: API_BASE_URL/);
  assert.match(clientSource, /Authorization = `Bearer \$\{token\}`/);
  assert.match(envSource, /sanitizedApiUrl\.endsWith\('\/api'\)/);
  assert.match(envSource, /: `\$\{sanitizedApiUrl\}\/api`/);
  assert.match(aiServiceSource, /_skipOfflineQueue: true/);
});

test('selected guided view must resolve to a persisted scan-owned URL before POST', () => {
  const options = buildRepairSourceOptions(scan);
  const rear = options.find((option) => option.viewId === 'rear');
  assert.equal(rear.previewUri, scan.imageUrls[1]);
  assert.equal(rear.isPersisted, true);
  assert.match(repairScreenSource, /if \(!source\.isPersisted\)/);
});

test('source archival wait keeps the selected index and then returns its HTTPS image', async () => {
  let reads = 0;
  const resolved = await waitForPersistedRepairSource({
    scanId: 'scan-current',
    imageIndex: 1,
    attempts: 3,
    intervalMs: 1,
    wait: async () => {},
    fetchScan: async () => {
      reads += 1;
      return reads < 2 ? { ...scan, imageUrls: [] } : scan;
    },
  });
  assert.equal(reads, 2);
  assert.equal(resolved.source.imageIndex, 1);
  assert.equal(resolved.source.previewUri, scan.imageUrls[1]);
  await assert.rejects(
    waitForPersistedRepairSource({
      scanId: 'scan-pending',
      imageIndex: 1,
      attempts: 1,
      fetchScan: async () => ({ ...scan, imageUrls: [] }),
    }),
    /Selected view image is not available yet\. Please choose another view\./
  );
});

test('only the five approved guided inspection views can become repair sources', () => {
  const options = buildRepairSourceOptions({
    imageUrls: ['https://cdn.example/front.jpg', 'https://cdn.example/driver-side.jpg'],
    angles: ['front', 'driver_side'],
    damages: [],
    views: [],
  });
  assert.deepEqual(options.map((option) => option.viewId), ['front']);
});

test('queued and long-running states are non-terminal and preserve the same task ID', async () => {
  let clock = 0;
  const result = await pollRepairVisualizationTask(
    'scan-one',
    async () => progress({ status: 'queued', progress: 0 }),
    {
      intervalMs: 5,
      timeoutMs: 10,
      now: () => clock,
      wait: async (ms) => { clock += ms; },
    }
  );
  assert.equal(result.status, 'still_processing');
  assert.equal(result.taskId, 'task-one');
});

test('temporary network failure resumes the same task and can become ready', async () => {
  let attempts = 0;
  let clock = 0;
  const result = await pollRepairVisualizationTask(
    'scan-network',
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return progress({
        status: 'ready',
        progress: 100,
        afterImageUrl: 'https://cdn.example/after.jpg',
      });
    },
    {
      intervalMs: 5,
      timeoutMs: 20,
      now: () => clock,
      wait: async (ms) => { clock += ms; },
    }
  );
  assert.equal(result.status, 'ready');
  assert.equal(result.taskId, 'task-one');
  assert.equal(result.afterImageUrl, 'https://cdn.example/after.jpg');
});

test('only an actual backend Meshy failure becomes terminal', async () => {
  const result = await pollRepairVisualizationTask(
    'scan-failed',
    async () => progress({ status: 'failed', message: 'Meshy FAILED' }),
    { timeoutMs: 10 }
  );
  assert.equal(result.status, 'failed');
});

test('mobile route renders distinct Before/AI After, always-visible disclaimer, retry, and skip actions', () => {
  assert.match(layoutSource, /name="repair-preview"/);
  assert.match(resultsSource, />AI Repair Preview</);
  assert.match(resultsSource, /Compare the detected damage with an AI-generated repaired visualization\./);
  assert.match(resultsSource, /View Repair Preview/);
  assert.match(repairScreenSource, /BEFORE/);
  assert.match(repairScreenSource, /AI-GENERATED AFTER/);
  assert.match(repairScreenSource, /AI-Generated Repair Visualization/);
  assert.match(repairScreenSource, /not an actual restoration\. Actual repair results may vary\./);
  assert.match(repairScreenSource, /Retry Visualization/);
  assert.match(repairScreenSource, /secondaryLabel="Skip to Cost Estimate"/);
  assert.match(repairScreenSource, /status: 'idle'/);
  assert.match(repairScreenSource, /Repair preview is not ready yet\./);
});

test('remount resumes polling, duplicate taps join one start, and store preserves the task lifecycle', () => {
  assert.match(repairScreenSource, /action === 'resume'/);
  assert.match(repairScreenSource, /status: current\.repairVisualizationStatus/);
  assert.match(repairScreenSource, /void pollExisting/);
  assert.match(aiServiceSource, /const inFlightRepairStarts = new Map/);
  assert.match(aiServiceSource, /if \(existing\) return existing/);
  assert.match(storeSource, /repairVisualizationTaskId: progress\.taskId/);
  assert.match(aiServiceSource, /REPAIR_VISUALIZATION_ENDPOINT_NOT_FOUND/);
  assert.match(aiServiceSource, /Verify the physical device API base URL/);
});
