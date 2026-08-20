import { forwardRef } from 'react';
import { formatCurrency } from '../lib/utils';
import { SalaryPayout } from '../pages/payroll/types';
import { DEFAULT_RECEIPT_LAYOUT, type ReceiptLayoutConfig } from '../lib/printing';

interface PayrollSlipProps {
  payout: SalaryPayout;
  restaurantName: string;
  adminName: string;
  logoUrl?: string;
  visible?: boolean;
  config?: Partial<ReceiptLayoutConfig>;
}

const PayrollSlipTemplate = forwardRef<HTMLDivElement, PayrollSlipProps>(({ payout, restaurantName, adminName, visible, ...props }, ref) => {
  const isAdvance = payout.payout_type === 'Advance';
  const config: ReceiptLayoutConfig = { ...DEFAULT_RECEIPT_LAYOUT, ...(props.config ?? {}) };
  const zoom = Math.max(0.4, Math.min(2, (config.fontScale / 100) * (config.widthMm / 80)));

  return (
    <div className={visible ? "bg-white rounded-lg p-2 overflow-auto" : "hidden"}>
      <div
        ref={ref}
        className="bg-white text-black p-1 px-2 font-sans mx-auto"
        style={{
          width: `${config.widthMm / zoom}mm`,
          zoom,
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact'
        }}
      >
        <style type="text/css">
          {`
            @media print {
              @page {
                size: ${config.widthMm}mm auto;
                margin: 0;
              }
              html, body {
                height: max-content !important;
                min-height: 0 !important;
                margin: 0;
                padding: 0;
              }
            }
          `}
        </style>

        <div className="mb-6">
          <div className="flex items-center justify-center gap-2 mb-0.5">
            {props.logoUrl && (
              <img src={props.logoUrl} alt="Logo" className="max-h-12 w-auto object-contain shrink-0" />
            )}
            <div className="text-center">
              <h1 className="text-xl font-bold uppercase tracking-wider">{restaurantName}</h1>
            </div>
          </div>
          <div className="text-center mt-1">
            <p className="font-bold uppercase tracking-widest text-sm">
              {isAdvance ? "*** ADVANCE SLIP ***" : "*** SALARY SLIP ***"}
            </p>
          </div>
          <div className="border-b border-dashed border-black mt-4 mb-2"></div>
        </div>

        <div className="mb-4 space-y-1 text-sm font-bold">
          <div className="flex justify-between">
            <span className="uppercase">Staff:</span>
            <span className="uppercase text-right">{payout.staff_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="uppercase">Date:</span>
            <span className="text-right">{payout.date}</span>
          </div>
          <div className="flex justify-between">
            <span className="uppercase">Admin:</span>
            <span className="uppercase text-right">{adminName}</span>
          </div>
        </div>

        <div className="border-b border-dashed border-black my-3"></div>

        <div className="space-y-2 mb-4 text-sm font-bold">
          {isAdvance ? (
            <>
              <div className="flex justify-between">
                <span className="uppercase">Advance Amount:</span>
                <span className="text-right">{formatCurrency(payout.amount)}</span>
              </div>
              {payout.note && (
                <div className="mt-2 text-xs italic">
                  Note: {payout.note}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="uppercase">Base Salary:</span>
                <span className="text-right">{formatCurrency(payout.amount - payout.bonus + payout.deduction + payout.advance_deduction)}</span>
              </div>
              {payout.bonus > 0 && (
                <div className="flex justify-between">
                  <span className="uppercase">Bonus:</span>
                  <span className="text-right">+ {formatCurrency(payout.bonus)}</span>
                </div>
              )}
              {payout.deduction > 0 && (
                <div className="flex justify-between">
                  <span className="uppercase">Deductions:</span>
                  <span className="text-right">- {formatCurrency(payout.deduction)}</span>
                </div>
              )}
              {payout.advance_deduction > 0 && (
                <div className="flex justify-between">
                  <span className="uppercase">Advance Ded.:</span>
                  <span className="text-right">- {formatCurrency(payout.advance_deduction)}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-b border-dashed border-black my-3"></div>

        <div className="flex justify-between font-bold text-base mb-8">
          <span className="uppercase">{isAdvance ? "AMOUNT PAID" : "NET PAY"}</span>
          <span className="text-right">{formatCurrency(payout.amount)}</span>
        </div>

        <div className="text-center text-[10px] font-bold mt-8 border-t border-dashed border-black pt-4">
          <div>Software Provided by</div>
          <div>Eaglenest Creations (0346-4451505)</div>
        </div>
      </div>
    </div>
  );
});

PayrollSlipTemplate.displayName = 'PayrollSlipTemplate';
export default PayrollSlipTemplate;
