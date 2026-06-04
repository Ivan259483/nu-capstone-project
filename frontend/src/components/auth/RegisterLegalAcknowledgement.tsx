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
    "mt-0.5 h-4 w-4 shrink-0 rounded-[5px] border shadow-none ring-offset-0",
    "border-white/20 bg-white/[0.045]",
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
    "data-[state=checked]:border-amber-300/70 data-[state=checked]:bg-amber-300/85 data-[state=checked]:text-[#070A12]",
    "data-[state=checked]:shadow-[0_0_18px_-8px_rgba(245,158,11,0.9),inset_0_1px_0_rgba(255,255,255,0.18)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/35 focus-visible:ring-offset-0",
    "[&_svg]:h-3 [&_svg]:w-3 [&_svg]:stroke-[3]"
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
        <div className="space-y-1.5">
            <div className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
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
                        className="block cursor-pointer text-left text-[11px] font-normal leading-snug text-slate-400"
                    >
                        I acknowledge the{" "}
                        <span className="font-medium text-amber-200/85">
                            Paint Protection Film General Terms and Conditions
                        </span>
                        . Select this to read and accept in the popup, then use{" "}
                        <span className="font-medium text-amber-100/80">{submitActionLabel}</span> above.
                    </Label>
                </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
                <Checkbox
                    id={websiteCheckboxId}
                    checked={registerWebsiteTermsAgreed}
                    aria-required
                    onCheckedChange={(c) => setRegisterWebsiteTermsAgreed(c === true)}
                    className={LEGAL_CHECKBOX_CLASS}
                />
                <Label
                    htmlFor={websiteCheckboxId}
                    className="block min-w-0 flex-1 cursor-pointer text-left text-[11px] font-normal leading-snug text-slate-400"
                >
                    By registering, you confirm the PPF terms (via the popup) and our website{" "}
                    <span className="font-medium text-amber-200/85 hover:underline">Terms of Service</span>.
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
                data-ppf-terms-dialog
                className={cn(
                    "ppf-terms-dialog",
                    "max-h-[min(92vh,880px)] w-[min(700px,calc(100vw-1.25rem))] max-w-[min(700px,calc(100vw-1.25rem))]",
                    "gap-0 overflow-hidden rounded-[32px] border-0 bg-[var(--ppf-canvas)] p-0",
                    "shadow-[0_40px_100px_-32px_rgba(0,0,0,0.5)] sm:max-w-[min(700px,calc(100vw-1.25rem))] sm:rounded-[32px]",
                    "[&>button]:ring-offset-transparent"
                )}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogHeader className="space-y-0 p-0 text-left">
                    <div className="ppf-terms-dialog__hero rounded-t-[32px]">
                        <div className="relative z-[1] flex items-start gap-4">
                            <div className="ppf-terms-dialog__icon" aria-hidden>
                                <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7" />
                            </div>
                            <div className="min-w-0">
                                <p className="ppf-terms-dialog__eyebrow">Client service brief</p>
                                <DialogTitle className="ppf-terms-dialog__title text-left">
                                    Paint Protection Film Terms & Acknowledgement
                                </DialogTitle>
                                <p className="ppf-terms-dialog__brand">AUTOSPF+ Sun Protection Film</p>
                                <p className="ppf-terms-dialog__subtitle">{PPF_TERMS_BUSINESS.name}</p>
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
                    className="ppf-terms-dialog__scroll text-left"
                    role="document"
                    tabIndex={0}
                >
                    <div className="ppf-terms-dialog__card">
                        <p className="ppf-terms-dialog__card-meta">
                            <span>{PPF_TERMS_BUSINESS.address}</span>
                            <span>{PPF_TERMS_BUSINESS.phone}</span>
                        </p>
                        <p className="ppf-terms-dialog__card-intro">{PPF_TERMS_INTRO}</p>
                    </div>

                    <div className="ppf-terms-dialog__highlights">
                        {PPF_TERMS_HIGHLIGHTS.map((item, i) => {
                            const HighlightIcon = PPF_TERMS_HIGHLIGHT_ICONS[i % PPF_TERMS_HIGHLIGHT_ICONS.length];
                            return (
                                <div key={item.label} className="ppf-terms-dialog__highlight">
                                    <div className="ppf-terms-dialog__highlight-head">
                                        <span className="ppf-terms-dialog__highlight-icon">
                                            <HighlightIcon className="h-4 w-4" aria-hidden />
                                        </span>
                                        <div>
                                            <p className="ppf-terms-dialog__highlight-label">{item.label}</p>
                                            <p className="ppf-terms-dialog__highlight-value">{item.value}</p>
                                        </div>
                                    </div>
                                    <p className="ppf-terms-dialog__highlight-detail">{item.detail}</p>
                                </div>
                            );
                        })}
                    </div>

                    {PPF_TERMS_SECTIONS.map((sec, i) => (
                        <section
                            key={sec.title}
                            className={cn(
                                "ppf-terms-dialog__section",
                                i === PPF_TERMS_SECTIONS.length - 1 && "ppf-terms-dialog__section--final mb-0"
                            )}
                        >
                            <span className="ppf-terms-dialog__section-index" aria-hidden>
                                {String(i + 1).padStart(2, "0")}
                            </span>
                            <div className="pr-10">
                                <p className="ppf-terms-dialog__section-kicker">PPF client note</p>
                                <h3 className="ppf-terms-dialog__section-title">{sec.title}</h3>
                                <p className="ppf-terms-dialog__section-summary">{sec.summary}</p>
                            </div>
                            <p className="ppf-terms-dialog__section-body">{sec.body}</p>
                            <ul className="ppf-terms-dialog__bullets">
                                {sec.bullets.map((bullet) => (
                                    <li key={bullet} className="ppf-terms-dialog__bullet">
                                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                                        <span>{bullet}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                    <p className="ppf-terms-dialog__acceptance">{PPF_TERMS_ACCEPTANCE_NOTE}</p>
                </div>
                <div
                    className={cn(
                        "ppf-terms-dialog__status",
                        scrolledToEnd ? "ppf-terms-dialog__status--ready" : "ppf-terms-dialog__status--pending"
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
                <DialogFooter className="ppf-terms-dialog__footer flex-col-reverse items-stretch border-0 p-0 sm:flex-row sm:justify-between sm:space-x-0">
                    <Button
                        type="button"
                        variant="outline"
                        className="ppf-terms-dialog__btn-cancel"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={!scrolledToEnd}
                        className="ppf-terms-dialog__btn-accept"
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
