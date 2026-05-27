import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    PPF_TERMS_ACCEPTANCE_NOTE,
    PPF_TERMS_BUSINESS,
    PPF_TERMS_HIGHLIGHTS,
    PPF_TERMS_INTRO,
    PPF_TERMS_SECTIONS,
} from "@/content/ppfRegistrationTerms";
import { cn } from "@/lib/utils";

const PPF_TERMS_HIGHLIGHT_ICONS = [Clock, ShieldCheck, RefreshCw, CheckCircle2];

const LEGAL_CHECKBOX_CLASS = cn(
    "h-[18px] w-[18px] shrink-0 rounded-[5px] border shadow-none ring-offset-0 mt-0.5",
    "border-amber-400/55 bg-gradient-to-b from-white/[0.08] to-white/[0.02]",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_0_1px_rgba(249,115,22,0.18),0_2px_12px_-4px_rgba(249,115,22,0.22)]",
    "data-[state=checked]:border-amber-300 data-[state=checked]:from-orange-500 data-[state=checked]:to-orange-600 data-[state=checked]:bg-gradient-to-b",
    "data-[state=checked]:text-white data-[state=checked]:shadow-[0_0_20px_-4px_rgba(249,115,22,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 focus-visible:ring-offset-0",
    "[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:stroke-[3]"
);

export const REGISTER_LEGAL_TOAST_MESSAGE =
    "Both checkboxes are required: accept the Paint Protection Film terms in the popup, and confirm the website Terms of Service.";

export function useRegisterLegalAcknowledgement() {
    const ppfTermsModalScrollRef = useRef<HTMLDivElement>(null);
    const [ppfTermsModalOpen, setPpfTermsModalOpen] = useState(false);
    const [ppfTermsModalBodyKey, setPpfTermsModalBodyKey] = useState(0);
    const [ppfTermsModalScrolledToEnd, setPpfTermsModalScrolledToEnd] = useState(false);
    const [ppfTermsAgreed, setPpfTermsAgreed] = useState(false);
    const [registerWebsiteTermsAgreed, setRegisterWebsiteTermsAgreed] = useState(false);

    const legalAcknowledged = useMemo(
        () => ppfTermsAgreed && registerWebsiteTermsAgreed,
        [ppfTermsAgreed, registerWebsiteTermsAgreed]
    );

    const resetLegalAcknowledgement = useCallback(() => {
        setPpfTermsAgreed(false);
        setRegisterWebsiteTermsAgreed(false);
        setPpfTermsModalOpen(false);
        setPpfTermsModalScrolledToEnd(false);
        setPpfTermsModalBodyKey((k) => k + 1);
    }, []);

    const checkPpfModalTermsScrollEnd = useCallback(() => {
        const el = ppfTermsModalScrollRef.current;
        if (!el) return;
        const threshold = 56;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
            setPpfTermsModalScrolledToEnd(true);
        }
    }, []);

    useLayoutEffect(() => {
        if (!ppfTermsModalOpen) return;
        const el = ppfTermsModalScrollRef.current;
        if (!el) return;
        if (el.scrollHeight <= el.clientHeight + 8) {
            setPpfTermsModalScrolledToEnd(true);
        }
    }, [ppfTermsModalOpen, ppfTermsModalBodyKey]);

    const openPpfTermsModal = useCallback(() => {
        setPpfTermsModalScrolledToEnd(false);
        setPpfTermsModalBodyKey((k) => k + 1);
        setPpfTermsModalOpen(true);
    }, []);

    return {
        legalAcknowledged,
        resetLegalAcknowledgement,
        ppfTermsAgreed,
        setPpfTermsAgreed,
        registerWebsiteTermsAgreed,
        setRegisterWebsiteTermsAgreed,
        openPpfTermsModal,
        ppfTermsModalOpen,
        setPpfTermsModalOpen,
        ppfTermsModalBodyKey,
        ppfTermsModalScrolledToEnd,
        ppfTermsModalScrollRef,
        checkPpfModalTermsScrollEnd,
    };
}

type RegisterLegalCheckboxesProps = {
    idPrefix?: string;
    submitActionLabel?: string;
    ppfTermsAgreed: boolean;
    setPpfTermsAgreed: (value: boolean) => void;
    registerWebsiteTermsAgreed: boolean;
    setRegisterWebsiteTermsAgreed: (value: boolean) => void;
    onOpenPpfTermsModal: () => void;
};

export function RegisterLegalCheckboxes({
    idPrefix = "reg",
    submitActionLabel = "Create Account",
    ppfTermsAgreed,
    setPpfTermsAgreed,
    registerWebsiteTermsAgreed,
    setRegisterWebsiteTermsAgreed,
    onOpenPpfTermsModal,
}: RegisterLegalCheckboxesProps) {
    const ppfCheckboxId = `${idPrefix}-ppf-terms`;
    const websiteCheckboxId = `${idPrefix}-website-tos`;

    return (
        <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
                <Checkbox
                    id={ppfCheckboxId}
                    checked={ppfTermsAgreed}
                    aria-required
                    onCheckedChange={(c) => {
                        if (c === true) {
                            onOpenPpfTermsModal();
                        } else {
                            setPpfTermsAgreed(false);
                        }
                    }}
                    className={LEGAL_CHECKBOX_CLASS}
                />
                <div className="min-w-0 flex-1">
                    <Label
                        htmlFor={ppfCheckboxId}
                        className="text-xs text-muted-foreground font-normal leading-relaxed cursor-pointer text-left block"
                    >
                        I acknowledge the{" "}
                        <span className="text-primary font-medium">
                            Paint Protection Film General Terms and Conditions
                        </span>
                        . Select this to read and accept in the popup, then use{" "}
                        <span className="text-primary/90 font-medium">{submitActionLabel}</span> above.
                    </Label>
                </div>
            </div>

            <div className="flex items-start gap-2.5">
                <Checkbox
                    id={websiteCheckboxId}
                    checked={registerWebsiteTermsAgreed}
                    aria-required
                    onCheckedChange={(c) => setRegisterWebsiteTermsAgreed(c === true)}
                    className={LEGAL_CHECKBOX_CLASS}
                />
                <Label
                    htmlFor={websiteCheckboxId}
                    className="text-xs text-muted-foreground font-normal leading-relaxed cursor-pointer text-left block min-w-0 flex-1"
                >
                    By registering, you confirm the PPF terms (via the popup) and our website{" "}
                    <span className="text-primary font-medium hover:underline">Terms of Service</span>.
                </Label>
            </div>
        </div>
    );
}

type PpfTermsAcceptanceDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    modalBodyKey: number;
    scrolledToEnd: boolean;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    onAccept: () => void;
};

export function PpfTermsAcceptanceDialog({
    open,
    onOpenChange,
    modalBodyKey,
    scrolledToEnd,
    scrollRef,
    onScroll,
    onAccept,
}: PpfTermsAcceptanceDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    "max-h-[min(92vh,880px)] w-[min(680px,calc(100vw-1rem))] max-w-[min(680px,calc(100vw-1rem))]",
                    "gap-0 overflow-hidden border-orange-400/25 bg-stone-50 p-0 shadow-2xl shadow-black/40 sm:max-w-[min(680px,calc(100vw-1rem))]",
                    "[&>button]:right-4 [&>button]:top-4 [&>button]:rounded-full [&>button]:bg-white/10 [&>button]:p-1.5 [&>button]:text-white/75 [&>button]:opacity-100 [&>button]:ring-offset-transparent hover:[&>button]:bg-white/15 hover:[&>button]:text-white"
                )}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogHeader className="space-y-0 p-0 text-left">
                    <div className="relative overflow-hidden border-b border-orange-500/25 bg-[radial-gradient(circle_at_15%_0%,rgba(251,146,60,0.25),transparent_32%),linear-gradient(135deg,#09090b_0%,#1c1917_54%,#431407_100%)] px-5 py-5 pr-14 text-white sm:px-6">
                        <div className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full border border-orange-300/20" />
                        <div className="pointer-events-none absolute bottom-0 right-16 h-px w-32 bg-gradient-to-r from-transparent via-orange-300/45 to-transparent" />
                        <div className="flex items-start gap-3.5">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-300/30 bg-orange-400/15 shadow-[0_0_35px_-10px_rgba(251,146,60,0.95)]">
                                <ShieldCheck className="h-6 w-6 text-orange-200" aria-hidden />
                            </div>
                            <div className="min-w-0">
                                <p className="mb-1.5 inline-flex rounded-full border border-orange-300/25 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-100">
                                    Client service brief
                                </p>
                                <DialogTitle className="text-left text-xl font-semibold leading-tight text-white sm:text-2xl">
                                    Paint Protection Film Terms & Acknowledgement
                                </DialogTitle>
                                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-100/90">
                                    AUTOSPF+ SUN PROTECTION FILM
                                </p>
                                <p className="mt-1 text-xs leading-snug text-zinc-300">{PPF_TERMS_BUSINESS.name}</p>
                            </div>
                        </div>
                    </div>
                </DialogHeader>
                <DialogDescription className="sr-only">
                    Review the Paint Protection Film terms. Scroll to the bottom of the document, then accept to
                    continue registration.
                </DialogDescription>
                <div
                    key={modalBodyKey}
                    ref={scrollRef}
                    onScroll={onScroll}
                    className="max-h-[min(58vh,540px)] overflow-y-auto bg-[linear-gradient(180deg,#fbf7ef_0%,#fffaf2_38%,#f8fafc_100%)] px-4 py-4 text-left text-[12px] leading-relaxed text-zinc-800 sm:px-5 sm:py-5"
                    role="document"
                    tabIndex={0}
                >
                    <div className="mb-4 rounded-2xl border border-amber-900/10 bg-white/90 p-3.5 shadow-sm shadow-amber-950/5 sm:p-4">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-900/10 pb-3 text-[11px] font-medium text-zinc-600">
                            <span>{PPF_TERMS_BUSINESS.address}</span>
                            <span className="hidden h-1 w-1 rounded-full bg-orange-400 sm:inline-block" aria-hidden />
                            <span>{PPF_TERMS_BUSINESS.phone}</span>
                        </p>
                        <p className="pt-3 text-sm leading-relaxed text-zinc-800">{PPF_TERMS_INTRO}</p>
                    </div>

                    <div className="mb-4 grid gap-2.5 sm:grid-cols-2">
                        {PPF_TERMS_HIGHLIGHTS.map((item, i) => {
                            const HighlightIcon = PPF_TERMS_HIGHLIGHT_ICONS[i % PPF_TERMS_HIGHLIGHT_ICONS.length];
                            return (
                                <div
                                    key={item.label}
                                    className="rounded-2xl border border-orange-900/10 bg-white p-3 shadow-sm shadow-orange-950/5"
                                >
                                    <div className="mb-2 flex items-center gap-2">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                                            <HighlightIcon className="h-4 w-4" aria-hidden />
                                        </span>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                                                {item.label}
                                            </p>
                                            <p className="text-sm font-bold text-zinc-950">{item.value}</p>
                                        </div>
                                    </div>
                                    <p className="text-[11px] leading-relaxed text-zinc-600">{item.detail}</p>
                                </div>
                            );
                        })}
                    </div>

                    {PPF_TERMS_SECTIONS.map((sec, i) => (
                        <section
                            key={sec.title}
                            className={cn(
                                "relative mb-3.5 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm shadow-zinc-950/5",
                                i === PPF_TERMS_SECTIONS.length - 1 && "mb-0 border-orange-300/60 bg-orange-50/80"
                            )}
                        >
                            <div className="absolute right-3 top-3 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-black tracking-wider text-zinc-400">
                                {String(i + 1).padStart(2, "0")}
                            </div>
                            <div className="pr-12">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-700">
                                    PPF client note
                                </p>
                                <h3 className="mt-1 text-sm font-bold text-zinc-950">{sec.title}</h3>
                                <p className="mt-1 text-[12px] font-semibold leading-relaxed text-zinc-700">
                                    {sec.summary}
                                </p>
                            </div>
                            <p className="mt-3 text-[12px] leading-relaxed text-zinc-700">{sec.body}</p>
                            <ul className="mt-3 space-y-2">
                                {sec.bullets.map((bullet) => (
                                    <li key={bullet} className="flex gap-2 text-[12px] leading-relaxed text-zinc-600">
                                        <CheckCircle2
                                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600"
                                            aria-hidden
                                        />
                                        <span>{bullet}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                    <p className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-950 px-4 py-3 text-[12px] font-medium leading-relaxed text-zinc-100 shadow-sm">
                        {PPF_TERMS_ACCEPTANCE_NOTE}
                    </p>
                </div>
                <div
                    className={cn(
                        "flex items-center gap-2 border-t px-4 py-2.5 text-[11px] font-medium sm:px-5",
                        scrolledToEnd
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                    )}
                >
                    {scrolledToEnd ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    ) : (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    <span>
                        {scrolledToEnd
                            ? "You reached the acknowledgement. You may now accept."
                            : "Please scroll through the complete service brief to unlock acceptance."}
                    </span>
                </div>
                <DialogFooter className="flex-col-reverse items-stretch justify-between gap-2 border-t border-zinc-200 bg-white p-3 sm:flex-row sm:justify-between sm:space-x-0 sm:p-4">
                    <Button
                        type="button"
                        variant="outline"
                        className="border-zinc-300 bg-zinc-950 text-white hover:bg-zinc-900 hover:text-white sm:min-w-[116px]"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={!scrolledToEnd}
                        className="bg-gradient-to-r from-amber-500 to-orange-600 font-semibold text-zinc-950 shadow-lg shadow-orange-600/20 hover:from-amber-400 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[260px]"
                        onClick={() => {
                            if (!scrolledToEnd) return;
                            onAccept();
                            onOpenChange(false);
                        }}
                    >
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        I have read and accept
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
