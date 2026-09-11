/**
 * Source policy for the OTP screens on Mobile and Web.
 *
 * The original defect was a client one: POST /auth/verify-otp returned a real
 * session and the Mobile verify screen threw it away, then navigated to sign-in,
 * which produced a second code. These checks pin the invariants that prevent a
 * regression, on both clients, without needing a device or a browser.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const webRoot = path.resolve(mobileRoot, '..', 'frontend');

const read = (file) => fs.readFileSync(file, 'utf8');
const parse = (file) =>
  ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const walk = (node, visit) => {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
};

/** A named function declaration, `const name = () => {}`, or object method. */
const findFunction = (source, name) => {
  let found = null;
  walk(source, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (ts.isMethodDeclaration(node) && node.name?.getText() === name) found = node;
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === name
      && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      found = node.initializer;
    }
  });
  assert.ok(found, `expected to find a function named ${name}`);
  return found;
};

/** Every `router.replace(x)` / `router.push(x)` argument inside a subtree. */
const navigationTargets = (node) => {
  const targets = [];
  walk(node, (child) => {
    if (!ts.isCallExpression(child)) return;
    const callee = child.expression;
    if (!ts.isPropertyAccessExpression(callee)) return;
    if (!ts.isIdentifier(callee.expression) || callee.expression.text !== 'router') return;
    if (!['replace', 'push', 'navigate'].includes(callee.name.text)) return;
    targets.push(child.arguments[0]?.getText() ?? '');
  });
  return targets;
};

/** The JSX attribute names passed to a given component in a file. */
const jsxProps = (source, componentName) => {
  const props = new Set();
  walk(source, (node) => {
    const opening = ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node) ? node : null;
    if (!opening || opening.tagName.getText() !== componentName) return;
    for (const attribute of opening.attributes.properties) {
      if (ts.isJsxAttribute(attribute)) props.add(attribute.name.getText());
    }
  });
  return props;
};

const mobileVerify = path.join(mobileRoot, 'src/app/(auth)/verify.tsx');
const mobileAuthService = path.join(mobileRoot, 'src/services/api/authService.ts');
const mobileOtpInput = path.join(mobileRoot, 'src/components/auth/AuthOtpInput.tsx');
const webVerifyPage = path.join(webRoot, 'src/pages/VerifyOtpPage.tsx');
const webRegisterModal = path.join(webRoot, 'src/components/auth/RegisterOtpModal.tsx');
const webLogin = path.join(webRoot, 'src/pages/Login.tsx');

test('the Mobile verify screen never navigates to sign-in on a successful verification', () => {
  const handler = findFunction(parse(mobileVerify), 'handleVerifyOtp');
  const targets = navigationTargets(handler);

  assert.ok(targets.length > 0, 'the verify handler must navigate somewhere on success');
  for (const target of targets) {
    assert.ok(
      !/\(auth\)\/login/.test(target),
      `verify success must not route to sign-in, found: ${target}`,
    );
  }
  // Replace, not push, so sign-in and this screen leave the back stack.
  assert.ok(
    targets.includes("'/'"),
    `expected a replace to the app root, found: ${targets.join(', ')}`,
  );
});

test('the Mobile verify screen consumes the session instead of re-posting the code', () => {
  const text = read(mobileVerify);
  assert.match(text, /completeSignupOtp\(/, 'signup verification must go through the auth context');
  assert.match(text, /completeLoginOtp\(/, 'login verification must go through the auth context');
  assert.ok(
    !/apiClient\.post\(\s*'\/auth\/verify-otp'/.test(text),
    'the screen must not post the code directly and discard the session it returns',
  );
});

test('Mobile verification persists the session it receives', () => {
  const verifyOtp = findFunction(parse(mobileAuthService), 'verifyOtp');
  const body = verifyOtp.getText();
  assert.match(body, /persistSession\(/, 'verifyOtp must persist the token it receives');
  assert.match(body, /restoreStoredSession\(/, 'verifyOtp must confirm the session against /auth/me');
});

test('the 6th digit submits on its own, on both clients', () => {
  assert.ok(
    jsxProps(parse(mobileVerify), 'AuthOtpInput').has('onComplete'),
    'Mobile: AuthOtpInput must receive onComplete so the code auto-submits',
  );
  for (const file of [webVerifyPage, webRegisterModal, webLogin]) {
    assert.ok(
      /[Aa]utoSubmitRef/.test(read(file)),
      `Web: ${path.basename(file)} must guard a single auto-submit per completed code`,
    );
  }
});

test('every OTP field advertises one-time-code autofill', () => {
  // iOS keychain / Android SMS retrieval on the shared native input.
  const nativeInput = read(mobileOtpInput);
  assert.match(nativeInput, /textContentType="oneTimeCode"/);
  assert.match(nativeInput, /'sms-otp'/);
  assert.match(nativeInput, /'one-time-code'/);

  for (const file of [webVerifyPage, webRegisterModal, webLogin]) {
    assert.ok(
      /autoComplete=\{?\s*(idx|i)\s*===\s*0\s*\?\s*"one-time-code"/.test(read(file)),
      `Web: ${path.basename(file)} must set one-time-code autofill on the first box`,
    );
  }
});

test('pasting a full code fills every box', () => {
  // Mobile uses one native input behind the boxes, so a paste lands whole.
  assert.match(read(mobileOtpInput), /slice\(0,\s*length\)/);
  for (const file of [webVerifyPage, webRegisterModal, webLogin]) {
    assert.ok(/onPaste=/.test(read(file)), `Web: ${path.basename(file)} must handle paste`);
  }
});

test('Web returns to sign-in only when the login challenge itself expired', () => {
  const text = read(webLogin);
  assert.ok(text.includes('LOGIN_CHALLENGE_EXPIRED'), 'an expired challenge must be handled explicitly');
  // An expired code keeps the user on the OTP step with a resend offered.
  assert.ok(
    /OTP_EXPIRED[\s\S]{0,400}setLoginOtpResend\(0\)/.test(text),
    'an expired code must offer an immediate resend instead of returning to sign-in',
  );
});
