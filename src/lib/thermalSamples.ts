// Test datasets for the Thermal Simulator (docs/05 §8–§9). Pure data only —
// no rendering logic lives here; the Rust pipeline renders whatever it gets.

import type { ReceiptDocument } from "./printing";

export type ThermalKind = "receipt" | "kot" | "delivery_receipt";
export type ThermalDatasetId = "minimal" | "long_item" | "items_10" | "items_50" | "evil";

export const THERMAL_KINDS: { id: ThermalKind; label: string }[] = [
  { id: "receipt", label: "Customer Receipt" },
  { id: "kot", label: "KOT" },
  { id: "delivery_receipt", label: "Delivery Receipt" },
];

export const THERMAL_DATASETS: { id: ThermalDatasetId; label: string }[] = [
  { id: "minimal", label: "Minimal" },
  { id: "long_item", label: "Long Item" },
  { id: "items_10", label: "10 Items" },
  { id: "items_50", label: "50 Items" },
  { id: "evil", label: "Evil Receipt" },
];

const EVIL_RESTAURANT_NAME =
  "THE VERY LONG RESTAURANT NAME THAT DEFINITELY SHOULD NOT FIT";
const EVIL_ADDRESS =
  "House 123, Street 456, Main Road, Somewhere, District Swat, KPK";
const LONG_ITEM =
  "Chicken Cheese Zinger Burger With Extra Cheese And Special Sauce";
const LONG_CUSTOMER =
  "Abdul Muhsin Ibn Sattam Al Saud Al Kabir Al Aziz The Third Of His Name";

function generatedItems(count: number) {
  const names = [
    "Chicken Burger",
    "Beef Burger",
    "Large Pizza",
    "French Fries",
    "Loaded Nachos",
    "Chicken Tikka",
    "Mutton Karahi",
    "Cold Drink",
    "Mineral Water",
    "Ice Cream Cup",
  ];
  return Array.from({ length: count }, (_, i) => ({
    name:
      i < names.length ? names[i] : `${names[i % names.length]} x${Math.floor(i / names.length) + 1}`,
    price: 250 + ((i * 137) % 1500),
    quantity: 1 + (i % 3),
  }));
}

function sumItems(items: { price: number; quantity: number }[]): number {
  return items.reduce((acc, i) => acc + i.price * i.quantity, 0);
}

export function buildSampleDocument(
  kind: ThermalKind,
  dataset: ThermalDatasetId,
): ReceiptDocument {
  const evil = dataset === "evil";

  const items =
    dataset === "minimal"
      ? [
          { name: "Chicken Burger", price: 450, quantity: 2 },
          { name: "Cold Drink", price: 120, quantity: 1 },
        ]
      : dataset === "long_item"
        ? [{ name: LONG_ITEM, price: 1250, quantity: 1 }]
        : dataset === "items_10"
          ? generatedItems(10)
          : dataset === "items_50"
            ? generatedItems(50)
            : [
                { name: LONG_ITEM, price: 999999999, quantity: 2 },
                { name: "Karahi", price: 1800, quantity: 25 },
              ];

  const subtotal = evil ? 2000001818 : sumItems(items);
  const tax_rate = evil ? 0 : 5;
  const tax_amount = evil ? 0 : Math.round((subtotal * tax_rate) / 100);
  const discount = evil ? 0 : dataset === "minimal" ? 100 : 250;
  const total_amount = subtotal - discount + tax_amount;
  const amount_received = evil ? 0 : Math.ceil(total_amount / 500) * 500;
  const change_amount = evil ? 0 : amount_received - total_amount;

  return {
    kind,
    restaurant: {
      name: evil ? EVIL_RESTAURANT_NAME : "MY RESTAURANT",
      address: evil ? EVIL_ADDRESS : "Main Road, Swat",
      contact: "0345-1234567",
    },
    meta: {
      order_id: "#SIM-0001",
      date_time: "22 Aug 2026, 6:42 pm",
      order_type:
        kind === "kot" ? "Dine-in" : kind === "delivery_receipt" ? "Delivery" : "Dine-in",
      table_label: kind === "receipt" || kind === "kot" ? "A 01" : "",
      cashier_name: "Simulator",
      order_taker_name: kind === "kot" ? "Waiter Usman" : null,
    },
    customer:
      kind === "delivery_receipt"
        ? {
            name: evil ? LONG_CUSTOMER : "Ali Khan",
            phone: evil ? "+92-300-0000000000-ext-12345" : "0345-9876543",
            address: evil
              ? "House 987, Very Long Street Name That Keeps Going And Going, Sector G-13, Islamabad"
              : "Street 12, Phase 2, Swat",
          }
        : null,
    items: kind === "kot" ? items.map(i => ({ ...i, price: 0 })) : items,
    totals: {
      subtotal,
      tax_rate,
      tax_amount,
      discount,
      delivery_fee: kind === "delivery_receipt" ? (evil ? 999999999 : 150) : null,
      total_amount,
    },
    payment: { amount_received, change_amount },
  };
}
