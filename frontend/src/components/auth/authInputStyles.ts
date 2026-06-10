const AUTH_INPUT_BASE_SURFACE =
    "rounded-[18px] border !border-white/10 bg-black/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-xl";

const AUTH_INPUT_INTERACTION =
    "transition-[border-color,background-color,box-shadow] duration-300 hover:!border-white/20 hover:bg-white/[0.045] focus-within:!border-orange-300/45 focus-within:bg-black/55 focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

export const AUTH_FLOATING_INPUT_SHELL_CLASS =
    `relative overflow-hidden ${AUTH_INPUT_BASE_SURFACE} ${AUTH_INPUT_INTERACTION}`;

export const AUTH_FLOATING_INPUT_ERROR_CLASS =
    "!border-red-300/35 hover:!border-red-300/40 focus-within:!border-red-300/45 focus-within:bg-black/50";

export const AUTH_STANDALONE_INPUT_CLASS =
    `h-12 ${AUTH_INPUT_BASE_SURFACE} px-4 text-sm font-medium text-zinc-100 placeholder:text-zinc-600 ${AUTH_INPUT_INTERACTION} focus-visible:!border-orange-300/45 focus-visible:outline-none focus-visible:!ring-0 focus-visible:ring-offset-0 disabled:opacity-60 disabled:text-zinc-500`;

export const AUTH_STANDALONE_INPUT_ERROR_CLASS =
    "!border-red-300/35 hover:!border-red-300/40 focus-visible:!border-red-300/45 focus-visible:bg-black/50";
