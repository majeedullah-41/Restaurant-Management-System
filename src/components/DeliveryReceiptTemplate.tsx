import React from 'react';
import { formatCurrency } from '../lib/utils';
import { DEFAULT_DR_LAYOUT, type DeliveryReceiptLayoutConfig } from '../lib/printing';

interface DeliveryReceiptItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

interface DeliveryReceiptProps {
  restaurantName: string;
  restaurantAddress?: string;
  restaurantContact?: string;
  logoUrl?: string;
  orderId: string;
  orderType: string;
  date: string;
  items: DeliveryReceiptItem[];
  subtotal: number;
  discount: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  amountReceived: number;
  changeAmount: number;
  deliveryFee: number;
  cashierName: string;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  config?: Partial<DeliveryReceiptLayoutConfig>;
}

export const DeliveryReceiptTemplate = React.forwardRef<HTMLDivElement, DeliveryReceiptProps>((props, ref) => {
  const config: DeliveryReceiptLayoutConfig = { ...DEFAULT_DR_LAYOUT, ...(props.config ?? {}) };
  const zoom = Math.max(0.4, Math.min(2, (config.fontScale / 100) * (config.widthMm / 80)));
  const itemWidthPct = Math.max(20, Math.min(70, config.itemNameWidthPct));
  const otherPct = Math.max(10, (82 - itemWidthPct) / 2);

  const [datePart, ...timeParts] = props.date.split(' ');
  const timePart = timeParts.join(' ') || '';

  const renderCurrencyCell = (amount: number) => {
    const formatted = formatCurrency(amount);
    const parts = formatted.split(' ');
    if (parts.length >= 2) {
      const sym = parts[0];
      const val = parts.slice(1).join(' ');
      return (
        <div className="flex justify-between w-full px-1">
          <span>{sym}</span>
          <span>{val}</span>
        </div>
      );
    }
    return formatted;
  };

  const getCurrencyParts = (amount: number) => {
    const formatted = formatCurrency(amount);
    const parts = formatted.split(' ');
    return {
      sym: parts.length >= 2 ? parts[0] : '',
      val: parts.length >= 2 ? parts.slice(1).join(' ') : formatted
    };
  };

  const sub = getCurrencyParts(props.subtotal);
  const tax = getCurrencyParts(props.taxAmount);
  const disc = getCurrencyParts(props.discount);
  const fee = getCurrencyParts(props.deliveryFee);
  const tot = getCurrencyParts(props.totalAmount);
  const cash = getCurrencyParts(props.amountReceived);
  const change = getCurrencyParts(props.changeAmount);

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

        {/* Header */}
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
              {props.restaurantAddress && <p className="text-[11px] font-black uppercase tracking-wide">{props.restaurantAddress}</p>}
            </div>
          </div>
        )}
        <div className="border-b border-black mb-1"></div>

        <div className="text-center py-0.5 border-b border-black mb-1">
          <h2 className="text-[13px] font-black uppercase tracking-wide leading-none">{config.headerText}</h2>
        </div>

        {/* Order Details */}
        <div className="mb-1 text-[10px] px-1 grid grid-cols-2 gap-x-2 gap-y-0.5 uppercase">
          {config.showOrderNo && <div><span className="font-bold">ORD:</span> {props.orderId}</div>}
          {(config.showDate || config.showTime) && <div><span className="font-bold">DT:</span> {[config.showDate ? datePart : '', config.showTime ? timePart : ''].filter(Boolean).join(' ')}</div>}
          {config.showOrderType && <div><span className="font-bold">TYPE:</span> {props.orderType}</div>}
          {config.showCashier && <div><span className="font-bold">CASHIER:</span> {props.cashierName}</div>}
        </div>

        <table className="w-full text-left border-collapse border border-black mb-1">
          <thead>
            <tr className="text-[11px] border-b border-black">
              <th className="py-0.5 px-1 text-left font-black border-r border-black" style={{ width: `${itemWidthPct}%` }}>ITEM</th>
              <th className="py-0.5 text-center font-black border-r border-black" style={{ width: '15%' }}>QTY</th>
              <th className="py-0.5 text-center font-black border-r border-black" style={{ width: `${otherPct}%` }}>PRICE</th>
              <th className="py-0.5 text-center font-black" style={{ width: `${otherPct}%` }}>TOTAL</th>
            </tr>
          </thead>
          <tbody className="text-[11px]">
            {props.items.map((item, i) => (
              <tr key={i} className="border-b border-black">
                <td className="py-0.5 px-1 break-words align-top font-black border-r border-black">{item.name.toUpperCase()}</td>
                <td className="py-0.5 text-center align-top font-black border-r border-black">{item.quantity}</td>
                <td className="py-0.5 text-center align-top font-black border-r border-black">{renderCurrencyCell(item.price)}</td>
                <td className="py-0.5 text-center align-top font-black">{renderCurrencyCell(item.price * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mb-1 text-[11px] font-black">
          <div className="flex justify-between px-1">
            <span className="uppercase">SUBTOTAL</span>
            <div className="flex w-[35%] justify-between">
              <span>{sub.sym}</span>
              <span>{sub.val}</span>
            </div>
          </div>
          {config.showTax && (
            <div className="flex justify-between px-1">
              <span className="uppercase">TAX ({props.taxRate}%)</span>
              <div className="flex w-[35%] justify-between">
                <span>{tax.sym}</span>
                <span>{tax.val}</span>
              </div>
            </div>
          )}
          {config.showDiscount && props.discount > 0 && (
            <div className="flex justify-between px-1">
              <span className="uppercase">DISCOUNT</span>
              <div className="flex w-[35%] justify-between">
                <span>-{disc.sym}</span>
                <span>{disc.val}</span>
              </div>
            </div>
          )}
          {props.deliveryFee > 0 && (
            <div className="flex justify-between px-1">
              <span className="uppercase">DELIVERY FEE</span>
              <div className="flex w-[35%] justify-between">
                <span>{fee.sym}</span>
                <span>{fee.val}</span>
              </div>
            </div>
          )}
        </div>

        <div className="border-y border-black px-1 py-0.5 flex justify-between items-center text-[13px] font-black mb-1 mt-1">
          <span className="uppercase">GRAND TOTAL</span>
          <div className="flex w-[40%] justify-between">
            <span>{tot.sym}</span>
            <span>{tot.val}</span>
          </div>
        </div>

        {/* Payment */}
        {(config.showCashReceived || config.showChange) && (
          <div className="mb-1 text-[11px] font-black">
            {config.showCashReceived && (
              <div className="flex justify-between px-1">
                <span className="uppercase">CASH RECEIVED</span>
                <div className="flex w-[35%] justify-between">
                  <span>{cash.sym}</span>
                  <span>{cash.val}</span>
                </div>
              </div>
            )}
            {config.showChange && (
              <div className="flex justify-between px-1">
                <span className="uppercase">CHANGE DUE</span>
                <div className="flex w-[35%] justify-between">
                  <span>{change.sym}</span>
                  <span>{change.val}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Customer details */}
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
              {config.showDeliveryAddress && (
                <div className="mt-0.5">
                  <span className="uppercase">ADDRESS:</span>
                  <p className="uppercase break-words">{props.deliveryAddress || "NO ADDRESS PROVIDED"}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="border-b border-dashed border-black mb-1 mt-1"></div>

        {/* Footer */}
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

DeliveryReceiptTemplate.displayName = 'DeliveryReceiptTemplate';
