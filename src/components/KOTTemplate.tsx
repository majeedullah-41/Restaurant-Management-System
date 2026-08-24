import React from 'react';
import { DEFAULT_KOT_LAYOUT, type KotLayoutConfig } from '../lib/printing';

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
  restaurantName?: string;
  restaurantContact?: string;
  logoUrl?: string;
  config?: Partial<KotLayoutConfig>;
}

export const KOTTemplate = React.forwardRef<HTMLDivElement, KOTProps>((props, ref) => {
  const config: KotLayoutConfig = { ...DEFAULT_KOT_LAYOUT, ...(props.config ?? {}) };
  const zoom = Math.max(0.4, Math.min(2, (config.fontScale / 100) * (config.widthMm / 80)));

  const [datePart, ...timeParts] = props.date.split(' ');
  const timePart = timeParts.join(' ') || '';

  return (
    <div className="hidden">
      <div
        ref={ref}
        className="bg-white text-black p-2 mx-auto font-sans font-bold"
        style={{
          // 3mm narrower than the paper so rounding and printer hardware
          // margins can never clip the content at the edges.
          width: `${(config.widthMm - 3) / zoom}mm`,
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
                height: auto !important;
                min-height: 0 !important;
                max-height: none !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: visible !important;
              }
            }
          `}
        </style>

        <div className="flex items-center justify-center gap-2 mb-1 mt-1">
          {props.logoUrl && (
            <img src={props.logoUrl} alt="Logo" className="max-h-12 w-auto object-contain shrink-0" />
          )}
          <div className="text-center">
            {config.showLogo && props.restaurantName && (
              <h2 className="text-[14px] leading-none font-black uppercase mb-0.5">{props.restaurantName}</h2>
            )}
            <h1 className="text-[28px] leading-none font-black tracking-wide">KOT</h1>
            <p className="text-[11px] font-black tracking-widest">*** KITCHEN COPY ***</p>
          </div>
        </div>
        <div className="border-b border-dashed border-black mb-1"></div>

        <div className="mb-1 text-[10px] px-1 grid grid-cols-2 gap-x-2 gap-y-0.5 uppercase">
          <div><span className="font-bold">ORD:</span> {props.orderId}</div>
          {(config.showDate || config.showTime) && <div><span className="font-bold">DT:</span> {[config.showDate ? datePart : '', config.showTime ? timePart : ''].filter(Boolean).join(' ')}</div>}
          <div><span className="font-bold">TYPE:</span> {props.orderType}</div>
          {config.showTable && props.orderType === "Dine-in" && <div><span className="font-bold">TBL:</span> {props.tableNumber === "0" ? "Walk-in" : (props.tableCategoryName ? `${props.tableCategoryName.trim()} ${props.tableNumber.padStart(2, '0')}` : `Table ${props.tableNumber.padStart(2, '0')}`)}</div>}
          {config.showCashier && <div><span className="font-bold">CASHIER:</span> {props.cashierName}</div>}
          {config.showOrderTaker && props.orderTakerName && <div><span className="font-bold">TAKER:</span> {props.orderTakerName}</div>}
        </div>

        <table className="w-full text-left border-collapse border border-black mb-1">
          <thead>
            <tr className="text-[13px] border-b border-black">
              <th className="w-[80%] py-0.5 px-1 text-left font-black border-r border-black">ITEM</th>
              <th className="w-[20%] py-0.5 text-center font-black">QTY</th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {props.items.map((item, i) => (
              <tr key={i} className="border-b border-black">
                <td className="py-0.5 px-1 break-words align-top font-black border-r border-black">{item.name.toUpperCase()}</td>
                <td className="py-0.5 text-center align-top font-black">{item.printQty}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-center text-[10px] mt-1 mb-1 flex flex-col items-center">
          {config.footerMessage.trim() && (
            <p className="font-black uppercase tracking-wide">{config.footerMessage.trim()}</p>
          )}
        </div>

        <div className="text-center text-[10px] font-bold">
          <div>Software Provided by</div>
          <div>Eaglenest Creations (0346-4451505)</div>
        </div>
      </div>
    </div>
  );
});

KOTTemplate.displayName = 'KOTTemplate';
