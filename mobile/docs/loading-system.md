# AutoSPF+ mobile loading system

This system keeps loading feedback calm, dark, layout-stable, and consistent. Orange is reserved for the progress accent; surfaces remain graphite and completion uses semantic green.

## Motion contract

| Motion | Timing | Easing | Use |
| --- | ---: | --- | --- |
| Content exit | 140 ms | standard fade | Remove an idle label or icon |
| Content enter | 180 ms | standard fade | Reveal loading, idle, or success content |
| Section enter | 220 ms | standard fade | Reveal a section-level state |
| Success confirmation | 420 ms | `cubic-bezier(0.22, 1, 0.36, 1)` | Confirm a completed mutation before dismissal/navigation |
| Orbital progress | 1,080 ms | linear | Indeterminate button or compact section work |
| Skeleton shimmer | 1,450 ms | `cubic-bezier(0.22, 1, 0.36, 1)` | Initial content fetch only |

Infinite motion is disabled when the OS Reduce Motion preference is enabled. Text and accessibility state remain the source of truth; animation never carries meaning alone.

## Usage rules

1. **Primary button loading** — set `loading` on `PremiumButton`. The button keeps its dimensions, disables repeat presses, cross-fades its label, and uses a light orbital indicator on orange. Use `success` only after the server mutation has actually succeeded; do not infer completion from elapsed time.
2. **Page skeleton** — use `PageSkeleton` for the first load of content-heavy pages. Choose `list`, `detail`, or `dashboard`, and keep real headers/navigation mounted. Do not replace a page with a full-screen loader.
3. **Section loading** — use `SectionLoader` when one card, modal region, footer, embedded viewer, or panel is blocked. Set `minHeight` to the final region height to avoid layout shift.
4. **Full-screen loading** — use `FullScreenLoader` only for cold start, session restoration, or an app-wide blocking gate. Normal API fetches must use skeletons or section states.
5. **Success completion** — use `SuccessMark` or `PremiumButton success`. Show it only for an authoritative successful mutation. Keep it brief, then navigate or dismiss; persistent business status continues to come from the backend.
6. **Refresh and pagination** — retain native pull-to-refresh behavior for the gesture itself. Use the compact orbital indicator only for explicit pagination/footer work.

## Component map

```text
src/components/ui/loading/
├── motion.ts             # shared timings, easing, and controlled colors
├── PremiumLoader.tsx     # compact orbital progress primitive
├── LoadingStates.tsx     # SectionLoader, FullScreenLoader, PageSkeleton, SuccessMark
└── index.ts              # public loading API

src/components/ui/
├── PremiumButton.tsx     # stable idle/loading/success state machine
└── SkeletonPulse.tsx     # shared low-contrast shimmer implementation
```

## State logic

```tsx
const [phase, setPhase] = useState<'idle' | 'loading' | 'success'>('idle');

async function submit() {
  if (phase !== 'idle') return;
  setPhase('loading');
  try {
    await authoritativeMutation();
    setPhase('success');
  } catch (error) {
    setPhase('idle');
    showError(error);
  }
}

<PremiumButton
  title={phase === 'loading' ? 'Saving…' : 'Save changes'}
  loading={phase === 'loading'}
  success={phase === 'success'}
  successTitle="Saved"
  onSuccessAnimationComplete={close}
  onPress={submit}
/>
```

For data pages, render cached content during background refetch. Show the page skeleton only when there is no usable content yet. This preserves layout and prevents repeated loading takeovers.
