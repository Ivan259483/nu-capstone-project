import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

const layoutSource = read('src/components/auth/AuthLayout.tsx');
const buttonSource = read('src/components/auth/AuthButton.tsx');
const inputSource = read('src/components/auth/AuthInput.tsx');
const forgotPasswordSource = read('src/app/(auth)/forgot-password.tsx');
const signupSource = read('src/app/(auth)/signup.tsx');

test('loginBrand auth shell owns the shared hero and exact primary control geometry', () => {
  assert.match(layoutSource, /appearance\?: 'default' \| 'loginBrand'/);
  assert.match(layoutSource, /login-cinematic-bg\.png/);
  assert.match(layoutSource, /bottomFade=\{isLoginBrand\}/);
  assert.match(layoutSource, /formSlotLoginBrand:\s*\{[\s\S]*?maxWidth: 430/);
  assert.match(layoutSource, /logoSlotLoginBrand:\s*\{[\s\S]*?marginBottom: 5/);

  assert.match(buttonSource, /height: 52/);
  assert.match(buttonSource, /borderRadius: isLoginBrand \? 12 : AuthRadius\.button/);
  assert.match(buttonSource, /isLoginBrand\s*\? AuthColors\.brandAccent/);
  assert.match(buttonSource, /isLoginBrand\s*\? '#FFFFFF'/);
  assert.match(buttonSource, /isLoginBrand \? AuthFontFamily\.bold/);
});

test('reset password uses the hero, branded actions, inline spacing, and reserved errors', () => {
  assert.match(forgotPasswordSource, /<AuthLayout\s+appearance="loginBrand"/);
  assert.match(forgotPasswordSource, /title=\{loading \? 'Sending code…' : 'Send reset code'\}[\s\S]*?appearance="loginBrand"/);
  assert.doesNotMatch(forgotPasswordSource, /footer=\{actions\}/);
  assert.match(forgotPasswordSource, /<View\s+style=\{\[\s*styles\.actionSlot/);
  assert.match(forgotPasswordSource, /actionSlot: \{ marginTop: 12 \}/);
  assert.match(inputSource, /errorSlot:\s*\{[\s\S]*?height: 20/);

  const reservedSlots = forgotPasswordSource.match(/reserveErrorSpace/g) ?? [];
  assert.equal(reservedSlots.length, 3);
});

test('signup keeps email in step two and validates from blur or submit without initial errors', () => {
  assert.match(signupSource, /<AuthLayout\s+appearance="loginBrand"/);
  assert.match(signupSource, /label=\{step === 1 \? 'Your details' : 'Account & password'\}/);
  assert.match(signupSource, /<Text style=\{s\.stepBackText\}>Your details<\/Text>/);

  const stepTwoStart = signupSource.indexOf('key="register-step-2"');
  const emailField = signupSource.indexOf('label="Email address"');
  assert.ok(stepTwoStart >= 0 && emailField > stepTwoStart, 'email must remain in signup step two');

  assert.match(signupSource, /label="Phone number"[\s\S]*?onBlur=\{\(\) => \{[\s\S]*?validatePhoneField\(\)/);
  assert.match(signupSource, /title=\{loading \? 'Creating account…' : 'Create account'\}[\s\S]*?disabled=\{loading\}/);
  assert.doesNotMatch(signupSource, /disabled=\{loading \|\| !canRegister\}/);
  assert.doesNotMatch(signupSource, /if \(!touched\.password\)/);
  assert.doesNotMatch(signupSource, /Complete step 2 and required acknowledgements/);

  const reservedSlots = signupSource.match(/reserveErrorSpace/g) ?? [];
  assert.equal(reservedSlots.length, 6);
});
