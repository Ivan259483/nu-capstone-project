const normalizeSourceView = (value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const REPAIR_SOURCE_VIEWS = new Set(['front', 'rear', 'left', 'right', 'close_up']);

export const resolveRepairVisualizationSource = (scan, input = {}) => {
  const imageUrls = Array.isArray(scan?.imageUrls) ? scan.imageUrls : [];
  const requestedIndex = Number(input.selectedImageIndex);
  if (!Number.isInteger(requestedIndex) || requestedIndex < 0 || requestedIndex >= imageUrls.length) {
    const error = new Error('selectedImageIndex must identify one stored inspection image.');
    error.code = 'REPAIR_SOURCE_INVALID';
    throw error;
  }

  const beforeImageUrl = String(imageUrls[requestedIndex] || '').trim();
  if (!/^https:\/\//i.test(beforeImageUrl)) {
    const error = new Error('The selected inspection image is not available from stable storage.');
    error.code = 'REPAIR_SOURCE_UNAVAILABLE';
    throw error;
  }

  const requestedView = normalizeSourceView(input.sourceView);
  const view = (Array.isArray(scan?.views) ? scan.views : []).find(
    (candidate) => Number(candidate?.index) === requestedIndex
  );
  const storedAngle = String(scan?.angles?.[requestedIndex] || '').trim();
  const canonicalView = String(view?.viewId || storedAngle || `view_${requestedIndex + 1}`).trim();
  const normalizedCanonicalView = normalizeSourceView(canonicalView);
  if (!REPAIR_SOURCE_VIEWS.has(normalizedCanonicalView)) {
    const error = new Error('The selected image is not one of the supported inspection views.');
    error.code = 'REPAIR_SOURCE_VIEW_UNSUPPORTED';
    throw error;
  }
  const knownViewAliases = [view?.viewId, view?.label, storedAngle]
    .map(normalizeSourceView)
    .filter(Boolean);

  if (requestedView && knownViewAliases.length > 0 && !knownViewAliases.includes(requestedView)) {
    const error = new Error('sourceView does not match the selected inspection image.');
    error.code = 'REPAIR_SOURCE_VIEW_MISMATCH';
    throw error;
  }

  const requestedDamageId = String(input.sourceDamageId || '').trim();
  const damage = requestedDamageId
    ? (Array.isArray(scan?.damages) ? scan.damages : []).find(
      (candidate) => String(candidate?.id || '') === requestedDamageId
    )
    : null;
  if (requestedDamageId && (!damage || Number(damage.imageIndex || 0) !== requestedIndex)) {
    const error = new Error('sourceDamageId does not belong to the selected inspection image.');
    error.code = 'REPAIR_SOURCE_DAMAGE_MISMATCH';
    throw error;
  }

  return {
    beforeImageUrl,
    sourceView: normalizedCanonicalView,
    sourceImageIndex: requestedIndex,
    sourceDamageId: requestedDamageId,
  };
};
