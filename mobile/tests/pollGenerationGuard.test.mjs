import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginPollGeneration,
  isCurrentPollGeneration,
  resetPollGenerations,
} from '../src/services/api/pollGenerationGuard.ts';

test.beforeEach(() => {
  resetPollGenerations();
});

// 7. polling does not create duplicate Meshy jobs / 8-9. only the latest
// poll loop for a taskId stays "current"; an older one is stale immediately.
test('a fresh taskId starts at generation 1 and is current', () => {
  const generation = beginPollGeneration('task-a');
  assert.equal(generation, 1);
  assert.equal(isCurrentPollGeneration('task-a', generation), true);
});

test('starting a second poll for the same taskId supersedes the first (stale-response protection)', () => {
  const first = beginPollGeneration('task-a');
  const second = beginPollGeneration('task-a');

  assert.equal(second, first + 1);
  // The older loop's captured generation is no longer current — its
  // in-flight response, if it ever resolves, must be treated as stale.
  assert.equal(isCurrentPollGeneration('task-a', first), false);
  assert.equal(isCurrentPollGeneration('task-a', second), true);
});

test('generations are tracked independently per taskId', () => {
  const genA = beginPollGeneration('task-a');
  const genB = beginPollGeneration('task-b');

  assert.equal(isCurrentPollGeneration('task-a', genA), true);
  assert.equal(isCurrentPollGeneration('task-b', genB), true);

  // Starting a new poll for task-b must not affect task-a's current loop.
  beginPollGeneration('task-b');
  assert.equal(isCurrentPollGeneration('task-a', genA), true);
  assert.equal(isCurrentPollGeneration('task-b', genB), false);
});

test('an unknown taskId/generation pair is never current', () => {
  assert.equal(isCurrentPollGeneration('never-started', 1), false);
});
