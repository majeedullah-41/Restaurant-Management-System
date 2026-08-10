import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import { useAuth } from "../lib/auth";


import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Minus, Receipt,
  X, Trash2,
  Users, Search,
  Percent, Calculator, FileText, Printer, ChevronDown, ClipboardList, CheckCircle
} from "lucide-react";

import { ConfirmModal } from "../components/ConfirmModal";
import { AlertModal } from "../components/AlertModal";
import { useReactToPrint } from "react-to-print";
import { ReceiptTemplate } from "../components/ReceiptTemplate";
import { KOTTemplate } from "../components/KOTTemplate";

interface MenuItem { id: number; name: string; category_id: number; price: number; is_active: boolean; }
interface Category { id: number; name: string; }
interface CartItem { id: number; item_id: number; name: string; price: number; quantity: number; kot_printed_qty?: number; }
interface Customer { id: number; name: string; phone: string; visits: number; address?: string; }
interface DetailedTableStatus { id: number; table_id: number; table_number: number; status: string; active_order_id: number | null; active_order_total: number | null; elapsed_minutes: number | null; category_name: string | null; }

export default function POS() {
  const { tableId, orderId: routeOrderId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role || "Admin";
  const displayName = user?.display_name || role;
  const basePath = role === "Cashier" ? "/cashier" : "/admin";
  const returnUrl = role === "Cashier" ? "/cashier/dashboard" : "/admin/dashboard";

  // Core Data
  const receiptRef = useRef<HTMLDivElement>(null);
  const kotRef = useRef<HTMLDivElement>(null);
  const [kotPrintItems, setKotPrintItems] = useState<{name: string, printQty: number}[]>([]);
  const kotPrintTriggered = useRef(false);

  const triggerReceiptPrint = useReactToPrint({
    contentRef: receiptRef,
    onAfterPrint: () => {
      setTimeout(() => navigate(`${basePath}/pos/0`), 500);
    }
  });

  const triggerKOTPrint = useReactToPrint({
    contentRef: kotRef,
    onAfterPrint: async () => {
      kotPrintTriggered.current = false;
      try {
        await invoke("mark_kot_printed", { orderId });
        if (orderId) refreshCart(orderId);
      } catch (err) {
         console.error(err);
      }
    }
  });

  useEffect(() => {
     if (kotPrintTriggered.current && kotPrintItems.length > 0) {
       if (triggerKOTPrint) triggerKOTPrint();
     }
  }, [kotPrintItems, triggerKOTPrint]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<Set<number>>(new Set());
  const [taxRate, setTaxRate] = useState<number>(0);
  const [serviceChargeRate, setServiceChargeRate] = useState<number>(0);
  const [serviceChargeTypes, setServiceChargeTypes] = useState<string[]>(["Dine-in"]);
  const [tables, setTables] = useState<DetailedTableStatus[]>([]);
  const [posLoading, setPosLoading] = useState(true);

  useEffect(() => {
    if (tables.length > 0 && tableId && tableId !== "0") {
      const table = tables.find(t => t.table_id.toString() === tableId);
      if (table && table.category_name) {
      }
    }
  }, [tables, tableId]);

  // State
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [itemSearch, setItemSearch] = useState<string>("");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [orderType, setOrderType] = useState<string>("Dine-in");
  
  useEffect(() => {
    if (!routeOrderId || routeOrderId === "new") {
      setOrderType("Dine-in");
    }
  }, [tableId, routeOrderId]);

  const [view, setView] = useState<'payment' | 'menu'>('payment');
  const isCheckingOut = useRef(false);
  const [restaurantName, setRestaurantName] = useState("RMS");
  const [restaurantAddress, setRestaurantAddress] = useState("");
  const [restaurantContact, setRestaurantContact] = useState("");

  // Delivery State
  const [deliverySettings, setDeliverySettings] = useState({ base_delivery_fee: 0, free_delivery_threshold: 0 });
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");


  // Payment State
  const [amountReceived, setAmountReceived] = useState<string>("");
  const [orderNote, setOrderNote] = useState("");
  const [discount, setDiscount] = useState<number>(0);

  // Pending Orders State
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [showPendingDropdown, setShowPendingDropdown] = useState(false);

  // Customer State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Order Taker State
  const [orderTakers, setOrderTakers] = useState<any[]>([]);
  const [orderTakerId, setOrderTakerId] = useState<number | null>(null);
  const [orderTakerName, setOrderTakerName] = useState<string | null>(null);


  // Modal State
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean; title: string; message: string; onConfirm: () => void}>({
    isOpen: false, title: '', message: '', onConfirm: () => {}
  });
  
  const [alertModal, setAlertModal] = useState<{isOpen: boolean; title: string; message: string; type: 'danger' | 'warning' | 'info' | 'success'; buttonText?: string; onConfirm?: () => void; secondaryButtonText?: string; onSecondaryAction?: () => void}>({
    isOpen: false, title: '', message: '', type: 'danger'
  });

  const showAlert = (title: string, message: string, type: 'danger' | 'warning' | 'info' | 'success' = 'danger') => {
    setAlertModal({ isOpen: true, title, message, type });
  };

  const filteredCustomers = useMemo(() => customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  ), [customers, customerSearch]);

  const { subtotal, taxAmount, serviceChargeAmount, deliveryFee, effectiveDiscount, totalAmount, maxDiscount } = useMemo(() => {
    const sub = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = (sub * taxRate) / 100;
    const sc = serviceChargeTypes.includes(orderType) ? (sub * serviceChargeRate) / 100 : 0;
    
    const fee = orderType === "Delivery" 
      ? (deliverySettings.free_delivery_threshold > 0 && sub >= deliverySettings.free_delivery_threshold ? 0 : deliverySettings.base_delivery_fee) 
      : 0;

    // Ensure discount never exceeds payable amount
    const max = sub + tax + fee + sc;
    const eff = Math.min(discount, max);
    const total = max - eff;

    return { 
      subtotal: sub, 
      taxAmount: tax, 
      serviceChargeAmount: sc, 
      deliveryFee: fee, 
      effectiveDiscount: eff, 
      totalAmount: total,
      maxDiscount: max
    };
  }, [cartItems, taxRate, serviceChargeTypes, serviceChargeRate, orderType, deliverySettings, discount]);



  const getQuickCashSuggestions = (total: number) => {
    if (total <= 0) return [100, 500, 1000, 5000];
    const suggestions = new Set<number>();
    
    const notes = [100, 500, 1000, 5000];
    for (const note of notes) {
      const nextMultiple = Math.ceil(total / note) * note;
      if (nextMultiple >= total) {
        suggestions.add(nextMultiple);
      }
    }
    
    // Ensure we always have 4 options by adding combinations if needed
    if (suggestions.size < 4) {
      let current = Math.max(...Array.from(suggestions));
      for (const note of notes) {
          if (suggestions.size >= 4) break;
          suggestions.add(current + note);
      }
    }

    return Array.from(suggestions).slice(0, 4).sort((a, b) => a - b);
  };
  
  const quickCashOptions = getQuickCashSuggestions(totalAmount);

  const changeAmount = amountReceived ? Math.max(0, parseFloat(amountReceived) - totalAmount) : 0;

  const currentTableInfo = useMemo(
    () => tables.find((t) => t.table_id.toString() === tableId),
    [tables, tableId]
  );
  const tableCategoryName = currentTableInfo?.category_name?.trim() || undefined;
  const actualTableNumber = currentTableInfo?.table_number?.toString() || tableId || "0";


  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        document.getElementById('complete-payment-btn')?.click();
      } else if (e.key === 'Enter' && view === 'payment') {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') {
          e.preventDefault();
          document.getElementById('complete-payment-btn')?.click();
        }
      } else if (e.key === 'F10') {
        e.preventDefault();
        document.getElementById('draft-btn')?.click();
      } else if (e.key === 'F12') {
        e.preventDefault();
        document.getElementById('cancel-btn')?.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]);

  // Load everything on mount
  useEffect(() => {
    async function initializePOS() {
      if (!tableId) {
        setPosLoading(false);
        return;
      }
      setPosLoading(true);
      try {
        const cats: any = await invoke("get_categories");
        const items: any = await invoke("get_menu_items");
        const custs: any = await invoke("get_customers");
        const tbls: any = await invoke("get_detailed_table_statuses");
        setCategories(cats);
        setMenuItems(items);
        setCustomers(custs);
        setTables(tbls);

        const settings: any = await invoke("get_settings");
        setTaxRate(settings.tax_rate);
        setServiceChargeRate(settings.service_charge_rate || 0);
        setServiceChargeTypes(settings.service_charge_types ? settings.service_charge_types.split(",") : ["Dine-in"]);
        setRestaurantName(settings.restaurant_name);
        setRestaurantAddress(settings.address || "");
        setRestaurantContact(settings.contact_number || "");

        const delSettings: any = await invoke("get_delivery_settings");
        setDeliverySettings(delSettings);

        const takers: any = await invoke("get_order_takers");
        setOrderTakers(takers);

        // Default the order taker to the logged-in user when they are an order taker
        const currentName = displayName?.toLowerCase().trim();
        const selfTaker = takers.find((t: any) => (t.name || "").toLowerCase().trim() === currentName);
        if (selfTaker) {
          setOrderTakerId(selfTaker.id);
          setOrderTakerName(selfTaker.name);
        }

        const history: any = await invoke("get_order_history");
        setPendingOrders(history.filter((o: any) => o.status === 'Open' || o.status === 'Placed'));

        // Only create/fetch order for physical tables or when resuming an existing order
        if (routeOrderId && routeOrderId !== 'new') {
          // Resume specific existing order
          const order: any = await invoke("get_order_by_id", { orderId: parseInt(routeOrderId) });
          setOrderId(order.id);
          setOrderNumber(order.order_number);
          setDiscount(order.discount_amount || 0);
          if (order.order_type) setOrderType(order.order_type);
          setDeliveryPhone(order.customer_phone || "");
          setDeliveryAddress(order.delivery_address || "");
          setOrderNote(order.order_note || "");
          setSelectedCustomerId(order.customer_id || null);
          setOrderTakerId(order.order_taker_id || null);
          setOrderTakerName(order.order_taker_name || null);
          refreshCart(order.id);
        } else if (tableId !== "0") {
          // Physical table lookup — get active order (do not create one automatically)
          const order: any = await invoke("get_active_order", { tableId: parseInt(tableId!) });
          if (order) {
            setOrderId(order.id);
            setOrderNumber(order.order_number);
            setDiscount(order.discount_amount || 0);
            if (order.order_type) setOrderType(order.order_type);
            setDeliveryPhone(order.customer_phone || "");
            setDeliveryAddress(order.delivery_address || "");
            setOrderNote(order.order_note || "");
            setSelectedCustomerId(order.customer_id || null);
            setOrderTakerId(order.order_taker_id || null);
            setOrderTakerName(order.order_taker_name || null);
            refreshCart(order.id);
          } else {
            // No active order exists for this table
            setOrderId(null);
            setOrderNumber(null);
            setCartItems([]);
            setDiscount(0);
            setOrderType("Dine-in");
            setDeliveryPhone("");
            setDeliveryAddress("");
            setOrderNote("");
            setSelectedCustomerId(null);
            setOrderTakerId(selfTaker ? selfTaker.id : null);
            setOrderTakerName(selfTaker ? selfTaker.name : null);
            setAmountReceived("");
          }
        } else if (tableId === "0" && (!routeOrderId || routeOrderId === 'new')) {
          // For walk-in (table 0) with 'new' or no routeOrderId: 
          // Clear state for a fresh order. It will be created lazily when the first item is added.
          setOrderId(null);
          setOrderNumber(null);
          setCartItems([]);
          setDiscount(0);
          setOrderType("Dine-in");
          setDeliveryPhone("");
          setDeliveryAddress("");
          setOrderNote("");
          setSelectedCustomerId(null);
          setOrderTakerId(null);
          setOrderTakerName(null);
          setAmountReceived("");
        }
      } catch (err) {
        console.error("Failed to initialize POS", err);
        showAlert("Initialization Error", String(err));
        navigate(returnUrl);
      } finally {
        setPosLoading(false);
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

  const handleTableChange = async (newTableIdStr: string, overrideOrderType?: string) => {
    const newTableId = parseInt(newTableIdStr);
    const currentTableId = parseInt(tableId || "0");
    if (newTableId === currentTableId) return;
    
    const newOrderType = overrideOrderType ?? (newTableId === 0 ? "Takeaway" : "Dine-in");
    
    if (orderId) {
      try {
        await invoke("update_order_type", { orderId, orderType: newOrderType });
        await invoke("reassign_order_table", {
          orderId: orderId,
          oldTableId: currentTableId,
          newTableId: newTableId
        });
        navigate(`${basePath}/pos/${newTableId}/${orderId}${location.search}`, { replace: true });
        
        // Refresh tables list to show updated availability
        const tbls: any = await invoke("get_detailed_table_statuses");
        setTables(tbls);
      } catch (err) {
        showAlert("Error", "Failed to reassign table: " + err);
      }
    } else {
      navigate(`${basePath}/pos/${newTableId}/new${location.search}`, { replace: true });
    }
  };

  const handleAddToCart = async (item: MenuItem) => {
    // Dine-in orders require both a table and an order taker before any item
    // can be added (which is what places/creates the order).
    if (orderType === "Dine-in") {
      const tableSelected = !!tableId && tableId !== "0";
      const takerSelected = orderTakerId != null;
      const missing: string[] = [];
      if (!tableSelected) missing.push("table");
      if (!takerSelected) missing.push("order taker");
      if (missing.length > 0) {
        showAlert("Selection Required", `Please select ${missing.join(" and ")} before adding items to a dine-in order.`);
        return;
      }
    }

    setRecentlyAdded(prev => new Set(prev).add(item.id));
    setTimeout(() => {
      setRecentlyAdded(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }, 400);

    let currentOrderId = orderId;

    // Lazy order creation: create the order now if it doesn'tocurring
    if (!currentOrderId) {
      try {
        if (tableId === "0") {
          const order: any = await invoke("create_walkin_order", { 
            orderType: orderType,
            customerPhone: deliveryPhone || null,
            deliveryAddress: deliveryAddress || null
          });
          currentOrderId = order.id;
          setOrderId(order.id);
          setOrderNumber(order.order_number);
          if (order.order_type) setOrderType(order.order_type);
          // Update URL so refresh doesn't create another order
          navigate(`${basePath}/pos/0/${order.id}${location.search}`, { replace: true });
        } else {
          const order: any = await invoke("get_or_create_order", { tableId: parseInt(tableId!) });
          currentOrderId = order.id;
          setOrderId(order.id);
          setOrderNumber(order.order_number);
          if (order.order_type) setOrderType(order.order_type);
        }
      } catch (err) {
        console.error("Failed to create order", err);
        return;
      }
    }

    const activeOrderId = currentOrderId as number;
    if (orderTakerId && orderTakerName) {
      try {
        await invoke("update_order_taker", { orderId: activeOrderId, staffId: orderTakerId, staffName: orderTakerName });
      } catch (err) {
        console.error("Failed to set order taker", err);
      }
    }
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

  const saveDeliveryDraft = async (address?: string, phone?: string, custId?: number | null) => {
    if (!orderId) return;
    try {
      await invoke("update_order_delivery_draft", {
        orderId: orderId,
        deliveryAddress: address !== undefined ? address : deliveryAddress,
        customerPhone: phone !== undefined ? phone : deliveryPhone,
        customerId: custId !== undefined ? custId : selectedCustomerId
      });
    } catch (err) {
      console.error("Failed to save delivery draft", err);
    }
  };

  const handleDecrementItem = async (itemId: number) => {
    if (!orderId) return;
    try {
      await invoke("remove_item_from_order", { orderId, itemId });
      refreshCart(orderId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!orderId) return;
    try {
      await invoke("delete_item_from_order", { orderId, itemId });
      refreshCart(orderId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleIncrementItem = async (item: CartItem) => {
    if (!orderId) return;
    try {
      await invoke("add_item_to_order", {
        orderId,
        itemId: item.item_id,
        name: item.name,
        price: item.price
      });
      refreshCart(orderId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOrderTakerChange = async (staffId: string) => {
    const taker = orderTakers.find((t: any) => t.id === Number(staffId));
    setOrderTakerId(taker ? taker.id : null);
    setOrderTakerName(taker ? taker.name : null);
    if (orderId) {
      try {
        await invoke("update_order_taker", {
          orderId,
          staffId: taker ? taker.id : null,
          staffName: taker ? taker.name : null
        });
      } catch (err) {
        console.error("Failed to update order taker", err);
      }
    }
  };



  const formatAmount = (n: number) => n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handlePrint = async () => {
    if (!orderId || cartItems.length === 0) return;
    try {
      if (triggerReceiptPrint) triggerReceiptPrint();
    } catch (err) {
      console.error("Failed to generate receipt:", err);
      showAlert("Print Error", String(err));
      setTimeout(() => navigate(`${basePath}/pos/0`), 2000);
    }
  };

  const handleCheckout = async () => {
    if (!orderId || cartItems.length === 0) return;
    if (isCheckingOut.current) return;
    isCheckingOut.current = true;
    try {
      let received = amountReceived ? parseFloat(amountReceived) : totalAmount;
      if (!isFinite(received)) {
        received = totalAmount;
      }
      if (received < totalAmount - 0.009) {
        showAlert("Validation Error", `Amount received (${received.toFixed(2)}) is less than the order total (${totalAmount.toFixed(2)}).`);
        isCheckingOut.current = false;
        return;
      }

      let finalCustomerId = selectedCustomerId;

      if (customerSearch.trim() || deliveryPhone.trim()) {
        try {
          const resolvedId: any = await invoke("resolve_customer", {
            name: customerSearch.trim() || null,
            phone: deliveryPhone.trim() || null,
            address: deliveryAddress.trim() || null
          });
          finalCustomerId = resolvedId;
          setSelectedCustomerId(resolvedId);
        } catch (err) {
          console.warn("Could not resolve customer:", err);
        }
      }

      if (orderType === "Delivery") {
        if (!finalCustomerId && !deliveryPhone.trim()) {
          showAlert("Validation Error", "Please provide a phone number for delivery.");
          isCheckingOut.current = false;
          return;
        }
        if (!deliveryAddress.trim()) {
          showAlert("Validation Error", "Please enter a delivery address.");
          isCheckingOut.current = false;
          return;
        }
        await invoke("place_delivery_order", {
          orderId,
          customerId: finalCustomerId,
          deliveryAddress: deliveryAddress,
          customerPhone: deliveryPhone,
          deliveryFee: deliveryFee,
          subtotal: subtotal,
          taxAmount: taxAmount,
          discountAmount: effectiveDiscount,
          cashierName: displayName,
          orderNote: orderNote,
          serviceChargeAmount: serviceChargeAmount
        });
        await handlePrint(); // Still print receipt
        isCheckingOut.current = false;
        return;
      }

      await invoke("checkout_order", {
        orderId,
        tableId: parseInt(tableId || "0"),
        orderType: orderType,
        customerId: finalCustomerId,
        subtotal: subtotal,
        taxAmount: taxAmount,
        discountAmount: effectiveDiscount,
        amountReceived: received,
        changeDue: changeAmount,
        cashierName: displayName,
        orderNote: orderNote,
        serviceChargeAmount: serviceChargeAmount
      });
      await handlePrint();
    } catch (err) {
      showAlert("Checkout Failed", String(err));
    } finally {
      isCheckingOut.current = false;
    }
  };

  const printKotText = async (items: { name: string; printQty: number }[]) => {
    if (items.length === 0) return;
    setKotPrintItems(items);
    kotPrintTriggered.current = true;
  };

  const handlePrintKOT = async () => {
    if (cartItems.length === 0) return;

    const kotItems = cartItems
      .map(item => ({
        ...item,
        printQty: Math.max(0, item.quantity - (item.kot_printed_qty || 0))
      }))
      .filter(item => item.printQty > 0);

    if (kotItems.length === 0) {
      setAlertModal({
        isOpen: true,
        title: "KOT",
        message: "No new items to print for this order. Do you want to print the complete KOT?",
        type: "info",
        buttonText: "Yes",
        onConfirm: () => {
          setAlertModal(prev => ({ ...prev, isOpen: false }));
          printKotText(cartItems.map(item => ({ name: item.name, printQty: item.quantity })));
        },
        secondaryButtonText: "No",
        onSecondaryAction: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }

    printKotText(kotItems.map(item => ({ name: item.name, printQty: item.printQty })));
  };

  const handleCancelOrder = async () => {
    if (!orderId) return;
    setConfirmModal({
      isOpen: true,
      title: 'Cancel Order',
      message: 'Are you sure you want to cancel this order? All items will be removed.',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          await invoke("cancel_active_order", {
            orderId,
            tableId: parseInt(tableId || "0")
          });
          navigate(`${basePath}/pos/0`);
        } catch (err) {
          showAlert("Cancel Failed", "Failed to cancel order: " + err);
        }
      }
    });
  };

  // Render Left Sidebar (Navigation)


  const pendingOrdersDropdown = (
    <div className="relative w-64 z-50">
      <button 
        onClick={() => setShowPendingDropdown(!showPendingDropdown)}
        className="w-full flex items-center justify-between bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2.5 rounded-xl font-bold border border-amber-200 dark:border-amber-500/20 shadow-sm transition-colors hover:bg-amber-100 dark:hover:bg-amber-500/20"
      >
        <div className="flex items-center space-x-2">
          <ClipboardList size={18} />
          <span>{pendingOrders.length} Pending Orders</span>
        </div>
        <ChevronDown size={16} />
      </button>

      {showPendingDropdown && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Open Orders</h3>
          </div>
          <div className="max-h-72 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {pendingOrders.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No pending orders.</p>
            ) : (
              pendingOrders.map(po => (
                <button
                  key={po.id}
                  onClick={() => {
                    setShowPendingDropdown(false);
                    navigate(`${basePath}/pos/${po.table_id || 0}/${po.id}`);
                  }}
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-start justify-between transition-colors"
                >
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white block">Order #{po.order_number || po.id} - {po.table_number ? (po.table_category_name ? `${po.table_category_name.trim()} ${po.table_number}` : `Table ${po.table_number}`) : 'Walk-in'}</span>
                    <span className="text-xs text-slate-500">{po.order_type === 'Delivery' ? 'Delivery Pending' : po.status}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(po.total_price)}</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">{po.status}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Render the Menu Overlay
  const renderMenuGrid = () => (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden p-4 md:p-6 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 min-w-0">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Select Items</h2>
          {pendingOrdersDropdown}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => {
              if (tableId === "0") navigate(`${basePath}/pos/0/new`);
              else navigate(`${basePath}/dashboard`);
            }} 
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-md transition-colors text-sm"
          >
            New Order
          </button>
          <button onClick={() => setView('payment')} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center font-medium shadow-md transition-colors text-sm">
            <X size={16} className="mr-1.5" /> Close Menu
          </button>
        </div>
      </div>

      {/* Item Search */}
      <div className="relative mb-4 shrink-0">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-9 py-2 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
        />
        {itemSearch && (
          <button
            onClick={() => setItemSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Categories */}
      <div className="flex flex-wrap gap-1.5 mb-4 shrink-0">
        <button
          onClick={() => setSelectedCategoryId(null)}
          className={`px-3 py-1.5 text-[13px] rounded-lg whitespace-nowrap font-medium transition-all ${selectedCategoryId === null
            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
            : 'bg-white dark:bg-[#1E293B] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
        >
          All Items
        </button>
        {categories.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedCategoryId(c.id)}
            className={`px-3 py-1.5 text-[13px] rounded-lg whitespace-nowrap font-medium transition-all ${selectedCategoryId === c.id
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'bg-white dark:bg-[#1E293B] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Items Grid */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar pr-2 pb-10">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {menuItems
            .filter(item => (selectedCategoryId === null || item.category_id === selectedCategoryId) &&
              item.name.toLowerCase().includes(itemSearch.toLowerCase()))
            .map(item => (
              <button
                key={item.id}
                onClick={() => handleAddToCart(item)}
                disabled={!item.is_active}
                className={`border p-3 rounded-lg flex flex-col items-start justify-between text-left min-h-[5rem] transition-all duration-200 relative overflow-hidden ${
                  recentlyAdded.has(item.id)
                    ? 'ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 scale-95 shadow-inner'
                    : item.is_active 
                      ? 'bg-white dark:bg-[#1E293B] border-slate-200 dark:border-slate-800 hover:border-blue-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 group cursor-pointer shadow-sm hover:shadow-md' 
                      : 'bg-slate-50 dark:bg-[#0B1120] border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed grayscale'
                }`}
              >
                {recentlyAdded.has(item.id) && (
                  <div className="absolute top-2 right-2 text-emerald-500 animate-in zoom-in fade-in duration-200">
                    <CheckCircle size={16} />
                  </div>
                )}
                <h3 className="text-[13px] font-bold text-slate-900 dark:text-slate-200 leading-tight w-full break-words pr-5" title={item.name}>{item.name}</h3>
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/50 w-full flex items-center justify-between">
                  {item.is_active ? (
                    <span className="text-blue-600 dark:text-blue-400 font-bold text-sm">{formatCurrency(item.price)}</span>
                  ) : (
                    <span className="text-red-500 font-bold text-[10px] uppercase tracking-wider border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">Out of Stock</span>
                  )}
                  {item.is_active && (
                    <div className="w-5 h-5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus size={14} strokeWidth={2.5} />
                    </div>
                  )}
                </div>
              </button>
            ))
          }
        </div>
      </div>
    </div>
  );

  // Render Payment View (The main image reference)
  const renderPaymentView = () => (
    <div className="flex-1 flex flex-col min-w-0 p-4 md:p-6 animate-in fade-in zoom-in-95 duration-200 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-0.5">Payment</h2>
            <p className="text-slate-500 dark:text-slate-400 text-xs">Complete the order and receive payment.</p>
          </div>
          {pendingOrdersDropdown}
        </div>
        <button onClick={() => {
            if (tableId === "0") navigate(`${basePath}/pos/0/new`);
            else navigate(`${basePath}/dashboard`);
          }} 
          className="px-4 py-2 bg-[#0066FF] hover:bg-blue-700 text-white rounded-lg font-bold shadow-md transition-colors"
        >
          New Order
        </button>
      </div>

      {/* Top 4 Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 shrink-0">
        <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-[#E6F0FF] dark:bg-blue-900/20 flex items-center justify-center text-[#0066FF] dark:text-blue-400 shrink-0">
            <FileText size={20} strokeWidth={2.5} />
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Total Amount</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{formatCurrency(subtotal)}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-[#D1FAE5] dark:bg-emerald-900/20 flex items-center justify-center text-[#059669] dark:text-emerald-400 shrink-0">
            <Percent size={18} strokeWidth={2.5} />
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5 uppercase tracking-wider">Discount (Rs)</p>
            <input
              type="number"
              value={discount || ''}
              onChange={e => setDiscount(Math.max(0, Math.min(Number(e.target.value) || 0, maxDiscount)))}
              placeholder="0"
              className="w-24 bg-transparent text-right text-xl font-black text-[#059669] border-b-2 border-transparent focus:border-[#059669] focus:outline-none transition-colors"
            />
          </div>
        </div>
        <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] dark:bg-amber-900/20 flex items-center justify-center text-[#D97706] dark:text-amber-400 shrink-0">
            <Calculator size={20} strokeWidth={2.5} />
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Tax ({taxRate}%)</p>
            <p className="text-2xl font-black text-[#D97706]">{formatCurrency(taxAmount)}</p>
          </div>
        </div>
        <div className="bg-[#0066FF] border border-[#0052CC] rounded-xl p-3 flex items-center justify-between shadow-md">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center text-white shrink-0">
            <Receipt size={18} strokeWidth={2.5} />
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-blue-100 mb-0.5 uppercase tracking-wider">Payable Amount</p>
            <p className="text-xl font-black text-white leading-none">{formatCurrency(totalAmount)}</p>
          </div>
        </div>
      </div>
      {/* Receive Cash Section */}
      <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-4">
        <h3 className="text-[#0066FF] dark:text-blue-400 font-bold mb-3 flex items-center text-sm">
          Receive Cash
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <div className="bg-[#EEF2FF] dark:bg-blue-900/10 rounded-lg p-3 border border-[#C7D2FE] dark:border-blue-900/30 focus-within:border-[#0066FF] transition-colors relative h-[64px]">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-0.5">Payable Amount</p>
              <div className="flex items-center">
                <input
                  type="number"
                  value={totalAmount || ""}
                  onChange={(e) => {
                    const raw = parseFloat(e.target.value) || 0;
                    const val = Math.max(0, Math.min(raw, maxDiscount));
                    const diff = maxDiscount - val;
                    setDiscount(diff >= 0 ? diff : 0);
                  }}
                  className="bg-transparent text-lg font-bold text-[#0066FF] dark:text-blue-400 w-full focus:outline-none"
                />
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-[#0F172A] rounded-lg p-3 border border-slate-300 dark:border-slate-600 focus-within:border-[#0066FF] transition-colors relative h-[64px]">
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-0.5">Amount Received</p>
            <div className="flex items-center">
              <input
                type="number"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                placeholder="0.00"
                className="bg-transparent text-lg font-bold text-slate-900 dark:text-white w-full focus:outline-none"
              />
              <div className="text-slate-400"><Calculator size={14} /></div>
            </div>
          </div>
        <div className="bg-[#D1FAE5] dark:bg-emerald-900/10 rounded-lg p-3 border border-[#A7F3D0] dark:border-emerald-900/30 h-[64px]">
          <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-0.5">Change Amount</p>
          <div className="text-lg font-bold text-[#059669]">{formatCurrency(changeAmount)}</div>
        </div>
      </div>

        {/* Quick Cash Options below the grid */}
        <div className="flex items-center space-x-4 mb-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0 whitespace-nowrap">Quick Cash:</span>
          <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
            <button
              onClick={() => setAmountReceived(totalAmount > 0 ? String(totalAmount) : "")}
              className={`px-4 py-1.5 rounded-lg border text-xs font-bold transition-colors shrink-0 whitespace-nowrap ${amountReceived && Math.abs(parseFloat(amountReceived) - totalAmount) < 0.01
                ? 'bg-blue-50 border-[#0066FF] text-[#0066FF]'
                : 'bg-white dark:bg-[#0F172A] border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300'
                }`}
            >
              Exact
            </button>
            {quickCashOptions.map(amt => (
              <button
                key={amt}
                onClick={() => setAmountReceived(amt.toString())}
                className={`px-4 py-1.5 rounded-lg border text-xs font-bold transition-colors shrink-0 whitespace-nowrap tabular-nums ${parseFloat(amountReceived) === amt
                  ? 'bg-blue-50 border-[#0066FF] text-[#0066FF]'
                  : 'bg-white dark:bg-[#0F172A] border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300'
                  }`}
              >
                {amt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-3 mt-auto shrink-0">
        <button onClick={() => navigate(returnUrl)} className="flex-1 max-w-[150px] bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white rounded-xl py-3 flex items-center justify-center font-bold transition-colors text-sm">
          <ArrowLeft size={16} className="mr-2" /> Back
        </button>
        <button
          id="complete-payment-btn"
          onClick={handleCheckout}
          disabled={posLoading || !orderId || cartItems.length === 0}
          className="flex-1 bg-[#0066FF] hover:bg-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-3 flex items-center justify-center font-bold transition-colors relative shadow-md text-sm"
        >
          Complete Payment
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-[#0F172A] text-slate-700 dark:text-slate-300 font-sans overflow-hidden">
      <Sidebar activePage="pos" />

      <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
        {/* Top Header */}
        <Header 
          title="Point of Sale" 
          subtitle={view === 'payment' ? 'Process Payment' : 'Create a new order'} 
        />

        {/* Main Workspace */}
        <div className="flex-1 flex overflow-hidden">
          {posLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-[400px]">
              <div className="w-10 h-10 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading menu and order data...</p>
            </div>
          ) : (
            view === 'payment' ? renderPaymentView() : renderMenuGrid()
          )}

          {/* Right Sidebar - Order Summary */}
          <aside className="w-[320px] lg:w-[380px] xl:w-[420px] bg-white dark:bg-[#0B1120] border-l border-slate-200 dark:border-slate-800 flex flex-col z-10 shrink-0">
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Order Summary</h2>
                <div className="flex items-center space-x-2">
                  {/* Table Dropdown */}
                  <div className="relative">
                    <select
                      value={tableId !== "0" && tableId ? tableId : "Walk-in Customer"}
                      onChange={(e) => handleTableChange(e.target.value)}
                      className={`pl-3 pr-7 py-1.5 text-xs font-bold rounded-lg focus:outline-none cursor-pointer appearance-none shadow-sm transition-colors ${tableId !== "0" && tableId ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400 border' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-transparent'}`}
                    >
                      <option value="Walk-in Customer" disabled hidden>Walk-in Customer</option>
                      {tables.map(t => {
                          if (t.status === 'Available' || t.table_id.toString() === tableId) {
                            return <option key={t.id} value={t.table_id} className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800">{t.category_name ? `${t.category_name} ${t.table_number.toString().padStart(2, '0')}` : `Table ${t.table_number.toString().padStart(2, '0')}`}</option>
                          }
                          return null;
                      })}
                    </select>
                    <ChevronDown size={12} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${tableId !== "0" && tableId ? 'text-blue-500 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`} />
                  </div>
                  <div className="relative">
                    <select
                      value={tableId === "0" || !tableId ? orderType : "Dine-in"}
                      onChange={async (e) => {
                        const newOrderType = e.target.value;
                        if (tableId !== "0") {
                          await handleTableChange("0", newOrderType);
                        } else {
                          setOrderType(newOrderType);
                          if (orderId) await invoke("update_order_type", { orderId, orderType: newOrderType });
                        }
                      }}
                      className={`pl-3 pr-7 py-1.5 text-xs font-bold rounded-lg focus:outline-none cursor-pointer appearance-none shadow-sm transition-colors border ${tableId === "0" || !tableId ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-transparent'}`}
                    >
                      {tableId !== "0" ? (
                        <option value="Dine-in" disabled hidden>Dine-in</option>
                      ) : (
                        <option value="Dine-in" className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800">Dine-in</option>
                      )}
                      <option value="Takeaway" className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800">Takeaway</option>
                      <option value="Delivery" className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800">Delivery</option>
                    </select>
                    <ChevronDown size={12} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${tableId === "0" || !tableId ? 'text-blue-500 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`} />
                  </div>
                </div>
              </div>


              <div className="flex flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                      <Users size={18} />
                    </div>
                    <div>
                      {tableId === "0" || !tableId ? (
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Walk-in Customer</p>
                      ) : (
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Dine-in Customer</p>
                      )}
                      <p className="text-[10px] text-slate-500">Order #{orderNumber || orderId || '...'} • Type: {orderType}</p>
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <Users size={14} />
                      </div>
                      <select
                        value={orderTakerId ? String(orderTakerId) : ""}
                        onChange={(e) => handleOrderTakerChange(e.target.value)}
                        className="w-full bg-white dark:bg-[#1E293B] text-xs font-bold text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg py-2 pl-9 pr-8 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer appearance-none shadow-sm"
                      >
                        <option value="">Order Taker</option>
                        {orderTakers.map((t: any) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <ChevronDown size={14} />
                      </div>
                    </div>
                  </div>

                </div>

                <details className="mt-4 p-3 border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl group transition-all shadow-sm">
                  <summary className="flex justify-between items-center cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[11px] font-bold text-[#0066FF] dark:text-blue-400 uppercase tracking-wider hover:text-blue-700 dark:hover:text-blue-300 transition-colors select-none">
                    <span>Customer Info {orderType === "Delivery" && "(Required)"}</span>
                    <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="mt-2 space-y-3">
                    <div className="relative">
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-wider">Customer Name</label>
                      <input
                        type="text"
                        placeholder="Customer Name (or Search...)"
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
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 dark:text-slate-400 mt-2.5">
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
                            saveDeliveryDraft(undefined, undefined, null);
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
                                setCustomerSearch(c.name);
                                setDeliveryAddress(c.address || "");
                                setDeliveryPhone(c.phone || "");
                                setShowCustomerDropdown(false);
                                saveDeliveryDraft(c.address || "", c.phone || "", c.id);
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

                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-wider">Phone Number</label>
                        <input
                        type="text"
                        value={deliveryPhone}
                        onChange={(e) => setDeliveryPhone(e.target.value)}
                        onBlur={() => {
                          const exactMatch = customers.find(c => c.phone === deliveryPhone.trim());
                          if (exactMatch && !selectedCustomerId) {
                            setSelectedCustomerId(exactMatch.id);
                            setCustomerSearch(exactMatch.name);
                            if (exactMatch.address) setDeliveryAddress(exactMatch.address);
                          }
                          saveDeliveryDraft(undefined, deliveryPhone, undefined);
                        }}
                        placeholder="Enter contact number..."
                        className="w-full bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 rounded-lg p-2 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    {orderType === "Delivery" && (
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-wider">Delivery Address</label>
                        <textarea
                          value={deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          onBlur={() => saveDeliveryDraft(deliveryAddress, undefined, undefined)}
                          placeholder="Enter full delivery address..."
                          className="w-full bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 rounded-lg p-2 focus:outline-none focus:border-blue-500 transition-colors custom-scrollbar"
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </div>

            {/* Cart Items Area - Inside the scrollable container */}
            <div className="p-5 flex-1 flex flex-col">
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <table className="w-full table-fixed border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="w-6 px-1 py-2 text-center font-bold border-b border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">#</th>
                      <th className="px-2 py-2 text-left font-bold border-b border-r border-slate-200 dark:border-slate-700">Item</th>
                      <th className="w-[80px] px-1 py-2 text-center font-bold border-b border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">Qty</th>
                      <th className="w-[72px] px-2 py-2 text-right font-bold border-b border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">Total</th>
                      <th className="w-7 px-1 py-2 text-center font-bold border-b border-slate-200 dark:border-slate-700"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartItems.map((item, index) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-1 py-1.5 text-center text-slate-500 border-b border-r border-slate-200 dark:border-slate-700 tabular-nums">{index + 1}</td>
                        <td className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-slate-700">
                          <span className="block whitespace-nowrap overflow-hidden text-ellipsis text-slate-900 dark:text-white leading-tight" title={item.name}>{item.name}</span>
                        </td>
                        <td className="px-1 py-1.5 border-b border-r border-slate-200 dark:border-slate-700">
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              onClick={() => handleDecrementItem(item.item_id)}
                              className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors shrink-0"
                              title="Decrease quantity"
                            >
                              <Minus size={12} strokeWidth={2.5} />
                            </button>
                            <span className="w-7 text-center text-slate-900 dark:text-white font-bold tabular-nums">{item.quantity}</span>
                            <button
                              onClick={() => handleIncrementItem(item)}
                              className="w-6 h-6 flex items-center justify-center rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shrink-0"
                              title="Increase quantity"
                            >
                              <Plus size={12} strokeWidth={2.5} />
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold text-slate-900 dark:text-white border-b border-r border-slate-200 dark:border-slate-700 whitespace-nowrap tabular-nums">{formatAmount(item.price * item.quantity)}</td>
                        <td className="px-1 py-1.5 text-center border-b border-slate-200 dark:border-slate-700">
                          <button
                            onClick={() => handleDeleteItem(item.item_id)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/20 rounded transition-colors"
                            title="Remove item"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {cartItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-slate-500 text-xs whitespace-nowrap">
                          Cart is empty. Click "+ Add Item" to begin.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 dark:bg-slate-800">
                      <td colSpan={3} className="px-2 py-2.5 text-right font-bold uppercase tracking-wider text-[10px] text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">Total</td>
                      <td colSpan={2} className="px-2 py-2.5 text-right font-black text-slate-900 dark:text-white whitespace-nowrap tabular-nums">{formatCurrency(subtotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Discount</span>
                  <span className="text-emerald-500 whitespace-nowrap tabular-nums">- {formatCurrency(effectiveDiscount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Tax ({taxRate}%)</span>
                  <span className="text-slate-900 dark:text-white whitespace-nowrap tabular-nums">{formatCurrency(taxAmount)}</span>
                </div>
                {serviceChargeAmount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Service Charge ({serviceChargeRate}%)</span>
                    <span className="text-slate-900 dark:text-white whitespace-nowrap tabular-nums">{formatCurrency(serviceChargeAmount)}</span>
                  </div>
                )}
                {deliveryFee > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">Delivery Fee</span>
                    <span className="text-slate-900 dark:text-white whitespace-nowrap tabular-nums">{formatCurrency(deliveryFee)}</span>
                  </div>
                )}
              </div>
            </div>
            </div> {/* Close scrollable container */}

            <div className="px-5 pt-5 pb-8 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0F172A] shrink-0">
              <button
                onClick={() => setView('menu')}
                className="w-full py-2.5 mb-4 border-2 border-dashed border-[#CCE0FF] dark:border-[#0066FF]/30 text-[#0066FF] dark:text-[#3385FF] hover:bg-[#F0F5FF] dark:hover:bg-[#0066FF]/10 rounded-xl text-sm flex items-center justify-center transition-colors font-bold"
              >
                <Plus size={16} className="mr-2" strokeWidth={2.5} /> Add Item
              </button>

              <div className="flex justify-between items-end mb-4">
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Total Amount</span>
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{formatCurrency(totalAmount)}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handlePrintKOT}
                  className="py-2.5 bg-[#002B5E] hover:bg-[#001D40] text-white rounded-lg text-[11px] font-bold uppercase transition-colors flex flex-col items-center justify-center space-y-1 shadow-sm"
                >
                  <Printer size={16} strokeWidth={2} />
                  <span>Print KOT</span>
                </button>
                <button
                  id="draft-btn"
                  onClick={() => navigate(`${basePath}/pos/0`)}
                  className="py-2.5 bg-[#E6F0FF] hover:bg-[#D4E4FF] text-[#0066FF] rounded-lg text-[11px] font-bold uppercase transition-colors flex flex-col items-center justify-center space-y-1 shadow-sm"
                >
                  <FileText size={16} strokeWidth={2} />
                  <span>Hold</span>
                </button>
                <button
                  id="cancel-btn"
                  onClick={handleCancelOrder}
                  className="py-2.5 bg-[#FEE2E2] hover:bg-[#FCD5D5] text-[#EF4444] rounded-lg text-[11px] font-bold uppercase transition-colors flex flex-col items-center justify-center space-y-1 shadow-sm"
                >
                  <X size={16} strokeWidth={2.5} />
                  <span>Cancel</span>
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

      <div style={{ display: "none" }}>
        <ReceiptTemplate
          ref={receiptRef}
          restaurantName={restaurantName}
          restaurantAddress={restaurantAddress}
          orderId={orderNumber ? `#ORD-${orderNumber.toString().padStart(4, '0')}` : `#ORD-${orderId?.toString().padStart(4, '0')}`}
          orderType={orderType}
          tableNumber={actualTableNumber}
          tableCategoryName={tableCategoryName}
          date={new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString()}
          items={cartItems}
          subtotal={subtotal}
          discount={effectiveDiscount}
          taxAmount={taxAmount}
          taxRate={taxRate}
          totalAmount={totalAmount}
          amountReceived={parseFloat(amountReceived) || totalAmount}
          changeAmount={parseFloat(amountReceived) ? parseFloat(amountReceived) - totalAmount : 0}
          cashierName={displayName}
          restaurantContact={restaurantContact}
        />
        <KOTTemplate
          ref={kotRef}
          orderId={orderNumber ? `#ORD-${orderNumber.toString().padStart(4, '0')}` : `#ORD-${orderId?.toString().padStart(4, '0')}`}
          orderType={orderType}
          tableNumber={actualTableNumber}
          tableCategoryName={tableCategoryName}
          date={new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString()}
          items={kotPrintItems}
          cashierName={displayName}
          orderTakerName={orderTakerName || undefined}
        />
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        type="danger"
        confirmText="Yes, Cancel Order"
        cancelText="No, Keep It"
      />
      
      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        buttonText={alertModal.buttonText}
        onConfirm={alertModal.onConfirm}
        secondaryButtonText={alertModal.secondaryButtonText}
        onSecondaryAction={alertModal.onSecondaryAction}
        onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}



