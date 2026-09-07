import { readFile } from 'node:fs/promises';
import { validateDefinition } from '../services/vehicleIntelligence.service.js';

const file = process.argv.find((arg) => arg.startsWith('--file='))?.slice(7);
if (!file) throw new Error('Usage: node scripts/import-vehicle-definitions.js --file=definitions.json [--apply]');
const records = JSON.parse(await readFile(file, 'utf8'));
if (!Array.isArray(records) || !records.length) throw new Error('Input must be a nonempty JSON array.');
records.forEach((record) => validateDefinition(record));
console.log(`Validated ${records.length} definitions.`);
if (process.argv.includes('--apply')) {
  const base = process.env.VEHICLE_INTELLIGENCE_API_URL;
  const token = process.env.VEHICLE_INTELLIGENCE_ADMIN_TOKEN;
  if (!base || !token) throw new Error('Set VEHICLE_INTELLIGENCE_API_URL and VEHICLE_INTELLIGENCE_ADMIN_TOKEN.');
  const url = new URL(base);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Remote imports require HTTPS.');
  }
  for (const [index, record] of records.entries()) {
    // Imports use the same role checks, validation and audit history as individual edits.
    const response = await fetch(`${base.replace(/\/$/, '')}/vehicle-intelligence/definitions${record.definitionKey ? `/${encodeURIComponent(record.definitionKey)}` : ''}`, {
      method: record.definitionKey ? 'PUT' : 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(record),
    });
    if (!response.ok) throw new Error(`Record ${index + 1} failed (${response.status}). Earlier successful records remain saved; reload their revisions before retrying.`);
    console.log(`Saved record ${index + 1}/${records.length}.`);
  }
} else console.log('Dry run only. Use --apply with the authenticated admin API to publish.');
