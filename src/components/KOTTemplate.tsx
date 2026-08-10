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
        className="w-[80mm] min-h-screen bg-white text-black p-4 text-[14px] font-mono mx-auto"
        style={{
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact'
        }}
      >
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

        <div className="flex justify-between font-bold text-[15px] mb-2 uppercase border-b border-black pb-1">
          <span className="w-3/4">Item</span>
          <span className="w-1/4 text-right">Qty</span>
        </div>

        <div className="space-y-4 mb-4">
          {props.items.map((item, i) => (
            <div key={i} className="flex justify-between items-start text-[16px] font-bold">
              <span className="w-3/4 break-words pr-2">{item.name}</span>
              <span className="w-1/4 text-right">[ {item.printQty} ]</span>
            </div>
          ))}
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
