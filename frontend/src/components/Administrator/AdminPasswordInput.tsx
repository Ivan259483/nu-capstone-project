import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type AdminPasswordInputProps = {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
};

export default function AdminPasswordInput({
  value,
  onChange,
  autoComplete,
  className,
  inputClassName,
  id,
  disabled,
  placeholder,
}: AdminPasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn('ah-password-input', className)}>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        placeholder={placeholder}
        className={inputClassName}
      />
      <button
        type="button"
        className="ah-password-input-toggle"
        onClick={() => setVisible((current) => !current)}
        disabled={disabled}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={16} strokeWidth={1.75} aria-hidden /> : <Eye size={16} strokeWidth={1.75} aria-hidden />}
      </button>
    </div>
  );
}
