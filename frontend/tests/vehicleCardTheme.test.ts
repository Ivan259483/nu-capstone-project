import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getVehicleAccentTheme,
  getVehicleCardTheme,
  NEUTRAL_VEHICLE_CARD_THEME,
  VEHICLE_CARD_THEMES,
} from '../src/lib/vehicle-card-theme.ts';

test('vehicle card theme normalizes saved color casing and whitespace', () => {
  assert.equal(getVehicleCardTheme(' BLUE '), VEHICLE_CARD_THEMES.blue);
  assert.equal(getVehicleCardTheme('green'), VEHICLE_CARD_THEMES.green);
  assert.equal(getVehicleCardTheme('Grey'), VEHICLE_CARD_THEMES.gray);
});

test('vehicle card theme recognizes common factory color names', () => {
  assert.equal(getVehicleCardTheme('Pearl White'), VEHICLE_CARD_THEMES.white);
  assert.equal(getVehicleCardTheme('British Racing Green Metallic'), VEHICLE_CARD_THEMES.green);
  assert.equal(getVehicleCardTheme('Burgundy Pearl'), VEHICLE_CARD_THEMES.red);
});

test('server-normalized standard color takes precedence', () => {
  assert.equal(getVehicleCardTheme('Factory Paint Name', 'Orange'), VEHICLE_CARD_THEMES.orange);
});

test('missing and unknown colors retain the neutral Garage card theme', () => {
  assert.equal(getVehicleCardTheme(), NEUTRAL_VEHICLE_CARD_THEME);
  assert.equal(getVehicleCardTheme('Not specified'), NEUTRAL_VEHICLE_CARD_THEME);
  assert.equal(getVehicleCardTheme('Unmapped Custom Shade'), NEUTRAL_VEHICLE_CARD_THEME);
  assert.equal(NEUTRAL_VEHICLE_CARD_THEME.headerFromStrength, 25);
  assert.equal(NEUTRAL_VEHICLE_CARD_THEME.headerToStrength, 28);
  assert.equal(NEUTRAL_VEHICLE_CARD_THEME.badgeTintStrength, 0);
});

test('recognized colors use a visibly stronger Garage surface treatment', () => {
  for (const color of ['blue', 'green', 'red', 'yellow', 'orange'] as const) {
    const theme = getVehicleCardTheme(color);
    assert.equal(theme.headerFromStrength, 38, color);
    assert.equal(theme.headerToStrength, 40, color);
    assert.ok(theme.glowLayerOpacity >= 0.9, color);
    assert.ok(theme.badgeTintStrength >= 18, color);
  }

  assert.ok(VEHICLE_CARD_THEMES.black.headerFromStrength > 60);
  assert.ok(VEHICLE_CARD_THEMES.gray.headerFromStrength > 40);
});

test('non-Garage vehicle accents retain their existing exact-match fallback', () => {
  assert.equal(getVehicleAccentTheme('Unmapped Custom Shade'), VEHICLE_CARD_THEMES.custom);
});
