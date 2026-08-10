import { forwardRef } from 'react';

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string | number;
  onChange: (value: string) => void;
  maxDecimals?: number;
}

function formatWithCommas(raw: string, maxDecimals: number): string {
  const [intRaw, ...decParts] = raw.split('.');
  const int = (intRaw ?? '').replace(/\D/g, '');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = decParts.join('').replace(/\D/g, '').slice(0, maxDecimals);
  if (raw.includes('.')) return dec ? `${intFmt}.${dec}` : `${intFmt}.`;
  return intFmt;
}

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, maxDecimals = 2, className, ...rest },
  ref
) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^0-9.]/g, '');
    const firstDot = raw.indexOf('.');
    if (firstDot !== -1) {
      raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
    }
    onChange(raw);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="decimal"
      value={formatWithCommas(String(value), maxDecimals)}
      onChange={handleChange}
      className={className}
      {...rest}
    />
  );
});
