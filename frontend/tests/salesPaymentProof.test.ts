import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isInlinePaymentProof,
  paymentProofDataUrlToBlob,
} from '../src/lib/sales-payment-proof.ts';

test('Sales proof viewer converts a supported inline receipt into a browser Blob', async () => {
  const source = 'data:image/jpeg;base64,aGVsbG8=';
  const blob = paymentProofDataUrlToBlob(source);

  assert.ok(blob);
  assert.equal(blob.type, 'image/jpeg');
  assert.equal(await blob.text(), 'hello');
  assert.equal(isInlinePaymentProof(source), true);
});

test('Sales proof viewer rejects malformed or unsupported inline proof data', () => {
  assert.equal(paymentProofDataUrlToBlob('data:text/plain;base64,aGVsbG8='), null);
  assert.equal(paymentProofDataUrlToBlob('data:image/jpeg;base64,%%%'), null);
  assert.equal(isInlinePaymentProof('https://example.test/proof.jpg'), false);
});
