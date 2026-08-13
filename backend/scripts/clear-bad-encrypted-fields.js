// Compatibility entry point retained so an old runbook cannot delete data.
// This path now invokes the verified, non-destructive-by-default migration.
console.warn(
  '[Encryption migration] clear-bad-encrypted-fields is deprecated; no fields will be cleared.'
);

const { runLegacyEncryptionMigration } = await import('./migrate-legacy-encryption-key.js');

runLegacyEncryptionMigration().catch(() => {
  console.error('[Encryption migration] Failed safely; review the migration configuration.');
  process.exitCode = 1;
});
