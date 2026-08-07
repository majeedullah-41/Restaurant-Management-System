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
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold mb-1">{props.restaurantName || "Restaurant Name"}</h1>
          <p className="text-[10px] text-gray-600">Bypass Mingora Swat</p>
          <div className="border-b-2 border-dashed border-gray-300 my-4"></div>
        </div>

        {/* Order Details */}
        <div className="mb-4 space-y-1">
          <div className="flex justify-between">
            <span className="font-bold">Order #:</span>
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
          <div className="flex justify-between">
            <span className="font-bold">Table:</span>
            <span>{props.tableNumber === "0" ? "Walk-in" : `Table ${props.tableNumber.padStart(2, '0')}`}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold">Cashier:</span>
            <span>{props.cashierName}</span>
          </div>
        </div>

        <div className="border-b-2 border-dashed border-gray-300 my-4"></div>

        {/* Items Header */}
        <div className="flex justify-between font-bold mb-2">
          <span className="w-1/2">Item</span>
          <span className="w-1/6 text-center">Qty</span>
          <span className="w-1/3 text-right">Total</span>
        </div>

        {/* Items List */}
        <div className="space-y-2 mb-4">
          {props.items.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span className="w-1/2 break-words pr-2">{item.name}</span>
              <span className="w-1/6 text-center">{item.quantity}</span>
              <span className="w-1/3 text-right">{formatCurrency(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        <div className="border-b-2 border-dashed border-gray-300 my-4"></div>

        {/* Totals */}
        <div className="space-y-1 mb-4">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCurrency(props.subtotal)}</span>
          </div>
          {props.discount > 0 && (
            <div className="flex justify-between text-gray-700">
              <span>Discount</span>
              <span>- {formatCurrency(props.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-700">
            <span>Tax ({props.taxRate}%)</span>
            <span>{formatCurrency(props.taxAmount)}</span>
          </div>
          <div className="border-b border-gray-300 my-2"></div>
          <div className="flex justify-between font-bold text-sm">
            <span>Grand Total</span>
            <span>{formatCurrency(props.totalAmount)}</span>
          </div>
        </div>

        <div className="border-b-2 border-dashed border-gray-300 my-4"></div>

        {/* Payment */}
        <div className="space-y-1 mb-6">
          <div className="flex justify-between">
            <span>Cash Received</span>
            <span>{formatCurrency(props.amountReceived)}</span>
          </div>
          <div className="flex justify-between">
            <span>Change Due</span>
            <span>{formatCurrency(props.changeAmount)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-gray-500 mt-8 mb-4">
          <p>Thank you for your visit!</p>
          <p>Please come again.</p>
        </div>
      </div>
    </div>
  );
});

ReceiptTemplate.displayName = 'ReceiptTemplate';
