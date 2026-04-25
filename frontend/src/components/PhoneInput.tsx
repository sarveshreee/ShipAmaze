import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";

export const countryCodes = [
  { code: "+91", flag: "🇮🇳", name: "India", digits: 10 },
  { code: "+1", flag: "🇺🇸", name: "United States", digits: 10 },
  { code: "+44", flag: "🇬🇧", name: "United Kingdom", digits: 10 },
  { code: "+971", flag: "🇦🇪", name: "UAE", digits: 9 },
  { code: "+966", flag: "🇸🇦", name: "Saudi Arabia", digits: 9 },
  { code: "+65", flag: "🇸🇬", name: "Singapore", digits: 8 },
  { code: "+61", flag: "🇦🇺", name: "Australia", digits: 9 },
  { code: "+49", flag: "🇩🇪", name: "Germany", digits: [10, 11] as number[] },
  { code: "+33", flag: "🇫🇷", name: "France", digits: 9 },
  { code: "+81", flag: "🇯🇵", name: "Japan", digits: [10, 11] as number[] },
  { code: "+86", flag: "🇨🇳", name: "China", digits: 11 },
  { code: "+82", flag: "🇰🇷", name: "South Korea", digits: [10, 11] as number[] },
  { code: "+55", flag: "🇧🇷", name: "Brazil", digits: [10, 11] as number[] },
  { code: "+7", flag: "🇷🇺", name: "Russia", digits: 10 },
  { code: "+27", flag: "🇿🇦", name: "South Africa", digits: 9 },
  { code: "+234", flag: "🇳🇬", name: "Nigeria", digits: [10, 11] as number[] },
  { code: "+92", flag: "🇵🇰", name: "Pakistan", digits: 10 },
  { code: "+880", flag: "🇧🇩", name: "Bangladesh", digits: 10 },
  { code: "+977", flag: "🇳🇵", name: "Nepal", digits: 10 },
  { code: "+94", flag: "🇱🇰", name: "Sri Lanka", digits: 9 },
];

export function getDigitRule(code: string): { min: number; max: number; exact?: number; label: string } {
  const country = countryCodes.find(c => c.code === code);
  if (!country) return { min: 7, max: 12, label: `7–12 digits` };
  const d = country.digits;
  if (Array.isArray(d)) {
    return { min: Math.min(...d), max: Math.max(...d), label: `${Math.min(...d)}–${Math.max(...d)} digits for ${country.name} (${country.code})` };
  }
  return { min: d, max: d, exact: d, label: `exactly ${d} digits for ${country.name} (${country.code})` };
}

export function validatePhoneLength(code: string, number: string): string | null {
  if (!number) return null;
  const rule = getDigitRule(code);
  const len = number.replace(/^0+/, "").length;
  if (len < rule.min || len > rule.max) {
    return `Phone number must be ${rule.label}`;
  }
  return null;
}

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  countryCode: string;
  onCountryCodeChange: (code: string) => void;
  placeholder?: string;
  showCountrySelector?: boolean;
  error?: string;
}

export function PhoneInput({
  value,
  onChange,
  countryCode,
  onCountryCodeChange,
  placeholder = "9800000000",
  showCountrySelector = true,
  error,
}: PhoneInputProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = countryCodes.find(c => c.code === countryCode) || countryCodes[0];
  const rule = getDigitRule(countryCode);

  const filtered = countryCodes.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.code.includes(searchQuery)
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <div className="flex">
        {showCountrySelector && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 px-2.5 border border-r-0 border-border rounded-l-md bg-surface-2 text-sm shrink-0 hover:bg-surface-2/80"
          >
            <span>{selected.flag}</span>
            <span className="text-text-secondary text-xs">{selected.code}</span>
            <ChevronDown className="h-3 w-3 text-text-muted" />
          </button>
        )}
        <Input
          value={value}
          onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder={placeholder}
          className={cn(
            showCountrySelector && "rounded-l-none",
            error && "border-destructive"
          )}
          maxLength={rule.max}
        />
      </div>
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 rounded-lg border border-border bg-card shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search country..."
                className="pl-7 h-8 text-xs"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto max-h-44">
            {filtered.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onCountryCodeChange(c.code); setOpen(false); setSearchQuery(""); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2 transition-colors",
                  c.code === countryCode && "bg-primary-light"
                )}
              >
                <span>{c.flag}</span>
                <span className="text-text-primary">{c.name}</span>
                <span className="ml-auto text-text-muted text-xs">{c.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function normalizePhone(countryCode: string, number: string): string {
  return number.replace(/^0+/, "");
}
