export const CHAT_BLUE = '#0066FF';
export const CHAT_BLUE_DARK = '#2563EB';
export const CHAT_ASSISTANT_NAME = 'AutoSPF+ Concierge';
/** Short label in inbox list */
export const CHAT_INBOX_NAME = 'AutoSPF+ Concierge';

/** Main messenger panel */
export const chatWindowClass =
    'relative flex w-full flex-col overflow-hidden rounded-[32px] border !border-white/80 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.22),0_10px_28px_rgba(15,23,42,0.12)]';

/** Shadowed home/action cards */
export const chatCardClass =
    'rounded-[20px] border !border-gray-200 bg-white text-left text-gray-900 shadow-[0_16px_38px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(15,23,42,0.16),0_3px_10px_rgba(15,23,42,0.08)] active:translate-y-0 active:scale-[0.995] cursor-pointer';

/** List row (Messages inbox) */
export const chatListRowClass =
    'flex w-full gap-4 border-b !border-gray-200 px-6 py-5 text-left transition-colors hover:bg-[#FAFAFA] cursor-pointer';

/** Primary pill CTA */
export const chatPillButtonClass =
    'inline-flex w-full max-w-[260px] items-center justify-center gap-3 rounded-[16px] bg-[#0066FF] px-6 py-4 text-[16px] font-semibold text-white shadow-[0_14px_34px_rgba(0,102,255,0.28)] transition-all duration-200 hover:bg-[#0052CC] hover:shadow-[0_18px_42px_rgba(0,102,255,0.34)] active:scale-[0.98] cursor-pointer';

export const chatScreenHeaderClass =
    'relative shrink-0 border-b !border-gray-200 px-4 py-[15px]';
