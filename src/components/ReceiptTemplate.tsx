import React from 'react';
import { formatCurrency } from '../lib/utils';

interface ReceiptItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

interface ReceiptProps {
  restaurantName: string;
  restaurantAddress?: string;
  orderId: string;
  orderType: string;
  tableNumber: string;
  date: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  amountReceived: number;
  changeAmount: number;
  cashierName: string;
  restaurantContact?: string;
}

export const ReceiptTemplate = React.forwardRef<HTMLDivElement, ReceiptProps>((props, ref) => {
  return (
    <div className="hidden">
      <div
        ref={ref}
        className="w-[80mm] min-h-screen bg-white text-black p-4 text-[12px] font-mono mx-auto"
        style={{
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact'
        }}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold uppercase tracking-wider mb-1">{props.restaurantName || "RESTAURANT NAME"}</h1>
          {props.restaurantContact && <p className="text-[13px] font-semibold">{props.restaurantContact}</p>}
          {props.restaurantAddress && <p className="text-[12px] mt-1">{props.restaurantAddress}</p>}
          <div className="border-b-2 border-dashed border-black mt-4 mb-2"></div>
        </div>

        {/* Order Details */}
        <div className="mb-4 space-y-1 text-[13px]">
          <div className="flex justify-between">
            <span className="font-bold uppercase">Order #:</span>
            <span>{props.orderId}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold uppercase">Date:</span>
            <span>{props.date}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold uppercase">Type:</span>
            <span className="uppercase">{props.orderType}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold uppercase">Table:</span>
            <span className="uppercase">{props.tableNumber === "0" ? "Walk-in" : `Table ${props.tableNumber.padStart(2, '0')}`}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold uppercase">Cashier:</span>
            <span className="uppercase">{props.cashierName}</span>
          </div>
        </div>

        <div className="border-b-2 border-dashed border-black my-3"></div>

        {/* Items Header */}
        <div className="flex justify-between font-bold mb-2 uppercase border-b border-black pb-1">
          <span className="w-1/2">Item</span>
          <span className="w-1/6 text-center">Qty</span>
          <span className="w-1/3 text-right">Total</span>
        </div>

        {/* Items List */}
        <div className="space-y-2 mb-3 text-[13px] font-semibold">
          {props.items.map((item, i) => (
            <div key={i} className="flex justify-between items-start">
              <span className="w-1/2 break-words pr-2">{item.name}</span>
              <span className="w-1/6 text-center">{item.quantity}</span>
              <span className="w-1/3 text-right">{formatCurrency(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        <div className="border-b-2 border-dashed border-black my-3"></div>

        {/* Totals */}
        <div className="space-y-1 mb-4 text-[13px]">
          <div className="flex justify-between font-semibold">
            <span className="uppercase">Subtotal</span>
            <span>{formatCurrency(props.subtotal)}</span>
          </div>
          {props.discount > 0 && (
            <div className="flex justify-between">
              <span className="uppercase">Discount</span>
              <span>- {formatCurrency(props.discount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="uppercase">Tax ({props.taxRate}%)</span>
            <span>{formatCurrency(props.taxAmount)}</span>
          </div>
          <div className="border-b-2 border-black my-2"></div>
          <div className="flex justify-between font-bold text-[16px] my-2">
            <span className="uppercase">Grand Total</span>
            <span>{formatCurrency(props.totalAmount)}</span>
          </div>
        </div>

        <div className="border-b-2 border-dashed border-black my-3"></div>

        {/* Payment */}
        <div className="space-y-1 mb-6 text-[13px] font-semibold">
          <div className="flex justify-between">
            <span className="uppercase">Cash Received</span>
            <span>{formatCurrency(props.amountReceived)}</span>
          </div>
          <div className="flex justify-between">
            <span className="uppercase">Change Due</span>
            <span>{formatCurrency(props.changeAmount)}</span>
          </div>
        </div>

        <div className="border-b-2 border-black mb-4"></div>

        {/* Footer */}
        <div className="text-center mt-6 mb-8 text-[13px]">
          <p className="font-bold uppercase text-[14px]">Thank you for your visit!</p>
          <p className="mt-1">Please come again.</p>
          <div className="mt-6 pt-2 border-t border-dashed border-black">
            <p className="font-bold">Software by EagleNest Creations</p>
            <p>(0346-4451505)</p>
          </div>
        </div>
      </div>
    </div>
  );
});

ReceiptTemplate.displayName = 'ReceiptTemplate';
