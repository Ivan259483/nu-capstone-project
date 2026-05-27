import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectVehicleProfileFromMessage,
  detectVehicleTypeFromMessage,
  isAutoSpfScopeMessage,
} from '../services/chatbotKnowledge.service.js';

test('detects remembered vehicle profile from natural customer phrasing', () => {
  const profile = detectVehicleProfileFromMessage('My car is Civic');
  assert.equal(profile.label, 'Honda Civic');
  assert.equal(profile.vehicleType, 'sedan');
});

test('detects common SUV and pickup model memory', () => {
  assert.equal(detectVehicleProfileFromMessage('black fortuner').vehicleType, 'suv');
  assert.equal(detectVehicleProfileFromMessage('Ford Ranger unit ko').vehicleType, 'pickup');
});

test('detects generic vehicle type and business shorthand as in scope', () => {
  assert.equal(detectVehicleTypeFromMessage('SUV').apiKey, 'suv');
  assert.equal(isAutoSpfScopeMessage('hm coating?'), true);
  assert.equal(isAutoSpfScopeMessage('loc nyo?'), true);
});

test('keeps unrelated sports questions out of AutoSPF+ scope', () => {
  assert.equal(isAutoSpfScopeMessage('Who won NBA?'), false);
});
