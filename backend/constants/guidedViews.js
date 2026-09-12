/**
 * Guided vehicle inspection views.
 *
 * These identifiers are NOT a new vocabulary. They are the angles the mobile
 * guided capture screen has always used and the values already stored per
 * damage as `angleHint` on AIScan. `viewId === angle`; keeping them identical
 * means the multi-view inspection reuses the existing persisted semantics
 * instead of introducing a parallel naming scheme.
 *
 * A guided view is a camera position, not a vehicle component. A Front image
 * does not mean the damage is on the front bumper — component resolution stays
 * `Unknown Vehicle Panel` because no trustworthy vehicle-part model exists.
 */

export const GUIDED_VIEWS = Object.freeze([
  Object.freeze({ id: 'front', label: 'Front' }),
  Object.freeze({ id: 'rear', label: 'Rear' }),
  Object.freeze({ id: 'left', label: 'Left' }),
  Object.freeze({ id: 'right', label: 'Right' }),
  Object.freeze({ id: 'close_up', label: 'Close-up' }),
]);

export const GUIDED_VIEW_IDS = Object.freeze(GUIDED_VIEWS.map((view) => view.id));

export const MAX_GUIDED_VIEWS = GUIDED_VIEWS.length;

const GUIDED_VIEW_LABELS = Object.freeze(
  Object.fromEntries(GUIDED_VIEWS.map((view) => [view.id, view.label]))
);

export const isGuidedViewId = (value) =>
  Object.prototype.hasOwnProperty.call(GUIDED_VIEW_LABELS, String(value));

export const getGuidedViewLabel = (viewId) =>
  GUIDED_VIEW_LABELS[String(viewId)] || String(viewId || 'View');

export default { GUIDED_VIEWS, GUIDED_VIEW_IDS, MAX_GUIDED_VIEWS, isGuidedViewId, getGuidedViewLabel };
