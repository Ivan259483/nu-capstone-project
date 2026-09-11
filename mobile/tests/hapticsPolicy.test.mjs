import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(projectRoot, 'src');
const hapticsModule = path.join(sourceRoot, 'utils', 'haptics.ts');
const forbiddenInputHandlers = new Set([
  'onChangeText',
  'onKeyPress',
  'onChange',
  'onInput',
  'onFocus',
  'onBlur',
]);
const allowedMethods = new Set([
  'primaryPress',
  'formSubmitError',
  'termsReviewComplete',
]);
const allowedFilesByMethod = {
  primaryPress: new Set([
    'app/(customer)/book.tsx',
    'app/(customer)/index.tsx',
    'app/(customer)/track.tsx',
    'app/(screens)/address.tsx',
    'app/(screens)/booking-details.tsx',
    'app/(screens)/services.tsx',
    'app/(screens)/waiver.tsx',
    'components/ChatOverlay.tsx',
    'components/auth/AuthButton.tsx',
    'components/booking/AddVehicleModal.tsx',
    'components/ui/PremiumButton.tsx',
    'features/ai-scan/components/PremiumScanner.tsx',
  ]),
  formSubmitError: new Set([
    'app/(auth)/forgot-password.tsx',
    'app/(auth)/login.tsx',
    'app/(auth)/signup.tsx',
    'app/(auth)/verify.tsx',
    'app/(customer)/book.tsx',
    'app/(customer)/scan/confirm.tsx',
    'app/(customer)/scan/index.tsx',
    'app/(screens)/address.tsx',
    'app/(screens)/change-password.tsx',
    'app/(screens)/edit-profile.tsx',
    'app/(screens)/waiver.tsx',
    'components/ChatOverlay.tsx',
    'components/booking/AddVehicleModal.tsx',
  ]),
  termsReviewComplete: new Set(['app/(customer)/book.tsx']),
};

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.[jt]sx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function collectNamedFunctions(sourceFile) {
  const functions = new Map();

  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      functions.set(node.name.text, node);
    } else if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      functions.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return functions;
}

function callbackCallsHaptics(callback, namedFunctions, sourceFile, seen = new Set()) {
  if (ts.isParenthesizedExpression(callback)) {
    return callbackCallsHaptics(callback.expression, namedFunctions, sourceFile, seen);
  }
  if (ts.isIdentifier(callback)) {
    const declaration = namedFunctions.get(callback.text);
    if (!declaration || seen.has(declaration)) return false;
    seen.add(declaration);
    return callbackCallsHaptics(declaration, namedFunctions, sourceFile, seen);
  }
  if (
    !ts.isArrowFunction(callback)
    && !ts.isFunctionExpression(callback)
    && !ts.isFunctionDeclaration(callback)
  ) {
    return false;
  }

  let found = false;
  function visit(node) {
    if (found) return;
    if (node !== callback && (
      ts.isArrowFunction(node)
      || ts.isFunctionExpression(node)
      || ts.isFunctionDeclaration(node)
    )) return;

    if (ts.isCallExpression(node)) {
      if (/^Haptics\.\w+$/.test(node.expression.getText(sourceFile))) {
        found = true;
        return;
      }
      if (ts.isIdentifier(node.expression)) {
        const declaration = namedFunctions.get(node.expression.text);
        if (declaration && !seen.has(declaration)) {
          const nextSeen = new Set(seen);
          nextSeen.add(declaration);
          if (callbackCallsHaptics(declaration, namedFunctions, sourceFile, nextSeen)) {
            found = true;
            return;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(callback);
  return found;
}

test('expo-haptics and Android vibration access stay centralized and permissionless', () => {
  const files = sourceFiles(sourceRoot);
  const directImports = files.filter((file) => fs.readFileSync(file, 'utf8').includes('expo-haptics'));
  assert.deepEqual(directImports, [hapticsModule]);

  const allSource = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const applicationSource = files
    .filter((file) => file !== hapticsModule)
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  assert.doesNotMatch(applicationSource, /\bVibration\b/);
  assert.doesNotMatch(
    applicationSource,
    /\bHaptics\.(?:impact|selection|notify|impactAsync|selectionAsync|notificationAsync)\b/,
  );
  assert.doesNotMatch(allSource, /AndroidHaptics\.(?:Keyboard_Tap|Keyboard_Press|Keyboard_Release)/);
  assert.doesNotMatch(applicationSource, /\bhaptic\s*=/);
  assert.doesNotMatch(
    applicationSource,
    /\b(?:enableHapticFeedback|hapticFeedbackEnabled|keyboardHaptics?|vibrate)\s*=/i,
  );

  const appConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));
  assert.ok(appConfig.expo.android.blockedPermissions.includes('android.permission.VIBRATE'));
  assert.ok(!appConfig.expo.android.permissions.includes('android.permission.VIBRATE'));
  assert.doesNotMatch(
    fs.readFileSync(path.join(sourceRoot, 'hooks', 'usePushNotifications.ts'), 'utf8'),
    /vibrationPattern/,
  );
});

test('only the three audited haptic intents are callable from approved files', () => {
  const calls = [];

  for (const file of sourceFiles(sourceRoot)) {
    if (file === hapticsModule) continue;
    const source = fs.readFileSync(file, 'utf8');
    const relativeFile = path.relative(sourceRoot, file);
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const namedFunctions = collectNamedFunctions(sourceFile);

    function visit(node, ancestors = []) {
      if (ts.isCallExpression(node)) {
        const match = /^Haptics\.(\w+)$/.exec(node.expression.getText(sourceFile));
        if (match) {
          const method = match[1];
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          assert.ok(allowedMethods.has(method), `${relativeFile}:${position.line + 1} uses ${method}`);
          assert.ok(
            allowedFilesByMethod[method].has(relativeFile),
            `${relativeFile}:${position.line + 1} is not approved for ${method}`,
          );

          for (const ancestor of ancestors) {
            if (ts.isJsxAttribute(ancestor)) {
              const handler = ancestor.name.getText(sourceFile);
              assert.ok(
                !forbiddenInputHandlers.has(handler),
                `${relativeFile}:${position.line + 1} calls haptics from ${handler}`,
              );
            }
            if (
              ts.isCallExpression(ancestor)
              && /^(?:React\.)?useEffect$/.test(ancestor.expression.getText(sourceFile))
            ) {
              assert.fail(`${relativeFile}:${position.line + 1} calls haptics from useEffect`);
            }
          }
          calls.push({ method, relativeFile });
        }
      }

      if (ts.isJsxAttribute(node) && forbiddenInputHandlers.has(node.name.getText(sourceFile))) {
        const callback = node.initializer && ts.isJsxExpression(node.initializer)
          ? node.initializer.expression
          : undefined;
        if (callback) {
          assert.ok(
            !callbackCallsHaptics(callback, namedFunctions, sourceFile),
            `${relativeFile} calls haptics directly or indirectly from ${node.name.getText(sourceFile)}`,
          );
        }
      }

      if (
        ts.isCallExpression(node)
        && /^(?:React\.)?useEffect$/.test(node.expression.getText(sourceFile))
        && node.arguments[0]
      ) {
        assert.ok(
          !callbackCallsHaptics(node.arguments[0], namedFunctions, sourceFile),
          `${relativeFile} calls haptics directly or indirectly from useEffect`,
        );
      }
      ts.forEachChild(node, (child) => visit(child, [...ancestors, node]));
    }

    visit(sourceFile);
  }

  assert.equal(calls.filter((call) => call.method === 'termsReviewComplete').length, 1);
  assert.ok(calls.some((call) => call.method === 'primaryPress'));
  assert.ok(calls.some((call) => call.method === 'formSubmitError'));
});

test('the platform mappings use only the approved feedback types', () => {
  const source = fs.readFileSync(hapticsModule, 'utf8');
  assert.match(source, /primaryPress\(\)[\s\S]*AndroidHaptics\.Virtual_Key[\s\S]*ImpactFeedbackStyle\.Light/);
  assert.match(source, /formSubmitError\(\)[\s\S]*AndroidHaptics\.Reject[\s\S]*NotificationFeedbackType\.Error/);
  assert.match(source, /termsReviewComplete\(\)[\s\S]*AndroidHaptics\.Confirm[\s\S]*NotificationFeedbackType\.Success/);
  assert.doesNotMatch(source, /selectionAsync|ImpactFeedbackStyle\.(?:Medium|Heavy)|NotificationFeedbackType\.Warning/);
});
