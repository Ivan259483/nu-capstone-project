import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type FloatingLabelFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    containerClassName?: string;
    /** Tighter error line for dense forms (e.g. register). */
    compactError?: boolean;
    /** Icon or control aligned to the vertical center of the input shell (e.g. password visibility). */
    endAdornment?: ReactNode;
};

export function FloatingLabelField({
    label,
    value,
    onChange,
    error,
    className,
    containerClassName,
    compactError = false,
    endAdornment,
    id: idProp,
    disabled,
    onBlur,
    onFocus,
    ...inputProps
}: FloatingLabelFieldProps) {
    const autoId = useId();
    const id = idProp || autoId;
    const hasValue = value.length > 0;

    return (
        <div className={cn("relative", containerClassName)}>
            <div
                className={cn(
                    "relative overflow-hidden rounded-2xl border bg-white/[0.04] backdrop-blur-md",
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-[border-color,box-shadow] duration-300",
                    error
                        ? "border-red-500/60 ring-1 ring-red-500/15"
                        : "border-white/10 focus-within:border-orange-400/55 focus-within:ring-1 focus-within:ring-orange-500/20",
                    disabled && "opacity-60"
                )}
            >
                <input
                    {...inputProps}
                    id={id}
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={onFocus}
                    onBlur={onBlur}
                    placeholder=" "
                    className={cn(
                        "peer block w-full bg-transparent px-4 pb-2.5 pt-6 text-sm font-medium text-white",
                        "placeholder-transparent focus:outline-none focus:ring-0 disabled:cursor-not-allowed",
                        className
                    )}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                />
                <label
                    htmlFor={id}
                    className={cn(
                        "pointer-events-none absolute left-4 text-white/45 transition-all duration-200 ease-out",
                        "peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm",
                        "peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-[0.14em] peer-focus:text-orange-400",
                        (hasValue || inputProps.type === "date") &&
                            "top-2 translate-y-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-400/90"
                    )}
                >
                    {label}
                </label>
                {endAdornment ? (
                    <div className="absolute inset-y-0 right-3 z-10 flex items-center">{endAdornment}</div>
                ) : null}
            </div>
            {error ? (
                <p
                    id={`${id}-error`}
                    className={cn(
                        "px-1 font-medium text-red-400 animate-slide-up",
                        compactError ? "mt-0.5 text-[11px] leading-tight" : "mt-1.5 text-xs"
                    )}
                    role="alert"
                >
                    {error}
                </p>
            ) : null}
        </div>
    );
}
