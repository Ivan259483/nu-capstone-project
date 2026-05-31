import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  REGISTER_COUNTRY_DIALS,
  REGISTER_PHONE_PRIORITY_ISO,
  type RegisterCountryDial,
} from "@/lib/countries-dial-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

function orderedCountries(): { priority: RegisterCountryDial[]; rest: RegisterCountryDial[] } {
  const byIso = new Map(REGISTER_COUNTRY_DIALS.map((c) => [c.iso, c]));
  const priority = REGISTER_PHONE_PRIORITY_ISO.map((iso) => byIso.get(iso)).filter(
    (c): c is RegisterCountryDial => Boolean(c)
  );
  const prioritySet = new Set(REGISTER_PHONE_PRIORITY_ISO as readonly string[]);
  const rest = REGISTER_COUNTRY_DIALS.filter((c) => !prioritySet.has(c.iso));
  return { priority, rest };
}

type Props = {
  countryIso: string;
  onCountryIsoChange: (iso: string) => void;
  nationalDigits: string;
  onNationalDigitsChange: (value: string) => void;
  hasError?: boolean;
  nationalInputId?: string;
  /** Renders borderless inside a parent field shell (e.g. manual register floating layout). */
  embedded?: boolean;
  /** Override placeholder; pass "" when the parent already shows a floating label. */
  placeholder?: string;
};

export function RegisterPhoneField({
  countryIso,
  onCountryIsoChange,
  nationalDigits,
  onNationalDigitsChange,
  hasError,
  nationalInputId,
  embedded = false,
  placeholder: placeholderProp,
}: Props) {
  const [open, setOpen] = useState(false);
  const { priority, rest } = useMemo(() => orderedCountries(), []);

  const selected = REGISTER_COUNTRY_DIALS.find((c) => c.iso === countryIso) ?? REGISTER_COUNTRY_DIALS[0];
  const isPh = selected.dial === "63";
  const placeholder =
    placeholderProp !== undefined ? placeholderProp : isPh ? "9XXXXXXXXX" : "Phone number";

  const onNationalChange = (raw: string) => {
    let digits = raw.replace(/\D/g, "");
    if (isPh) {
      if (digits.startsWith("0")) digits = digits.slice(1);
      digits = digits.slice(0, 10);
    } else {
      digits = digits.slice(0, 15);
    }
    onNationalDigitsChange(digits);
  };

  const popoverSurface =
    "border-border bg-[#1A1A2E] text-white shadow-lg p-0 w-[min(100vw-2rem,320px)] overflow-hidden";

  return (
    <div
      className={cn(
        "flex w-full transition-colors duration-200",
        embedded
          ? "min-h-0 items-center gap-2 rounded-none border-0 bg-transparent shadow-none focus-within:ring-0"
          : cn(
              "min-h-10 rounded-md border border-input bg-muted/40",
              "focus-within:border-primary/70 focus-within:ring-1 focus-within:ring-inset focus-within:ring-primary/30",
              hasError && "border-red-500/80 focus-within:border-red-500/80 focus-within:ring-red-500/20"
            )
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {embedded ? (
            <button
              type="button"
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 border-0 bg-transparent p-0",
                "text-sm font-medium tabular-nums text-white shadow-none outline-none",
                "hover:text-orange-300 focus-visible:text-orange-300",
                "focus-visible:ring-0 focus-visible:ring-offset-0"
              )}
              aria-label="Country code"
            >
              <span>+{selected.dial}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/50" />
            </button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "h-auto min-h-10 shrink-0 rounded-none rounded-l-md border-0 border-r border-border",
                "bg-transparent px-2.5 py-2 font-normal text-foreground hover:bg-white/5",
                "focus-visible:ring-0 focus-visible:ring-offset-0"
              )}
              aria-label="Country code"
            >
              <span className="text-sm tabular-nums font-medium">+{selected.dial}</span>
              <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-70" />
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent align="start" className={popoverSurface} sideOffset={6}>
          <Command
            className={cn(
              "bg-[#1A1A2E] text-white rounded-lg",
              "[&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-white/10",
              "[&_[cmdk-item][data-selected=true]]:bg-white/15 [&_[cmdk-item][data-selected=true]]:text-white",
              "[&_[cmdk-group-heading]]:text-white/50"
            )}
          >
            <CommandInput
              placeholder="Search country..."
              className="h-11 border-0 text-white placeholder:text-white/40"
            />
            <CommandList className="max-h-[280px]">
              <CommandEmpty className="py-6 text-white/60">No country found.</CommandEmpty>
              <CommandGroup>
                {priority.map((c) => (
                  <CommandItem
                    key={c.iso}
                    value={`${c.name} ${c.iso} +${c.dial}`}
                    onSelect={() => {
                      onCountryIsoChange(c.iso);
                      setOpen(false);
                    }}
                    className="gap-2 text-white aria-selected:bg-white/15"
                  >
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="tabular-nums text-white/80">+{c.dial}</span>
                    {c.iso === countryIso ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator className="bg-white/15" />
              <CommandGroup>
                {rest.map((c) => (
                  <CommandItem
                    key={c.iso}
                    value={`${c.name} ${c.iso} +${c.dial}`}
                    onSelect={() => {
                      onCountryIsoChange(c.iso);
                      setOpen(false);
                    }}
                    className="gap-2 text-white aria-selected:bg-white/15"
                  >
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="tabular-nums text-white/80">+{c.dial}</span>
                    {c.iso === countryIso ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        id={nationalInputId}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={nationalDigits}
        onChange={(e) => onNationalChange(e.target.value)}
        placeholder={placeholder}
        aria-label={
          placeholder === "" ? (isPh ? "Mobile number, 10 digits" : "Phone number") : undefined
        }
        className={cn(
          "flex-1 rounded-none border-0 bg-transparent text-sm font-medium text-white shadow-none",
          "focus-visible:ring-0 focus-visible:ring-offset-0",
          "placeholder:text-white/35",
          embedded
            ? "h-auto min-h-0 min-w-0 flex-1 border-0 py-0 pl-0 pr-0 shadow-none"
            : "min-h-10 rounded-r-md placeholder:text-muted-foreground"
        )}
      />
    </div>
  );
}
