import { forwardRef } from 'react';
import { formatCurrency } from '../lib/utils';
import { SalaryPayout } from '../pages/payroll/types';
interface PayrollSlipProps {
  payout: SalaryPayout;
  restaurantName: string;
  adminName: string;
  visible?: boolean;
}

const PayrollSlipTemplate = forwardRef<HTMLDivElement, PayrollSlipProps>(({ payout, restaurantName, adminName, visible }, ref) => {
  const isAdvance = payout.payout_type === 'Advance';

  return (
    <div className={visible ? "bg-white rounded-lg p-2" : "hidden"}>
      <div
        ref={ref}
        className={visible ? "w-[80mm] bg-white text-black p-4 text-[14px] font-mono mx-auto" : "w-[80mm] min-h-screen bg-white text-black p-4 text-[14px] font-mono mx-auto"}
        style={{
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact'
        }}
      >
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-wider">{restaurantName}</h1>
          <p className="font-bold uppercase tracking-widest mt-1">
            {isAdvance ? "*** ADVANCE SLIP ***" : "*** SALARY SLIP ***"}
          </p>
          <div className="border-b-2 border-dashed border-black mt-4 mb-2"></div>
        </div>

        <div className="mb-4 space-y-1 text-[13px]">
          <div className="flex justify-between">
            <span className="font-bold uppercase">Staff:</span>
            <span className="uppercase">{payout.staff_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold uppercase">Date:</span>
            <span>{payout.date}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold uppercase">Admin:</span>
            <span className="uppercase">{adminName}</span>
          </div>
        </div>

        <div className="border-b-2 border-dashed border-black my-3"></div>

        <div className="space-y-2 mb-4 text-[14px]">
          {isAdvance ? (
            <>
              <div className="flex justify-between font-bold">
                <span className="uppercase">Advance Amount:</span>
                <span>{formatCurrency(payout.amount)}</span>
              </div>
              {payout.note && (
                <div className="mt-2 text-[12px] italic">
                  Note: {payout.note}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="uppercase">Base Salary:</span>
                <span>{formatCurrency(payout.amount - payout.bonus + payout.deduction + payout.advance_deduction)}</span>
              </div>
              {payout.bonus > 0 && (
                <div className="flex justify-between">
                  <span className="uppercase">Bonus:</span>
                  <span>+ {formatCurrency(payout.bonus)}</span>
                </div>
              )}
              {payout.deduction > 0 && (
                <div className="flex justify-between">
                  <span className="uppercase">Deductions:</span>
                  <span>- {formatCurrency(payout.deduction)}</span>
                </div>
              )}
              {payout.advance_deduction > 0 && (
                <div className="flex justify-between">
                  <span className="uppercase">Advance Ded.:</span>
                  <span>- {formatCurrency(payout.advance_deduction)}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-b-2 border-dashed border-black my-3"></div>

        <div className="flex justify-between font-bold text-[18px] mb-8">
          <span className="uppercase">{isAdvance ? "AMOUNT PAID" : "NET PAY"}</span>
          <span>{formatCurrency(payout.amount)}</span>
        </div>

        <div className="space-y-10 mt-10">
          <div className="flex justify-between items-end border-b border-black pb-1">
            <span className="uppercase text-[12px] font-bold">Employer Sig.</span>
          </div>
          <div className="flex justify-between items-end border-b border-black pb-1">
            <span className="uppercase text-[12px] font-bold">Employee Sig.</span>
          </div>
        </div>

        <div className="text-center text-[10px] font-bold uppercase mt-8 border-t-2 border-dashed border-black pt-4">
          <p>Software by EagleNest Creations</p>
        </div>
      </div>
    </div>
  );
});

PayrollSlipTemplate.displayName = 'PayrollSlipTemplate';
export default PayrollSlipTemplate;
