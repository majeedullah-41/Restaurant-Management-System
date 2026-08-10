import React from 'react';

interface KOTItem {
  name: string;
  printQty: number;
}

interface KOTProps {
  orderId: string;
  orderType: string;
  tableNumber: string;
  tableCategoryName?: string;
  date: string;
  items: KOTItem[];
  cashierName: string;
  orderTakerName?: string;
}

export const KOTTemplate = React.forwardRef<HTMLDivElement, KOTProps>((props, ref) => {
  return (
    <div className="hidden">
      <div
        ref={ref}
        className="w-[80mm] bg-white text-black p-2 text-[14px] font-mono mx-auto"
        style={{
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact'
        }}
      >
        <style type="text/css">
          {`
            @media print {
              @page {
                size: 80mm auto;
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
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold uppercase tracking-widest">KOT</h1>
          <p className="font-bold uppercase tracking-widest mt-1">*** KITCHEN COPY ***</p>
          <div className="border-b-2 border-dashed border-black mt-4 mb-2"></div>
        </div>

        <div className="mb-4 space-y-1 text-[13px]">
          <div className="flex justify-between">
            <span className="font-bold uppercase">Order #:</span>
            <span>{props.orderId}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">Date:</span>
            <span>{props.date}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">Type:</span>
            <span>{props.orderType}</span>
          </div>
          {props.orderType === "Dine-in" && (
            <div className="flex justify-between">
              <span className="font-bold">Table:</span>
              <span>{props.tableNumber === "0" ? "Walk-in" : (props.tableCategoryName ? `${props.tableCategoryName.trim()} ${props.tableNumber.padStart(2, '0')}` : `Table ${props.tableNumber.padStart(2, '0')}`)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="font-bold">Cashier:</span>
            <span>{props.cashierName}</span>
          </div>
          {props.orderTakerName && (
            <div className="flex justify-between">
              <span className="font-bold uppercase">Order Taker:</span>
              <span className="uppercase">{props.orderTakerName}</span>
            </div>
          )}
        </div>

        <div className="border-b-2 border-dashed border-black my-3"></div>

        <div className="border border-slate-200 rounded-sm overflow-hidden mb-4 mt-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-[12px] uppercase tracking-wider text-slate-600">
                <th className="w-6 px-1 py-1.5 text-center font-bold border-b border-r border-slate-200">#</th>
                <th className="px-2 py-1.5 font-bold border-b border-r border-slate-200">Item</th>
                <th className="w-1/4 px-2 py-1.5 font-bold border-b border-slate-200 text-center">Qty</th>
              </tr>
            </thead>
            <tbody className="text-[14px] font-bold text-slate-900">
              {props.items.map((item, i) => (
                <tr key={i} className="border-b border-slate-200 last:border-b-0">
                  <td className="px-1 py-2 text-center text-slate-500 border-r border-slate-200 font-normal">{i + 1}</td>
                  <td className="px-2 py-2 break-words align-top border-r border-slate-200">{item.name}</td>
                  <td className="px-2 py-2 text-center align-top whitespace-nowrap">{item.printQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-b-2 border-dashed border-black my-4"></div>

        <div className="text-center text-[13px] font-bold uppercase mt-6 mb-8">
          <p>End of Ticket</p>
        </div>
      </div>
    </div>
  );
});

KOTTemplate.displayName = 'KOTTemplate';
