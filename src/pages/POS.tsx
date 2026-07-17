import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const EditablePayableAmount = ({ maxDiscount, totalAmount, onDiscountChange }: { maxDiscount: number, totalAmount: number, onDiscountChange: (discount: number) => void }) => {
  const [val, setVal] = useState(totalAmount.toFixed(2));

  useEffect(() => {
    setVal(totalAmount.toFixed(2));
  }, [totalAmount]);

  return (
    <div className="flex items-center text-xl font-bold text-slate-900 dark:text-white">
      <span className="mr-1">Rs.</span>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          const parsed = parseFloat(val);
          if (isNaN(parsed) || parsed < 0) {
            setVal(totalAmount.toFixed(2));
            return;
          }
          const capped = Math.min(parsed, maxDiscount);
          onDiscountChange(maxDiscount - capped);
          setVal(capped.toFixed(2));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="bg-transparent w-full focus:outline-none"
      />
    </div>
  );
};
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Receipt,
  Search, X, Trash2, LayoutDashboard, ShoppingCart,
  ClipboardList, Users, CalendarClock, Table2, BarChart3, Settings, LogOut,
  Tag, Percent, Calculator, FileText, CalendarDays, Bell, Printer, ChevronDown, Moon, Sun
} from "lucide-react";
import { useTheme } from "../components/ThemeProvider";

interface MenuItem { id: number; name: string; category_id: number; price: number; }
interface Category { id: number; name: string; }
interface CartItem { id: number; item_id: number; name: string; price: number; quantity: number; }
interface Customer { id: number; name: string; phone: string; visits: number; }
interface Customer { id: number; name: string; phone: string; visits: number; }

export default function POS() {
  const { tableId, orderId: routeOrderId } = useParams();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const role = localStorage.getItem("userRole") || "Admin";
  const basePath = role === "Cashier" ? "/cashier" : "/admin";
  const returnUrl = role === "Cashier" ? "/cashier/dashboard" : "/admin/dashboard";

  // Core Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [taxRate, setTaxRate] = useState<number>(0);

  // State
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderType, setOrderType] = useState<string>(tableId === "0" ? "Takeaway" : "Dine-in");
  const [view, setView] = useState<'payment' | 'menu'>('payment');
  const [restaurantName, setRestaurantName] = useState("RMS");


  // Payment State
  const [amountReceived, setAmountReceived] = useState<string>("");
  const [orderNote, setOrderNote] = useState("");
  const [discount, setDiscount] = useState<number>(0);

  // Customer State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  );

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const taxAmount = (subtotal * taxRate) / 100;

  // Ensure discount never exceeds payable amount
  const maxDiscount = subtotal + taxAmount;
  const effectiveDiscount = Math.min(discount, maxDiscount);
  const totalAmount = maxDiscount - effectiveDiscount;

  // Calculate Quick Cash Options
  const roundedTotal = Math.ceil(totalAmount / 100) * 100;
  const quickCashOptions = totalAmount > 0
    ? [roundedTotal, roundedTotal + 100, roundedTotal + 200, roundedTotal + 300, roundedTotal + 400]
    : [1000, 2000, 3000, 4000, 5000];

  const changeAmount = amountReceived ? Math.max(0, parseFloat(amountReceived) - totalAmount) : 0;


  // Load everything on mount
  useEffect(() => {
    async function initializePOS() {
      if (!tableId) return;
      try {
        const cats: any = await invoke("get_categories");
        const items: any = await invoke("get_menu_items");
        const custs: any = await invoke("get_customers");
        setCategories(cats);
        setMenuItems(items);
        setCustomers(custs);

        const settings: any = await invoke("get_settings");
        setTaxRate(settings.tax_rate);
        setRestaurantName(settings.restaurant_name);

        // Only create/fetch order for physical tables or when resuming an existing order
        if (routeOrderId && routeOrderId !== 'new') {
          // Resume specific existing order
          const order: any = await invoke("get_order_by_id", { orderId: parseInt(routeOrderId) });
          setOrderId(order.id);
          setDiscount(order.discount_amount || 0);
          refreshCart(order.id);
        } else if (tableId !== "0" && !routeOrderId) {
          // Physical table lookup — get or create order
          const order: any = await invoke("get_or_create_order", { tableNumber: parseInt(tableId!) });
          setOrderId(order.id);
          setDiscount(order.discount_amount || 0);
          refreshCart(order.id);
        }
        // For walk-in (table 0) with 'new' or no routeOrderId: 
        // Don't create any order yet — it will be created lazily when the first item is added
      } catch (err) {
        console.error("Failed to initialize POS", err);
        alert(err);
        navigate(returnUrl);
      }
    }
    initializePOS();
  }, [tableId, routeOrderId]);

  const refreshCart = async (id: number) => {
    try {
      const items: any = await invoke("get_order_items", { orderId: id });
      setCartItems(items);
    } catch (err) {
      console.error("Failed to fetch cart items", err);
    }
  };

  const handleAddToCart = async (item: MenuItem) => {
    let currentOrderId = orderId;

    // Lazy order creation for walk-in: create the order now if it doesn't exist yet
    if (!currentOrderId) {
      try {
        const order: any = await invoke("create_walkin_order");
        currentOrderId = order.id;
        setOrderId(order.id);
        // Update URL so refresh doesn't create another order
        navigate(`${basePath}/pos/0/${order.id}${location.search}`, { replace: true });
      } catch (err) {
        console.error("Failed to create walk-in order", err);
        return;
      }
    }

    const activeOrderId = currentOrderId as number;
    try {
      await invoke("add_item_to_order", {
        orderId: activeOrderId,
        itemId: item.id,
        name: item.name,
        price: item.price
      });
      refreshCart(activeOrderId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveFromCart = async (itemId: number) => {
    if (!orderId) return;
    try {
      await invoke("remove_item_from_order", { orderId, itemId });
      refreshCart(orderId);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrint = async () => {
    const formattedId = `#ORD-${orderId?.toString().padStart(4, '0')}`;
    const dateStr = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();
    const tableStr = tableId === "0" ? "Walk-in" : `Table ${tableId?.padStart(2, '0')}`;
    const amtReceived = parseFloat(amountReceived) || totalAmount;
    const changeAmt = amtReceived - totalAmount;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Receipt ${formattedId}</title>
      <style>
        body { font-family: monospace; width: 80mm; margin: 0 auto; padding: 20px; font-size: 12px; color: #000; background: #fff; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .flex { display: flex; justify-content: space-between; }
        .border-b { border-bottom: 1px dashed #ccc; margin: 10px 0; }
        .items-header { font-weight: bold; margin-bottom: 5px; }
        h1 { font-size: 1.5em; margin: 0; }
        p { margin: 2px 0; }
        .mt-4 { margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="text-center">
        <h1>${restaurantName || "Restaurant Name"}</h1>
        <p>Generated via RMS POS</p>
        <div class="border-b"></div>
      </div>
      
      <div>
        <div class="flex"><span>Order #:</span><span>${formattedId}</span></div>
        <div class="flex"><span>Date:</span><span>${dateStr}</span></div>
        <div class="flex"><span>Type:</span><span>${orderType}</span></div>
        <div class="flex"><span>Table:</span><span>${tableStr}</span></div>
        <div class="flex"><span>Cashier:</span><span>Cashier</span></div>
      </div>
      
      <div class="border-b"></div>
      
      <div class="flex items-header">
        <span style="width: 50%">Item</span>
        <span style="width: 15%; text-align: center;">Qty</span>
        <span style="width: 35%; text-align: right;">Total</span>
      </div>
      
      ${cartItems.map(item => `
      <div class="flex">
        <span style="width: 50%">${item.name}</span>
        <span style="width: 15%; text-align: center;">${item.quantity}</span>
        <span style="width: 35%; text-align: right;">${(item.price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      </div>
      `).join('')}
      
      <div class="border-b"></div>
      
      <div class="flex"><span>Subtotal</span><span>Rs. ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
      ${effectiveDiscount > 0 ? `<div class="flex"><span>Discount</span><span>- Rs. ${effectiveDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>` : ''}
      <div class="flex"><span>Tax (${taxRate}%)</span><span>Rs. ${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
      
      <div class="border-b" style="border-style: solid"></div>
      <div class="flex font-bold"><span>Grand Total</span><span>Rs. ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
      <div class="border-b"></div>
      
      <div class="flex"><span>Cash Received</span><span>Rs. ${amtReceived.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
      <div class="flex"><span>Change Due</span><span>Rs. ${changeAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
      
      <div class="text-center mt-4">
        <p>Thank you for your visit!</p>
        <p>Software provided by EagleNest Creations (0346-4451505)</p>
      </div>
      <script>
        window.onload = () => { window.print(); }
      </script>
    </body>
    </html>
    `;

    try {
      await invoke("save_print_html", { filename: "rms_receipt.html", html: htmlContent });
      navigate(returnUrl);
    } catch (err) {
      console.error("Failed to generate receipt:", err);
      navigate(returnUrl);
    }
  };

  const handleCheckout = async () => {
    if (!orderId || cartItems.length === 0) return;
    try {
      await invoke("checkout_order", {
        orderId,
        tableNumber: parseInt(tableId || "0"),
        orderType: orderType,
        customerId: selectedCustomerId,
        subtotal: subtotal,
        taxAmount: taxAmount,
        discountAmount: effectiveDiscount,
        amountReceived: amountReceived ? parseFloat(amountReceived) : totalAmount,
        changeDue: changeAmount,
        cashierName: role,
        orderNote: orderNote
      });
      await handlePrint();
    } catch (err) {
      alert("Checkout failed: " + err);
    }
  };

  const handlePrintKOT = async () => {
    if (cartItems.length === 0) return;

    const formattedId = `#ORD-${orderId?.toString().padStart(4, '0')}`;
    const dateStr = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();
    const tableStr = tableId === "0" ? "Walk-in" : `Table ${tableId?.padStart(2, '0')}`;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>KOT ${formattedId}</title>
      <style>
        body { font-family: monospace; width: 80mm; margin: 0 auto; padding: 20px; font-size: 14px; color: #000; background: #fff; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .flex { display: flex; justify-content: space-between; }
        .border-b { border-bottom: 2px dashed #000; margin: 15px 0; }
        .items-header { font-weight: bold; margin-bottom: 10px; font-size: 16px; border-bottom: 1px solid #000; padding-bottom: 5px; }
        h1 { font-size: 2em; margin: 0; text-decoration: underline; }
        p { margin: 4px 0; font-size: 16px; }
        .item-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 18px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="text-center">
        <h1>KOT</h1>
        <p class="font-bold">*** KITCHEN COPY ***</p>
        <div class="border-b"></div>
      </div>
      
      <div>
        <div class="flex"><span>Order #:</span><span class="font-bold">${formattedId}</span></div>
        <div class="flex"><span>Date:</span><span>${dateStr}</span></div>
        <div class="flex"><span>Type:</span><span class="font-bold">${orderType}</span></div>
        <div class="flex"><span>Table:</span><span class="font-bold">${tableStr}</span></div>
        <div class="flex"><span>Cashier:</span><span>Cashier</span></div>
      </div>
      
      <div class="border-b"></div>
      
      <div class="flex items-header">
        <span style="width: 80%">Item</span>
        <span style="width: 20%; text-align: center;">Qty</span>
      </div>
      
      ${cartItems.map(item => `
      <div class="item-row">
        <span style="width: 80%">${item.name}</span>
        <span style="width: 20%; text-align: center;">[ ${item.quantity} ]</span>
      </div>
      `).join('')}
      
      <div class="border-b"></div>
      <div class="text-center">
        <p>End of Ticket</p>
      </div>
      <script>
        window.onload = () => { window.print(); }
      </script>
    </body>
    </html>
    `;

    try {
      await invoke("save_print_html", { filename: "rms_kot.html", html: htmlContent });
      // Do not navigate away for KOT
    } catch (err) {
      console.error("Failed to generate KOT:", err);
      alert("Failed to generate KOT");
    }
  };

  const handleCancelOrder = async () => {
    if (!orderId) return;
    if (!confirm("Are you sure you want to cancel this order? All items will be removed.")) return;
    try {
      await invoke("cancel_active_order", {
        orderId,
        tableNumber: parseInt(tableId || "0")
      });
      navigate(returnUrl);
    } catch (err) {
      alert("Failed to cancel order: " + err);
    }
  };

  // Render Left Sidebar (Navigation)


  // Render the Menu Overlay
  const renderMenuGrid = () => (
    <div className="flex-1 flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Select Items</h2>
        <button onClick={() => setView('payment')} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center font-medium shadow-md transition-colors">
          <X size={18} className="mr-2" /> Close Menu
        </button>
      </div>

      {/* Categories */}
      <div className="flex space-x-3 overflow-x-auto pb-2 mb-6 custom-scrollbar shrink-0">
        <button
          onClick={() => setSelectedCategoryId(null)}
          className={`px-5 py-2.5 rounded-xl whitespace-nowrap font-medium transition-all ${selectedCategoryId === null
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
            : 'bg-white dark:bg-[#1E293B] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
        >
          All Items
        </button>
        {categories.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedCategoryId(c.id)}
            className={`px-5 py-2.5 rounded-xl whitespace-nowrap font-medium transition-all ${selectedCategoryId === c.id
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'bg-white dark:bg-[#1E293B] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Items Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
          {menuItems
            .filter(item => selectedCategoryId === null || item.category_id === selectedCategoryId)
            .map(item => (
              <button
                key={item.id}
                onClick={() => handleAddToCart(item)}
                className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 p-4 rounded-2xl flex flex-col items-center justify-center text-center transition-all hover:-translate-y-1 group"
              >
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full mb-3 flex items-center justify-center text-slate-500 group-hover:bg-blue-500/10 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  <Tag size={24} />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 mb-1 leading-tight">{item.name}</h3>
                <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">Rs. {item.price}</span>
              </button>
            ))
          }
        </div>
      </div>
    </div>
  );

  // Render Payment View (The main image reference)
  const renderPaymentView = () => (
    <div className="flex-1 flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto custom-scrollbar">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Payment</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Complete the order and receive payment.</p>
      </div>

      {/* Top 4 Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6 shrink-0">
        <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between">
          <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
            <FileText size={20} />
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total Amount</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">Rs. {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between">
          <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <Percent size={20} />
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Discount (Rs)</p>
            <input
              type="number"
              value={discount || ''}
              onChange={e => setDiscount(Number(e.target.value))}
              placeholder="0"
              className="w-20 bg-transparent text-right text-lg font-bold text-emerald-500 border-b border-slate-200 dark:border-slate-700 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
        <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between">
          <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
            <Calculator size={20} />
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Tax ({taxRate}%)</p>
            <p className="text-lg font-bold text-purple-400">Rs. {taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between">
          <div className="w-12 h-12 rounded-lg bg-blue-500 flex items-center justify-center text-slate-900 dark:text-white">
            <Receipt size={20} />
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Payable Amount</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">Rs. {maxDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      {/* Receive Cash Section */}
      <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-6 mb-6">
        <h3 className="text-slate-900 dark:text-white font-bold mb-4">Receive Cash</h3>

        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="bg-slate-50 dark:bg-[#0F172A] rounded-lg p-4 border border-blue-500/30 focus-within:border-blue-500 transition-colors">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Payable Amount</p>
            <EditablePayableAmount
              maxDiscount={maxDiscount}
              totalAmount={totalAmount}
              onDiscountChange={(d) => setDiscount(d)}
            />
          </div>
          <div className="bg-slate-50 dark:bg-[#0F172A] rounded-lg p-4 border border-blue-500/30 focus-within:border-blue-500 transition-colors">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Amount Received</p>
            <input
              type="text"
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
              placeholder="0.00"
              className="bg-transparent text-xl font-bold text-slate-900 dark:text-white w-full focus:outline-none"
            />
          </div>
          <div className="bg-slate-50 dark:bg-[#0F172A] rounded-lg p-4 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Change Amount</p>
            <p className="text-xl font-bold text-emerald-500">Rs. {changeAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {quickCashOptions.map(amt => (
            <button
              key={amt}
              onClick={() => setAmountReceived(amt.toString())}
              className={`py-3 rounded-lg border text-sm font-bold transition-colors ${parseFloat(amountReceived) === amt
                ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-500 text-slate-700 dark:text-slate-300'
                }`}
            >
              Rs. {amt.toLocaleString()}
            </button>
          ))}
        </div>
      </div>



      {/* Action Buttons */}
      <div className="flex space-x-4 mt-auto shrink-0">
        <button onClick={() => navigate(returnUrl)} className="flex-1 max-w-[200px] bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white rounded-xl py-4 flex items-center justify-center font-bold transition-colors">
          <ArrowLeft size={18} className="mr-2" /> Back
        </button>
        <button
          onClick={handleCheckout}
          disabled={!orderId || cartItems.length === 0}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 dark:text-white rounded-xl py-4 flex items-center justify-center font-bold transition-colors relative"
        >
          <span className="absolute right-4 text-xs bg-blue-800 px-2 py-1 rounded">F9</span>
          Complete Payment
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-[#0F172A] text-slate-700 dark:text-slate-300 font-sans overflow-hidden">
      <Sidebar activePage="pos" />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Header */}
        <Header 
          title="Point of Sale" 
          subtitle={view === 'payment' ? 'Process Payment' : 'Create a new order'} 
        />

        {/* Main Workspace */}
        <div className="flex-1 flex overflow-hidden">
          {view === 'payment' ? renderPaymentView() : renderMenuGrid()}

          {/* Right Sidebar - Order Summary */}
          <aside className="w-[360px] bg-white dark:bg-[#0B1120] border-l border-slate-200 dark:border-slate-800 flex flex-col z-10 shrink-0">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Order Summary</h2>
                <div className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400 text-[10px] rounded-lg">
                  {tableId === '0' ? 'Walk-in' : `Table ${tableId?.padStart(2, '0')}`}
                </div>
              </div>

              <div className="flex flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                      <Users size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{orderType === 'Takeaway' ? 'Walk-in Customer' : 'Dine-in Customer'}</p>
                      <p className="text-[10px] text-slate-500">Order #{orderId || '...'} • Type: {orderType}</p>
                    </div>
                  </div>

                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800/50">
                  <div className="relative">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search or Select Customer..."
                        value={customerSearch}
                        onChange={e => {
                          setCustomerSearch(e.target.value);
                          setShowCustomerDropdown(true);
                          if (!e.target.value) {
                            setSelectedCustomerId(null);
                          }
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                        className="w-full bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 rounded-lg p-2 pr-8 focus:outline-none focus:border-blue-500 transition-colors cursor-text"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 dark:text-slate-400">
                        <ChevronDown size={14} />
                      </div>
                    </div>

                    {showCustomerDropdown && (
                      <div className="absolute z-50 w-full mt-1 max-h-40 overflow-y-auto bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl custom-scrollbar">
                        <div
                          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700/50"
                          onClick={() => {
                            setSelectedCustomerId(null);
                            setCustomerSearch("");
                            setShowCustomerDropdown(false);
                          }}
                        >
                          Guest (No Customer)
                        </div>
                        {filteredCustomers.length === 0 ? (
                          <div className="p-2 text-xs text-slate-500 dark:text-slate-400">No customers found</div>
                        ) : (
                          filteredCustomers.map(c => (
                            <div
                              key={c.id}
                              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs text-slate-900 dark:text-white"
                              onClick={() => {
                                setSelectedCustomerId(c.id);
                                setCustomerSearch(`${c.name} (${c.phone}) - ${c.visits} Visits`);
                                setShowCustomerDropdown(false);
                              }}
                            >
                              {c.name} <span className="text-slate-500 dark:text-slate-400">({c.phone})</span> - <span className="text-blue-400">{c.visits} Visits</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {selectedCustomerId && (() => {
                    const customer = customers.find(c => c.id === selectedCustomerId);
                    return customer ? (
                      <p className="text-[10px] text-blue-400 mt-1">
                        <Users size={10} className="inline mr-1" />
                        {customer.visits > 5 ? 'Loyal Customer!' : 'Returning Customer'} ({customer.visits} Visits)
                      </p>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
              <div className="grid grid-cols-12 gap-2 text-[10px] text-slate-500 uppercase tracking-wider mb-3 px-2">
                <div className="col-span-1">#</div>
                <div className="col-span-5">Item Name</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-2 text-right">Price</div>
                <div className="col-span-2 text-right">Total</div>
              </div>

              <div className="space-y-3 mb-4">
                {cartItems.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center text-xs group">
                    <div className="col-span-1 text-slate-500">{index + 1}</div>
                    <div className="col-span-5 flex items-center space-x-2">
                      <div className="w-6 h-6 rounded bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <Tag size={12} className="text-slate-500" />
                      </div>
                      <span className="text-slate-900 dark:text-white truncate">{item.name}</span>
                    </div>
                    <div className="col-span-2 text-center text-slate-900 dark:text-white">{item.quantity}</div>
                    <div className="col-span-2 text-right text-slate-500 dark:text-slate-400">{(item.price).toLocaleString()}</div>
                    <div className="col-span-2 text-right text-slate-900 dark:text-white font-bold">{(item.price * item.quantity).toLocaleString()}</div>

                    {/* Hover delete button (absolute positioned to not mess up grid) */}
                    <button
                      onClick={() => handleRemoveFromCart(item.item_id)}
                      className="absolute right-8 p-1.5 bg-red-500/90 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {cartItems.length === 0 && (
                  <div className="text-center py-6 text-slate-500 text-sm">
                    Cart is empty. Click "+ Add Item" to begin.
                  </div>
                )}
              </div>

              <button
                onClick={() => setView('menu')}
                className="w-full py-3 border border-blue-900/50 text-blue-500 hover:bg-blue-900/20 rounded-xl text-sm flex items-center justify-center transition-colors font-medium mb-6"
              >
                <Plus size={16} className="mr-2" /> Add Item
              </button>

              <div className="space-y-3 pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                  <span className="text-slate-900 dark:text-white">Rs. {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Discount</span>
                  <span className="text-emerald-500">- Rs. {effectiveDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Tax ({taxRate}%)</span>
                  <span className="text-slate-900 dark:text-white">Rs. {taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0F172A]">
              <div className="flex justify-between items-end mb-5">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Total Amount</span>
                <span className="text-2xl font-bold text-slate-900 dark:text-white">Rs. {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex space-x-2 mt-4">
                <button
                  onClick={handlePrintKOT}
                  className="flex-1 py-3 bg-blue-900 border border-blue-700 hover:bg-blue-800 text-blue-100 rounded-xl text-sm font-medium transition-colors flex items-center justify-center relative"
                >
                  <Printer size={16} className="mr-2" /> Print KOT
                </button>
                <button
                  onClick={() => navigate(returnUrl)}
                  className="flex-1 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium transition-colors flex items-center justify-center relative"
                >
                  <span className="absolute right-2 top-2 text-[10px] bg-slate-100 dark:bg-slate-900 px-1.5 rounded text-slate-500">F10</span>
                  <FileText size={16} className="mr-2" /> Draft
                </button>
                <button
                  onClick={handleCancelOrder}
                  className="flex-1 py-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-500 rounded-xl text-sm font-medium transition-colors flex items-center justify-center relative"
                >
                  <span className="absolute right-2 top-2 text-[10px] bg-red-100 dark:bg-red-950 px-1.5 rounded text-red-600 dark:text-red-700">F12</span>
                  <Trash2 size={16} className="mr-2" /> Cancel
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #475569; }
      `}</style>
    </div>
  );
}

// NavItem Helper Component
function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all ${active
        ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
        : "text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-200"
        }`}
    >
      {icon}
      <span className="font-medium text-sm">{label}</span>
    </button>
  );
}
