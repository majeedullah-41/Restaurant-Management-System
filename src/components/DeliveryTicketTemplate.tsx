import React from 'react';
import { formatCurrency } from '../lib/utils';
import { DEFAULT_DELIVERY_LAYOUT, type DeliveryLayoutConfig } from '../lib/printing';

interface DeliveryTicketItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

interface DeliveryTicketProps {
  restaurantName: string;
  restaurantContact?: string;
  logoUrl?: string;
  orderId: string;
  date: string;
  driverName: string;
  items: DeliveryTicketItem[];
  totalPrice: number;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  config?: Partial<DeliveryLayoutConfig>;
}

export const DeliveryTicketTemplate = React.forwardRef<HTMLDivElement, DeliveryTicketProps>((props, ref) => {
  const config: DeliveryLayoutConfig = { ...DEFAULT_DELIVERY_LAYOUT, ...(props.config ?? {}) };
  const zoom = Math.max(0.4, Math.min(2, (config.fontScale / 100) * (config.widthMm / 80)));

  const [datePart, ...timeParts] = props.date.split(' ');
  const timePart = timeParts.join(' ') || '';

  const getCurrencyParts = (amount: number) => {
    const formatted = formatCurrency(amount);
    const parts = formatted.split(' ');
    return {
      sym: parts.length >= 2 ? parts[0] : '',
      val: parts.length >= 2 ? parts.slice(1).join(' ') : formatted
    };
  };

  const tot = getCurrencyParts(props.totalPrice);

  return (
    <div className="hidden">
      <div
        ref={ref}
        className="bg-white text-black p-2 mx-auto font-sans font-bold"
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

        {config.showLogo && (
          <div className="flex items-center justify-center gap-2 mb-0.5">
            {props.logoUrl && (
              <img src={props.logoUrl} alt="Logo" className="max-h-12 w-auto object-contain shrink-0" />
            )}
            <div className="text-center">
              <h1 className="text-[20px] leading-[1.1] font-black uppercase tracking-tighter">
                {props.restaurantName || "RESTAURANT NAME"}
              </h1>
              {props.restaurantContact && <p className="text-[11px] font-black tracking-wide">{props.restaurantContact}</p>}
            </div>
          </div>
        )}
        <div className="border-b border-black mb-1"></div>

        <div className="text-center py-0.5 border-b border-black mb-1">
          <h2 className="text-[13px] font-black uppercase tracking-wide leading-none">*** DELIVERY TICKET ***</h2>
        </div>

        <div className="mb-1 text-[10px] px-1 grid grid-cols-2 gap-x-2 gap-y-0.5 uppercase">
          <div><span className="font-bold">ORD:</span> {props.orderId}</div>
          {(config.showDate || config.showTime) && <div><span className="font-bold">DT:</span> {[config.showDate ? datePart : '', config.showTime ? timePart : ''].filter(Boolean).join(' ')}</div>}
          <div><span className="font-bold">DRIVER:</span> {props.driverName || "PENDING DISPATCH"}</div>
        </div>

        <table className="w-full text-left border-collapse border border-black mb-1">
          <thead>
            <tr className="text-[11px] border-b border-black">
              <th className="py-0.5 px-1 text-left font-black border-r border-black" style={{ width: '65%' }}>ITEM</th>
              <th className="py-0.5 text-center font-black border-r border-black" style={{ width: '15%' }}>QTY</th>
              <th className="py-0.5 text-center font-black" style={{ width: '20%' }}>TOTAL</th>
            </tr>
          </thead>
          <tbody className="text-[11px]">
            {props.items.map((item, i) => (
              <tr key={i} className="border-b border-black">
                <td className="py-0.5 px-1 break-words align-top font-black border-r border-black">{item.name.toUpperCase()}</td>
                <td className="py-0.5 text-center align-top font-black border-r border-black">{item.quantity}</td>
                <td className="py-0.5 text-center align-top font-black">{formatCurrency(item.price * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-y border-black px-1 py-0.5 flex justify-between items-center text-[13px] font-black mb-1 mt-1">
          <span className="uppercase">TOTAL AMOUNT</span>
          <div className="flex w-[40%] justify-between">
            <span>{tot.sym}</span>
            <span>{tot.val}</span>
          </div>
        </div>

        {config.showCustomerDetails && (
          <div className="mb-1">
            <div className="border-t border-dashed border-black mb-1 mt-1"></div>
            <div className="text-[11px] px-1 font-black">
              <div className="flex justify-between">
                <span className="uppercase">CUSTOMER:</span>
                <span className="uppercase text-right">{props.customerName || "WALK-IN"}</span>
              </div>
              <div className="flex justify-between">
                <span className="uppercase">PHONE:</span>
                <span className="uppercase text-right">{props.customerPhone || "N/A"}</span>
              </div>
              <div className="mt-0.5">
                <span className="uppercase">ADDRESS:</span>
                <p className="uppercase break-words">{props.deliveryAddress || "NO ADDRESS PROVIDED"}</p>
              </div>
            </div>
          </div>
        )}

        <div className="border-b border-dashed border-black mb-1 mt-1"></div>

        <div className="text-center text-[10px] mt-1 mb-1 flex flex-col items-center">
          {config.footerMessage.trim() && (
            <p className="font-black uppercase tracking-wide">{config.footerMessage.trim()}</p>
          )}
        </div>

        {config.showEndMarker && (
          <div className="text-center text-[10px] font-black tracking-widest mb-1">
            *** END OF DELIVERY TICKET ***
          </div>
        )}

        <div className="text-center text-[10px] font-bold">
          <div>Software Provided by</div>
          <div>Eaglenest Creations (0346-4451505)</div>
        </div>
      </div>
    </div>
  );
});

DeliveryTicketTemplate.displayName = 'DeliveryTicketTemplate';
