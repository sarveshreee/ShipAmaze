import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

type OtpInputBoxesProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function OtpInputBoxes({ value, onChange, disabled, className, id }: OtpInputBoxesProps) {
  return (
    <InputOTP
      id={id}
      maxLength={6}
      value={value}
      onChange={onChange}
      disabled={disabled}
      containerClassName={cn("justify-center gap-2 sm:gap-3", className)}
      inputMode="numeric"
      autoComplete="one-time-code"
    >
      <InputOTPGroup className="gap-2 sm:gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <InputOTPSlot
            key={index}
            index={index}
            className="h-12 w-11 sm:h-14 sm:w-12 rounded-lg border-2 border-input bg-surface text-lg font-semibold font-mono shadow-sm transition-all data-[active=true]:border-primary data-[active=true]:ring-2 data-[active=true]:ring-primary/20"
          />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
