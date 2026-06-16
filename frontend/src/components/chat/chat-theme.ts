export const CHAT_BLUE = '#0066FF';
export const CHAT_BLUE_DARK = '#2563EB';
export const CHAT_ASSISTANT_NAME = 'AutoSPF+ Concierge';
/** Short label in inbox list */
export const CHAT_INBOX_NAME = 'AutoSPF+ Concierge';

/** Main messenger panel */
export const chatWindowClass =
    'relative flex w-full flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.20),0_8px_24px_rgba(15,23,42,0.12)]';

/** Shadowed home/action cards */
export const chatCardClass =
    'rounded-[18px] border !border-gray-200 bg-white text-left text-gray-900 shadow-[0_12px_28px_rgba(15,23,42,0.10),0_2px_8px_rgba(15,23,42,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.13),0_3px_10px_rgba(15,23,42,0.07)] active:translate-y-0 active:scale-[0.995] cursor-pointer';

/** List row (Messages inbox) */
export const chatListRowClass =
    'flex w-full gap-4 border-b !border-gray-200 px-6 py-5 text-left transition-colors hover:bg-[#FAFAFA] cursor-pointer';

/** Primary pill CTA */
export const chatPillButtonClass =
    'inline-flex w-full max-w-[240px] items-center justify-center gap-2.5 rounded-[15px] bg-[#0066FF] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_12px_28px_rgba(0,102,255,0.25)] transition-all duration-200 hover:bg-[#0052CC] hover:shadow-[0_16px_34px_rgba(0,102,255,0.31)] active:scale-[0.98] cursor-pointer';

export const chatScreenHeaderClass =
    'relative flex h-[58px] shrink-0 items-center justify-center border-b !border-gray-100 px-4';
