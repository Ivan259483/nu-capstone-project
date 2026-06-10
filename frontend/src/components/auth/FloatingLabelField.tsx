import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
    AUTH_FLOATING_INPUT_ERROR_CLASS,
    AUTH_FLOATING_INPUT_SHELL_CLASS,
} from "@/components/auth/authInputStyles";

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
                    AUTH_FLOATING_INPUT_SHELL_CLASS,
                    error && AUTH_FLOATING_INPUT_ERROR_CLASS,
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
                        "peer block h-12 w-full bg-transparent px-4 pb-1.5 pt-5 text-sm font-medium text-white",
                        "placeholder-transparent focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:text-zinc-500",
                        className
                    )}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                />
                <label
                    htmlFor={id}
                    className={cn(
                        "pointer-events-none absolute left-4 bg-transparent text-zinc-500 shadow-none transition-all duration-200 ease-out",
                        "peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm",
                        "peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:font-medium peer-focus:text-zinc-300",
                        (hasValue || inputProps.type === "date") &&
                            "top-1.5 translate-y-0 text-[11px] font-medium text-zinc-400"
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
