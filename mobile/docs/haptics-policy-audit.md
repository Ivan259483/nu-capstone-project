# Haptics Policy Audit

This audit was captured before the haptics-policy edit. Line numbers in the removal inventory are the original pre-edit line numbers. “Removed/replaced” means the old generic call or prop no longer exists; permitted behavior may now be represented by one of the explicit retained intents below.

## Original haptics removed or replaced

The pre-edit inventory contained 172 call expressions and 10 `haptic` props (182 sites total).

- `src/app/(auth)/forgot-password.tsx`: 43
- `src/app/(auth)/login.tsx`: 255, 488
- `src/app/(auth)/signup.tsx`: 254, 258, 304, 308, 322, 334, 340, 351, 645
- `src/app/(auth)/verify.tsx`: 160, 272
- `src/app/(auth)/welcome.tsx`: 76 (`haptic` prop)
- `src/app/(customer)/_layout.tsx`: 164
- `src/app/(customer)/book.tsx`: 785, 1502, 1508, 1844, 2193, 2546, 2753, 2758, 2784, 2790, 3008, 3148, 3342, 3680, 3735, 4364, 4716, 4783
- `src/app/(customer)/index.tsx`: 382 (`haptic` prop), 1363
- `src/app/(customer)/scan/analyzing.tsx`: 108, 126
- `src/app/(customer)/scan/ar-view.tsx`: 99, 113, 123, 171
- `src/app/(customer)/scan/confirm.tsx`: 120, 229
- `src/app/(customer)/scan/estimate.tsx`: 83, 86, 94, 218, 246
- `src/app/(customer)/scan/index.tsx`: 84, 90, 103, 114, 124
- `src/app/(customer)/scan/prepare-3d.tsx`: 101, 111, 126, 137, 255
- `src/app/(customer)/scan/results.tsx`: 231, 300, 391, 448
- `src/app/(customer)/settings.tsx`: 145, 168, 218, 385, 394, 408, 418
- `src/app/(customer)/track.tsx`: 1495, 1502, 1621, 1643, 1669, 1706, 1730, 1959, 1970
- `src/app/(screens)/address.tsx`: 105, 116, 126, 264, 284, 294, 333, 368, 379
- `src/app/(screens)/appointments.tsx`: 122, 139, 344, 427
- `src/app/(screens)/booking-details.tsx`: 139, 167, 243, 252 (all `haptic` props)
- `src/app/(screens)/change-password.tsx`: 115, 136, 150, 159, 186
- `src/app/(screens)/edit-profile.tsx`: 106, 122, 129, 153, 159, 189
- `src/app/(screens)/notification-preferences.tsx`: 90, 320
- `src/app/(screens)/notifications.tsx`: 283, 288, 303, 311, 340, 350, 680
- `src/app/(screens)/payments.tsx`: 118, 152, 234 (all `haptic` props)
- `src/app/(screens)/services.tsx`: 410, 490, 675
- `src/app/(screens)/settings.tsx`: 132, 147, 235, 252, 262, 272, 288, 298, 319, 339, 349, 359, 375, 384
- `src/app/(screens)/vehicles.tsx`: 52, 139, 187, 228
- `src/app/(screens)/waiver.tsx`: 191, 200
- `src/components/ChatOverlay.tsx`: 251, 345, 385, 441
- `src/components/auth/AuthButton.tsx`: 122
- `src/components/booking/AddVehicleModal.tsx`: 257, 372, 461, 513, 737, 750
- `src/components/ui/AskAiFab.tsx`: 99
- `src/components/ui/GlassCard.tsx`: 58
- `src/components/ui/MotionOverlay.tsx`: 218
- `src/components/ui/MotionPressable.tsx`: 60, 61
- `src/components/ui/PremiumButton.tsx`: 110
- `src/components/ui/PremiumInput.tsx`: 45, 123
- `src/components/ui/PremiumToast.tsx`: 43, 45, 47, 49
- `src/features/ai-scan/components/ARRepairViewer.tsx`: 1017, 1027, 1040, 1054
- `src/features/ai-scan/components/BeforeAfterSlider.tsx`: 451, 453
- `src/features/ai-scan/components/ModelViewerARCard.tsx`: 358, 442
- `src/features/settings/components/AppointmentsSection.tsx`: 78
- `src/features/settings/components/ProfileHeader.tsx`: 73 (`haptic` prop)
- `src/features/settings/components/VehiclesSection.tsx`: 77, 90, 141, 151
- `src/hooks/usePushNotifications.ts`: 68 (`vibrationPattern`)
- `src/utils/haptics.ts`: 26, 30, 34

The following pre-edit lines invoked or configured those calls indirectly through local/custom helpers and were also removed or replaced:

- `src/app/(auth)/forgot-password.tsx`: 91, 103, 120, 133, 144, 177, 185 (`haptic` helper)
- `src/app/(auth)/login.tsx`: 283, 294, 300, 304, 310, 341 (`triggerOutcomeHaptic`)
- `src/app/(auth)/signup.tsx`: 358, 370, 452, 517, 522, 542 (`hapticLight`)
- `src/app/(auth)/verify.tsx`: 173, 182, 191, 200, 220, 234, 250, 297, 304, 337, 345 (`triggerOutcomeHaptic`)
- `src/app/(customer)/index.tsx`: 671, 777, 991, 1229, 1395 (`Tap` helper haptic configuration)
- `src/app/(screens)/change-password.tsx`: 195 (`triggerHapticLight`)
- `src/app/(screens)/edit-profile.tsx`: 202 (`triggerHapticLight`)
- `src/features/ai-scan/components/BeforeAfterSlider.tsx`: 466, 474 (`fireHaptic`)

## Retained call allowlist

These are the post-edit source locations. No other application call sites are allowed by `tests/hapticsPolicy.test.mjs`.

### `primaryPress()` — 19 call sites

- `src/app/(customer)/book.tsx`: 2753, 2950, 3149, 3236
- `src/app/(customer)/index.tsx`: 381
- `src/app/(customer)/track.tsx`: 1706, 1730
- `src/app/(screens)/address.tsx`: 234
- `src/app/(screens)/booking-details.tsx`: 169, 250
- `src/app/(screens)/services.tsx`: 410
- `src/app/(screens)/waiver.tsx`: 194
- `src/components/ChatOverlay.tsx`: 251, 403, 441
- `src/components/auth/AuthButton.tsx`: 122
- `src/components/booking/AddVehicleModal.tsx`: 465
- `src/components/ui/PremiumButton.tsx`: 108
- `src/features/ai-scan/components/PremiumScanner.tsx`: 457

### `formSubmitError()` — 52 call sites

- `src/app/(auth)/forgot-password.tsx`: 80, 101, 118, 141, 165, 184
- `src/app/(auth)/login.tsx`: 279, 303, 334
- `src/app/(auth)/signup.tsx`: 254, 303, 307, 337
- `src/app/(auth)/verify.tsx`: 169, 178, 187, 196, 244, 269, 294, 306, 335
- `src/app/(customer)/book.tsx`: 2965, 3015, 3158, 3164, 3182, 3206, 3218, 3225, 3286, 3306, 3317, 3344, 3362
- `src/app/(customer)/scan/confirm.tsx`: 115
- `src/app/(customer)/scan/index.tsx`: 120
- `src/app/(screens)/address.tsx`: 227, 272
- `src/app/(screens)/change-password.tsx`: 123, 129, 153
- `src/app/(screens)/edit-profile.tsx`: 104, 125
- `src/app/(screens)/waiver.tsx`: 176, 182, 188, 206
- `src/components/ChatOverlay.tsx`: 384, 399
- `src/components/booking/AddVehicleModal.tsx`: 461, 504

### `termsReviewComplete()` — 1 call site

- `src/app/(customer)/book.tsx`: 1844 (`markTermsReviewed`, guarded once per review session)

### Platform implementation

- `src/utils/haptics.ts`: 12/16 (`primaryPress`, Android `Virtual_Key`, iOS light impact)
- `src/utils/haptics.ts`: 20/24 (`formSubmitError`, Android `Reject`, iOS error notification)
- `src/utils/haptics.ts`: 28/32 (`termsReviewComplete`, Android `Confirm`, iOS success notification)

## Android vibration permission

- No React Native `Vibration` API calls or `TextInput` keyboard vibration/click props were present in the pre-edit source scan.
- `app.json` blocks `android.permission.VIBRATE` and does not explicitly grant it.
- `src/hooks/usePushNotifications.ts` no longer configures `vibrationPattern`.
- A clean temporary Expo prebuild emitted `android.permission.VIBRATE` only as a `tools:node="remove"` manifest directive.
- The Gradle merged-manifest task could not run on the verification host because no Android SDK location is configured.

## Verification result

- `npm run test:haptics-policy`: passed (3/3).
- `npm run typecheck`: passed.
- `npx eslint tests/hapticsPolicy.test.mjs src/utils/haptics.ts`: passed.
- `npm run lint`: existing project-wide baseline remains (108 errors, 97 warnings), led by React Compiler rules in unrelated/pre-existing code.
- `npx expo export --platform ios`: passed.
- `npx expo export --platform android`: passed.
- `git diff --check`: passed.
- Physical iOS/Android haptic acceptance remains device-only and was not run on this host.
