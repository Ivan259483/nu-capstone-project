export type SystemManagementRole =
  | 'administrator'
  | 'office_admin'
  | 'sales'
  | 'staff_quality_checker'
  | 'customer'
  | string
  | null
  | undefined;

export function canOpenSystemManagement(role: SystemManagementRole): boolean {
  return role === 'administrator' || role === 'office_admin';
}

const HANDOVER_INVITATION_NAME_RE = /^[a-zA-ZÀ-ÿ\s.\-']+$/;
const HANDOVER_INVITATION_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getHandoverInvitationError(name: string, email: string): string | null {
  const normalizedName = String(name || '').trim().replace(/\s+/g, ' ');
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (
    normalizedName.length < 2
    || normalizedName.length > 80
    || !HANDOVER_INVITATION_NAME_RE.test(normalizedName)
  ) {
    return 'Enter a valid name between 2 and 80 characters.';
  }
  if (
    !normalizedEmail
    || normalizedEmail.length > 254
    || !HANDOVER_INVITATION_EMAIL_RE.test(normalizedEmail)
  ) {
    return 'Enter a valid email address.';
  }
  return null;
}

export const LIFECYCLE_CONFIRMATION_PHRASES = {
  enter_production: 'ENTER PRODUCTION',
  leave_production: 'LEAVE PRODUCTION',
  begin_decommissioning: 'BEGIN DECOMMISSIONING',
  archive: 'ARCHIVE AUTOSPF',
  restore: 'RESTORE AUTOSPF',
} as const;

export const DEMO_RESET_CONFIRMATION_PHRASE = 'RESET DEMO ENVIRONMENT';

export interface BaselineProduct {
  id?: string;
  _id?: string;
  sku?: string;
  name?: string;
  isActive?: boolean;
  reserved?: number;
}

export interface OpeningInventoryRow {
  productId: string;
  quantity: number;
}

export interface InventoryCsvResult {
  rows: OpeningInventoryRow[];
  errors: string[];
}

function csvCells(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

export function parseOpeningInventoryCsv(
  content: string,
  products: BaselineProduct[],
): InventoryCsvResult {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], errors: ['CSV must include a header and at least one product row.'] };

  const headers = csvCells(lines[0]).map((header) => header.toLowerCase().replace(/[ _-]/g, ''));
  const productIndex = headers.findIndex((header) => ['productid', 'id'].includes(header));
  const skuIndex = headers.indexOf('sku');
  const quantityIndex = headers.findIndex((header) => ['quantity', 'openingquantity', 'stock'].includes(header));
  if ((productIndex < 0 && skuIndex < 0) || quantityIndex < 0) {
    return { rows: [], errors: ['CSV headers must include productId or sku, plus quantity.'] };
  }

  const byId = new Map(products.map((product) => [String(product.id || product._id || '').toLowerCase(), product]));
  const bySku = new Map(products.filter((product) => product.sku).map((product) => [String(product.sku).toLowerCase(), product]));
  const rows: OpeningInventoryRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  lines.slice(1).forEach((line, rowIndex) => {
    const cells = csvCells(line);
    const idValue = productIndex >= 0 ? String(cells[productIndex] || '').toLowerCase() : '';
    const skuValue = skuIndex >= 0 ? String(cells[skuIndex] || '').toLowerCase() : '';
    const product = byId.get(idValue) || bySku.get(skuValue);
    const quantity = Number(cells[quantityIndex]);
    const productId = String(product?.id || product?._id || '');

    if (!productId) {
      errors.push(`Row ${rowIndex + 2}: product was not found.`);
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
      errors.push(`Row ${rowIndex + 2}: quantity must be a whole number at least 0.`);
      return;
    }
    if (seen.has(productId)) {
      errors.push(`Row ${rowIndex + 2}: product is duplicated.`);
      return;
    }
    seen.add(productId);
    rows.push({ productId, quantity });
  });

  return { rows, errors };
}

export function getMissingOpeningInventoryProducts(
  products: BaselineProduct[],
  quantities: Record<string, string | number>,
): BaselineProduct[] {
  return products.filter((product) => {
    if (product.isActive === false) return false;
    const id = String(product.id || product._id || '');
    const raw = quantities[id];
    const quantity = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
    const minimum = Math.max(0, Number(product.reserved || 0));
    return !id || raw === '' || raw === undefined || !Number.isInteger(quantity) || quantity < minimum;
  });
}

export function createIdempotencyKey(prefix = 'system'): string {
  if (globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}
