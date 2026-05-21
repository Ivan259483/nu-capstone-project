import dns from 'node:dns/promises';

const domain = (process.env.EMAIL_DOMAIN || process.argv[2] || 'autospf.shop').replace(/^@/, '').trim();

const checks = [
  {
    label: 'SPF TXT',
    host: `send.${domain}`,
    type: 'TXT',
    validate: (records) => records.some((record) => record.includes('v=spf1') && record.includes('include:amazonses.com')),
    expected: 'v=spf1 include:amazonses.com ~all',
  },
  {
    label: 'Return-Path MX',
    host: `send.${domain}`,
    type: 'MX',
    validate: (records) => records.some((record) => /feedback-smtp\..+\.amazonses\.com/i.test(record.exchange)),
    expected: 'MX priority 10 to feedback-smtp.<region>.amazonses.com',
  },
  {
    label: 'DKIM TXT',
    host: `resend._domainkey.${domain}`,
    type: 'TXT',
    validate: (records) => records.some((record) => /^p=/i.test(record)),
    expected: 'Resend DKIM public key beginning with p=',
  },
  {
    label: 'DMARC TXT',
    host: `_dmarc.${domain}`,
    type: 'TXT',
    validate: (records) => records.some((record) => /^v=DMARC1/i.test(record) && /\bp=(none|quarantine|reject)\b/i.test(record)),
    expected: 'v=DMARC1; p=none; rua=mailto:dmarc@autospf.shop; adkim=s; aspf=r; pct=100',
  },
];

const flattenTxt = (records) => records.map((parts) => parts.join(''));

async function resolveRecords(type, host) {
  if (type === 'TXT') return flattenTxt(await dns.resolveTxt(host));
  if (type === 'MX') return dns.resolveMx(host);
  throw new Error(`Unsupported DNS type: ${type}`);
}

let failures = 0;

console.log(`Checking Resend email DNS for ${domain}\n`);

for (const check of checks) {
  try {
    const records = await resolveRecords(check.type, check.host);
    const ok = check.validate(records);
    if (!ok) failures += 1;

    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.label} (${check.host})`);
    console.log(`  Expected: ${check.expected}`);
    console.log(`  Found: ${JSON.stringify(records)}\n`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${check.label} (${check.host})`);
    console.log(`  Expected: ${check.expected}`);
    console.log(`  Found: ${error.code || error.message}\n`);
  }
}

if (failures > 0) {
  console.error(`${failures} DNS check(s) failed. Add/fix the records in your DNS provider and re-run this script after propagation.`);
  process.exit(1);
}

console.log('All email DNS checks passed.');
