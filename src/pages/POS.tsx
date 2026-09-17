import { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import { useAuth } from "../lib/auth";


import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { useParams, useNavigate } from "react-router-dom";
import {
  Plus, Minus,
  X, Trash2,
  Users, Search,
  FileText, Printer, ChevronDown, ClipboardList, CheckCircle, Table2, ArrowUpDown
} from "lucide-react";

import { ConfirmModal } from "../components/ConfirmModal";
import { AlertModal } from "../components/AlertModal";
import { ReceiptTemplate } from "../components/ReceiptTemplate";
import { KOTTemplate } from "../components/KOTTemplate";
import { DeliveryReceiptTemplate } from "../components/DeliveryReceiptTemplate";
import {
  loadPrintSettings,
  printTicketDocument,
  assetFileUrl,
  buildReceiptText,
  buildKotText,
  buildDeliveryReceiptText,
  DEFAULT_PRINT_SETTINGS,
  type PrintSettings,
  type ReceiptDocument,
} from "../lib/printing";

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<Set<number>>(new Set());
  const [taxRate, setTaxRate] = useState<number>(0);
  const [serviceChargeRate, setServiceChargeRate] = useState<number>(0);
  const [serviceChargeTypes, setServiceChargeTypes] = useState<string[]>(["Dine-in"]);
  const [requireTableDinein, setRequireTableDinein] = useState(true);
  const [requireTakerDinein, setRequireTakerDinein] = useState(true);
  const [requireTakerOther, setRequireTakerOther] = useState(false);
  const [requirePhoneDelivery, setRequirePhoneDelivery] = useState(true);
  const [requireAddressDelivery, setRequireAddressDelivery] = useState(true);
  const [autoAssignTaker, setAutoAssignTaker] = useState(true);
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
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc' | 'name_asc' | 'name_desc'>('default');
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [orderType, setOrderType] = useState<string>("Dine-in");
  
  useEffect(() => {
    if (!routeOrderId || routeOrderId === "new") {
      setOrderType("Dine-in");
    }
  }, [tableId, routeOrderId]);


  const isCheckingOut = useRef(false);
  const [restaurantName, setRestaurantName] = useState("RMS");
  const [restaurantAddress, setRestaurantAddress] = useState("");
  const [restaurantContact, setRestaurantContact] = useState("");
  const [restaurantLogo, setRestaurantLogo] = useState<string | null>(null);
  const [printSettings, setPrintSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);

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

  // Dine-in Conversion State (walk-in -> Dine-in uses the Table dropdown)
  const tableSelectTables = useMemo(() =>
    tables.filter(t => t.status === 'Available' || (tableId !== "0" && tableId && t.table_id === parseInt(tableId))),
    [tables, tableId]
  );

  const filteredCustomers = useMemo(() => customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  ), [customers, customerSearch]);

  const sortedMenuItems = useMemo(() => {
    const filtered = menuItems.filter(item =>
      (selectedCategoryId === null || item.category_id === selectedCategoryId) &&
      item.name.toLowerCase().includes(itemSearch.toLowerCase())
    );
    switch (sortBy) {
      case 'price_asc': return [...filtered].sort((a, b) => a.price - b.price);
      case 'price_desc': return [...filtered].sort((a, b) => b.price - a.price);
      case 'name_asc': return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
      case 'name_desc': return [...filtered].sort((a, b) => b.name.localeCompare(a.name));
      default: return filtered;
    }
  }, [menuItems, selectedCategoryId, itemSearch, sortBy]);

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


  const changeAmount = amountReceived ? Math.max(0, parseFloat(amountReceived) - totalAmount) : 0;

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
      } else if (e.key === 'Enter') {
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
  }, []);

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
        setRestaurantLogo(settings.logo_path || null);
        setRequireTableDinein(settings.require_table_dinein !== false);
        setRequireTakerDinein(settings.require_taker_dinein !== false);
        setRequireTakerOther(settings.require_taker_other === true);
        setRequirePhoneDelivery(settings.require_phone_delivery !== false);
        setRequireAddressDelivery(settings.require_address_delivery !== false);
        setAutoAssignTaker(settings.auto_assign_taker !== false);

        const pSettings = await loadPrintSettings();
        setPrintSettings(pSettings);

        const delSettings: any = await invoke("get_delivery_settings");
        setDeliverySettings(delSettings);

        const takers: any = await invoke("get_order_takers");
        setOrderTakers(takers);

        // Default the order taker to the logged-in user when they are an order taker
        const currentName = displayName?.toLowerCase().trim();
        const selfTaker = takers.find((t: any) => (t.name || "").toLowerCase().trim() === currentName);
        if (selfTaker && autoAssignTaker) {
          setOrderTakerId(selfTaker.id);
          setOrderTakerName(selfTaker.name);
        }

        const history: any = await invoke("get_order_history");
        setPendingOrders(history.filter((o: any) => o.status === 'Open' || (o.status === 'Placed' && o.order_type !== 'Delivery')));

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
            setOrderTakerId(autoAssignTaker && selfTaker ? selfTaker.id : null);
            setOrderTakerName(autoAssignTaker && selfTaker ? selfTaker.name : null);
            // Restore the order taker carried over from a previous screen (e.g., walk-in -> table)
            try {
              const savedTaker = sessionStorage.getItem("pos_selected_taker");
              if (savedTaker) {
                const parsed = JSON.parse(savedTaker);
                if (parsed && parsed.id) {
                  setOrderTakerId(parsed.id);
                  setOrderTakerName(parsed.name || null);
                }
              }
            } finally {
              sessionStorage.removeItem("pos_selected_taker");
            }
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
      // Carry the selected order taker over to the new table screen so it isn't lost on re-init
      if (orderTakerId && orderTakerName) {
        sessionStorage.setItem("pos_selected_taker", JSON.stringify({ id: orderTakerId, name: orderTakerName }));
      }
      navigate(`${basePath}/pos/${newTableId}/new${location.search}`, { replace: true });
    }
  };

  const handleOrderTypeChange = (newOrderType: string) => {
    // An order that is already placed must confirm before changing its type.
    const applyChange = () => {
      if (tableId !== "0" && tableId) {
        handleTableChange("0", newOrderType);
        return;
      }
      setOrderType(newOrderType);
      if (orderId) invoke("update_order_type", { orderId, orderType: newOrderType });
    };

    if (!orderId) {
      applyChange();
      return;
    }

    const currentType = tableId !== "0" && tableId ? "Dine-in" : orderType;
    const message =
      currentType === "Dine-in"
        ? `This order is a Dine-in order. Changing the order type to ${newOrderType} will move it to walk-in. Are you sure you want to continue?`
        : `This order has already been placed as ${currentType}. Changing the order type to ${newOrderType} may affect how it is processed. Are you sure you want to continue?`;

    setAlertModal({
      isOpen: true,
      title: "Change Order Type",
      message,
      type: "warning",
      buttonText: "Yes, Change",
      onConfirm: () => {
        setAlertModal(prev => ({ ...prev, isOpen: false }));
        applyChange();
      },
      secondaryButtonText: "No",
      onSecondaryAction: () => setAlertModal(prev => ({ ...prev, isOpen: false }))
    });
  };

  const handleAddToCart = async (item: MenuItem) => {
    // Dine-in orders may require both a table and an order taker before any
    // item can be added (which is what places/creates the order). These
    // requirements are configurable in Settings > General > Order Entry.
    const missing: string[] = [];
    if (orderType === "Dine-in") {
      if (requireTableDinein && (!tableId || tableId === "0")) missing.push("table");
      if (requireTakerDinein && orderTakerId == null) missing.push("order taker");
    } else if (requireTakerOther && orderTakerId == null) {
      missing.push("order taker");
    }
    if (missing.length > 0) {
      const label = orderType === "Dine-in" ? "a dine-in order" : `a ${orderType.toLowerCase()} order`;
      showAlert("Selection Required", `Please select ${missing.join(" and ")} before adding items to ${label}.`);
      return;
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

  const formattedOrderNumber = orderNumber
    ? `#ORD-${orderNumber.toString().padStart(4, '0')}`
    : `#ORD-${orderId?.toString().padStart(4, '0')}`;

  const ticketTableLabel = [tableCategoryName, actualTableNumber].filter(Boolean).join(" ") || "-";

  const handlePrint = async () => {
    if (!orderId || cartItems.length === 0) return;
    try {
      const dateStr = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
      const items = cartItems.map(({ name, price, quantity }) => ({ name, price, quantity }));
      const received = parseFloat(amountReceived) || totalAmount;
      const change = parseFloat(amountReceived) ? parseFloat(amountReceived) - totalAmount : 0;
      const logoUrl = assetFileUrl(restaurantLogo);

      if (orderType === "Delivery") {
        const customerName = selectedCustomerId
          ? customers.find(c => c.id === selectedCustomerId)?.name || null
          : customerSearch.trim() || null;
        const text = buildDeliveryReceiptText(
          {
            restaurantName,
            restaurantAddress: restaurantAddress || undefined,
            restaurantContact: restaurantContact || undefined,
            orderId: formattedOrderNumber,
            orderType,
            date: dateStr,
            items,
            cashierName: displayName,
            subtotal,
            taxRate,
            taxAmount,
            discount: effectiveDiscount,
            totalAmount,
            amountReceived: received,
            changeAmount: change,
            deliveryFee,
            customerName,
            customerPhone: deliveryPhone.trim() || null,
            deliveryAddress: deliveryAddress.trim() || null,
          },
          printSettings.deliveryReceiptLayout
        );
        const doc: ReceiptDocument = {
          kind: "delivery_receipt",
          restaurant: { name: restaurantName, address: restaurantAddress || null, contact: restaurantContact || null },
          meta: { order_id: formattedOrderNumber, date_time: dateStr, order_type: orderType, table_label: "", cashier_name: displayName },
          customer: { name: customerName, phone: deliveryPhone.trim() || null, address: deliveryAddress.trim() || null },
          items,
          totals: { subtotal, tax_rate: taxRate, tax_amount: taxAmount, discount: effectiveDiscount, delivery_fee: deliveryFee, total_amount: totalAmount },
          payment: { amount_received: received, change_amount: change },
        };
        const element = (
          <DeliveryReceiptTemplate
            restaurantName={restaurantName}
            restaurantAddress={restaurantAddress || undefined}
            restaurantContact={restaurantContact || undefined}
            logoUrl={logoUrl}
            orderId={formattedOrderNumber}
            orderType={orderType}
            date={dateStr}
            items={cartItems}
            subtotal={subtotal}
            discount={effectiveDiscount}
            taxAmount={taxAmount}
            taxRate={taxRate}
            totalAmount={totalAmount}
            amountReceived={received}
            changeAmount={change}
            deliveryFee={deliveryFee}
            cashierName={displayName}
            customerName={customerName}
            customerPhone={deliveryPhone.trim() || null}
            deliveryAddress={deliveryAddress.trim() || null}
            config={printSettings.deliveryReceiptLayout}
          />
        );
        await printTicketDocument("delivery_receipt", element, doc, text, printSettings);
      } else {
        const text = buildReceiptText(
          {
            restaurantName,
            restaurantAddress: restaurantAddress || undefined,
            restaurantContact: restaurantContact || undefined,
            orderId: formattedOrderNumber,
            orderType,
            tableLabel: ticketTableLabel,
            date: dateStr,
            items,
            cashierName: displayName,
            orderTakerName: orderTakerName || undefined,
            subtotal,
            taxRate,
            taxAmount,
            discount: effectiveDiscount,
            totalAmount,
            amountReceived: received,
            changeAmount: change,
          },
          printSettings.receiptLayout
        );
        const doc: ReceiptDocument = {
          kind: "receipt",
          restaurant: { name: restaurantName, address: restaurantAddress || null, contact: restaurantContact || null },
          meta: { order_id: formattedOrderNumber, date_time: dateStr, order_type: orderType, table_label: ticketTableLabel, cashier_name: displayName, order_taker_name: orderTakerName || null },
          items,
          totals: { subtotal, tax_rate: taxRate, tax_amount: taxAmount, discount: effectiveDiscount, total_amount: totalAmount },
          payment: { amount_received: received, change_amount: change },
        };
        const element = (
          <ReceiptTemplate
            restaurantName={restaurantName}
            restaurantAddress={restaurantAddress || undefined}
            restaurantContact={restaurantContact || undefined}
            logoUrl={logoUrl}
            orderId={formattedOrderNumber}
            orderType={orderType}
            tableNumber={actualTableNumber}
            tableCategoryName={tableCategoryName}
            date={dateStr}
            items={cartItems}
            subtotal={subtotal}
            discount={effectiveDiscount}
            taxAmount={taxAmount}
            taxRate={taxRate}
            totalAmount={totalAmount}
            amountReceived={received}
            changeAmount={change}
            cashierName={displayName}
            orderTakerName={orderTakerName || undefined}
            config={printSettings.receiptLayout}
          />
        );
        await printTicketDocument("receipt", element, doc, text, printSettings);
      }
    } catch (err) {
      console.error("Failed to generate receipt:", err);
      showAlert("Print Error", String(err));
    } finally {
      setTimeout(() => navigate(`${basePath}/pos/0`), 500);
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
        if (requirePhoneDelivery && !finalCustomerId && !deliveryPhone.trim()) {
          showAlert("Validation Error", "Please provide a phone number for delivery.");
          isCheckingOut.current = false;
          return;
        }
        if (requireAddressDelivery && !deliveryAddress.trim()) {
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
    if (!orderId || items.length === 0) return;
    try {
      const dateStr = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
      const text = buildKotText(
        {
          restaurantName,
          restaurantContact: restaurantContact || undefined,
          orderId: formattedOrderNumber,
          orderType,
          tableLabel: ticketTableLabel,
          date: dateStr,
          items,
          cashierName: displayName,
          orderTakerName: orderTakerName || undefined,
        },
        printSettings.kotLayout
      );
      const doc: ReceiptDocument = {
        kind: "kot",
        restaurant: { name: restaurantName, contact: restaurantContact || null },
        meta: {
          order_id: formattedOrderNumber,
          date_time: dateStr,
          order_type: orderType,
          table_label: ticketTableLabel,
          cashier_name: displayName,
          order_taker_name: orderTakerName || null,
        },
        items: items.map(i => ({ name: i.name, price: 0, quantity: i.printQty })),
        totals: { subtotal: 0, tax_rate: 0, tax_amount: 0, discount: 0, total_amount: 0 },
        payment: { amount_received: 0, change_amount: 0 },
      };
      const element = (
        <KOTTemplate
          orderId={formattedOrderNumber}
          orderType={orderType}
          tableNumber={actualTableNumber}
          tableCategoryName={tableCategoryName}
          date={dateStr}
          items={items}
          cashierName={displayName}
          orderTakerName={orderTakerName || undefined}
          restaurantName={restaurantName}
          restaurantContact={restaurantContact || undefined}
          logoUrl={assetFileUrl(restaurantLogo)}
          config={printSettings.kotLayout}
        />
      );
      await printTicketDocument("kot", element, doc, text, printSettings);
      await invoke("mark_kot_printed", { orderId });
      refreshCart(orderId);
      navigate(`${basePath}/pos/0`);
    } catch (err) {
      console.error(err);
      showAlert("KOT Print Failed", String(err));
    }
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
        className="flex items-center justify-between bg-white dark:bg-[#1E293B] text-orange-500 dark:text-orange-400 px-3 py-1.5 rounded-lg font-bold border border-orange-200 dark:border-orange-900/50 shadow-sm transition-colors hover:bg-orange-50 dark:hover:bg-orange-900/30 text-xs"
      >
        <div className="flex items-center space-x-2 mr-3">
          <ClipboardList size={14} className="text-orange-500 dark:text-orange-400" />
          <span>{pendingOrders.length} Pending Orders</span>
        </div>
        <ChevronDown size={12} className="text-orange-400 dark:text-orange-500" />
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
                    <span className="text-xs text-slate-500">{po.order_type || 'Dine-in'} · {po.order_type === 'Delivery' && po.status === 'Placed' ? 'Delivery Pending' : po.status}</span>
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
  const getPastelColor = (id: number) => {
    const colors = [
      'bg-blue-100',
      'bg-amber-100',
      'bg-emerald-100',
      'bg-rose-100',
      'bg-purple-100',
      'bg-indigo-100'
    ];
    return colors[id % colors.length];
  };

  const renderMenuGrid = () => (
    <div className="flex-[3] min-w-0 flex flex-col overflow-hidden p-3 bg-slate-50 dark:bg-[#0F172A]">
      <div className="relative flex items-center justify-center gap-3 mb-2.5 shrink-0 z-30">
        {pendingOrdersDropdown}
        <button onClick={() => navigate(`${basePath}/pos/0/new`)} 
          className="px-4 py-1.5 bg-emerald-500 text-white rounded-lg font-bold shadow-sm transition-colors text-xs hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 whitespace-nowrap"
        >
          New Order
        </button>
      </div>

      {/* Item Search */}
      <div className="relative mb-3 shrink-0">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          id="pos-search-bar"
          type="text"
          value={itemSearch}
          onChange={(e) => setItemSearch(e.target.value)}
          placeholder="Search items (or type barcode...)"
          className="w-full bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-8 py-2 focus:outline-none focus:border-[#0066FF] transition-all shadow-sm"
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
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap font-bold transition-all ${selectedCategoryId === null
              ? 'bg-[#0066FF] text-white shadow-md shadow-blue-500/20'
              : 'bg-white dark:bg-[#1E293B] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
          >
            All Items
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCategoryId(c.id)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap font-bold transition-all ${selectedCategoryId === c.id
                ? 'bg-[#0066FF] text-white shadow-md shadow-blue-500/20'
                : 'bg-white dark:bg-[#1E293B] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="relative shrink-0">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className={`pl-7 pr-6 py-1.5 text-[10px] font-bold rounded-lg focus:outline-none cursor-pointer appearance-none shadow-sm transition-colors border bg-white dark:bg-[#1E293B] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800`}
            title="Sort items"
          >
            <option value="default">Sort: Default</option>
            <option value="name_asc">Name A-Z</option>
            <option value="name_desc">Name Z-A</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
          <ArrowUpDown size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
        </div>
      </div>

      {/* Items Grid */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar pr-1.5 pb-3">
        <div className="grid grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2">
          {sortedMenuItems
            .map(item => (
              <button
                key={item.id}
                onClick={() => handleAddToCart(item)}
                disabled={!item.is_active}
                className={`p-2 rounded-xl flex flex-col items-start justify-between text-left h-[86px] transition-all duration-200 relative overflow-hidden ${
                  recentlyAdded.has(item.id)
                    ? 'ring-2 ring-emerald-500 bg-emerald-100 dark:bg-emerald-900/40 scale-95 shadow-inner'
                    : item.is_active 
                      ? `${getPastelColor(item.id)} dark:bg-[#1E293B] hover:shadow-md group cursor-pointer border border-slate-200 dark:border-slate-700 hover:border-[#0066FF]/30` 
                      : 'bg-slate-100 dark:bg-[#0B1120] opacity-60 cursor-not-allowed grayscale'
                }`}
              >
                {recentlyAdded.has(item.id) && (
                  <div className="absolute top-2 right-2 text-emerald-600 animate-in zoom-in fade-in duration-200">
                    <CheckCircle size={14} />
                  </div>
                )}
                <h3 className="text-[13.5px] font-bold text-slate-900 dark:text-white leading-tight w-full pr-5 line-clamp-2">{item.name}</h3>
                <div className="w-full flex items-end justify-between mt-auto">
                  {item.is_active ? (
                    <div />
                  ) : (
                    <span className="text-red-500 font-bold text-[9px] uppercase tracking-wider bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full mb-1">Out of Stock</span>
                  )}
                  {item.is_active && !recentlyAdded.has(item.id) && (
                    <div className="w-5 h-5 rounded-full bg-white/60 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-white group-hover:bg-white dark:group-hover:bg-white/20 transition-colors shadow-sm shrink-0">
                      <Plus size={12} strokeWidth={2.5} />
                    </div>
                  )}
                </div>
              </button>
            ))
          }
        </div>
      </div>
      
      {/* Footer Info Banner */}
      <div className="mt-2.5 flex items-center space-x-2 text-blue-600 dark:text-blue-400 text-xs p-2 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg">
        <div className="w-4 h-4 rounded-full border border-blue-600 flex items-center justify-center shrink-0">
          <span className="text-[9px] font-bold font-serif italic">i</span>
        </div>
        <p>Select items from the menu to add to the order. Click on an item in the order summary to modify.</p>
      </div>
    </div>
  );



  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-[#0F172A] text-slate-700 dark:text-slate-300 font-sans overflow-hidden">
      <Sidebar activePage="pos" collapsed />

      <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
        <Header 
          title="Point of Sale" 
          subtitle="Create New Order" 
          icon={<ClipboardList size={28} />}
          alwaysShowMenu={true}
        />

        {/* Main Workspace */}
        <div className="flex-1 flex overflow-hidden">
          {posLoading ? (
            <div className="flex-[3] flex flex-col items-center justify-center gap-4 min-h-[400px]">
              <div className="w-10 h-10 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading menu and order data...</p>
            </div>
          ) : (
            renderMenuGrid()
          )}

          {/* Right Sidebar - Order Summary */}
          <aside className="flex-[2] min-w-0 bg-white dark:bg-[#0B1120] border-l border-slate-200 dark:border-slate-800 flex flex-col z-10">
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
              <div className="p-3 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Order Summary</h2>
                    {orderId ? (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{formattedOrderNumber}</span>
                    ) : null}
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="relative">
                      <select
                        value={tableId === "0" || !tableId ? orderType : "Dine-in"}
                        onChange={(e) => handleOrderTypeChange(e.target.value)}
                        className={`pl-2.5 pr-6 py-1.5 text-[11px] font-bold rounded-lg focus:outline-none cursor-pointer appearance-none shadow-sm transition-colors border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/50 dark:hover:bg-blue-900/40`}
                      >
                        {tableId !== "0" ? (
                          <option value="Dine-in" disabled hidden className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Dine-in</option>
                        ) : (
                          <option value="Dine-in" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Dine-in</option>
                        )}
                        <option value="Takeaway" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Takeaway</option>
                        <option value="Delivery" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Delivery</option>
                      </select>
                      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-blue-500 dark:text-blue-400" />
                    </div>
                    <div className="relative">
                      <select
                        value={orderTakerId ? String(orderTakerId) : ""}
                        onChange={(e) => handleOrderTakerChange(e.target.value)}
                        className={`pl-7 pr-6 py-1.5 text-[11px] font-bold rounded-lg focus:outline-none cursor-pointer appearance-none shadow-sm transition-colors border bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800/50 dark:hover:bg-purple-900/40 w-[105px]`}
                      >
                        <option value="" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Order Taker</option>
                        {orderTakers.map((t: any) => (
                          <option key={t.id} value={t.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <Users size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-purple-500 dark:text-purple-400" />
                      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-purple-500 dark:text-purple-400" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] uppercase font-bold text-slate-500 shrink-0">Table</span>
                  <div className="relative flex-1">
                    <select
                      value={tableId !== "0" && tableId ? String(tableId) : ""}
                      onChange={(e) => { if (e.target.value) handleTableChange(e.target.value, "Dine-in"); }}
                      className={`w-full pl-7 pr-6 py-1.5 text-[11px] font-bold rounded-lg focus:outline-none cursor-pointer appearance-none shadow-sm transition-colors border bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50 dark:hover:bg-emerald-900/40`}
                    >
                      <option value="" disabled className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                        {tableId !== "0" && tableId ? "Table Assigned" : orderType === "Dine-in" ? "Select a Table" : "Select a Table (Dine-in)"}
                      </option>
                      {tableSelectTables.length === 0 && (
                        <option value="" disabled className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">No available tables</option>
                      )}
                      {tableSelectTables.map(t => (
                        <option key={t.id} value={t.table_id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                          {t.category_name ? `${t.category_name.trim()} ${t.table_number}` : `Table ${t.table_number}`}
                        </option>
                      ))}
                    </select>
                    <Table2 size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-500 dark:text-emerald-400" />
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-500 dark:text-emerald-400" />
                  </div>
                </div>

                <details className="p-2.5 border border-rose-200 dark:border-rose-900/30 bg-rose-50/50 dark:bg-rose-900/10 rounded-lg group transition-all shadow-sm mb-3">
                  <summary className="flex justify-between items-center cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider hover:text-rose-700 dark:hover:text-rose-300 transition-colors select-none">
                    <span>Customer Info {orderType === "Delivery" && (requirePhoneDelivery || requireAddressDelivery) && "(Required)"}</span>
                    <ChevronDown size={13} className="group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div className="relative">
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
                        className="w-full bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 pr-7 focus:outline-none focus:border-[#0066FF] transition-colors cursor-text"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ChevronDown size={12} />
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
                      placeholder="Phone Number"
                      className="w-full bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 focus:outline-none focus:border-[#0066FF] transition-colors"
                    />
                    {orderType === "Delivery" && (
                      <textarea
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        onBlur={() => saveDeliveryDraft(deliveryAddress, undefined, undefined)}
                        placeholder="Delivery Address"
                        className="w-full bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 focus:outline-none focus:border-[#0066FF] transition-colors custom-scrollbar"
                        rows={2}
                      />
                    )}
                  </div>
                </details>

                <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
                  <table className="w-full table-fixed border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <th className="w-10 px-2 py-3 text-center font-bold border-r border-slate-200 dark:border-slate-700">#</th>
                        <th className="px-3 py-3 text-left font-bold border-r border-slate-200 dark:border-slate-700">ITEM</th>
                        <th className="w-[110px] px-2 py-3 text-center font-bold border-r border-slate-200 dark:border-slate-700">QTY</th>
                        <th className="w-[90px] px-2 py-3 text-center font-bold border-r border-slate-200 dark:border-slate-700">TOTAL</th>
                        <th className="w-10 px-2 py-3 text-center font-bold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cartItems.map((item, index) => (
                        <tr key={item.id} className="border-b border-slate-200 dark:border-slate-800 last:border-b-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-2 py-1.5 text-center text-slate-700 dark:text-slate-300 font-bold border-r border-slate-200 dark:border-slate-800">{index + 1}</td>
                          <td className="px-3 py-1.5 border-r border-slate-200 dark:border-slate-800">
                            <span className="block whitespace-nowrap overflow-hidden text-ellipsis text-slate-800 dark:text-slate-200 font-medium" title={item.name}>{item.name}</span>
                          </td>
                          <td className="px-2 py-1.5 border-r border-slate-200 dark:border-slate-800">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleDecrementItem(item.item_id)}
                                className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                              >
                                <Minus size={14} />
                              </button>
                              <span className="w-4 text-center text-slate-900 dark:text-white font-bold">{item.quantity}</span>
                              <button
                                onClick={() => handleIncrementItem(item)}
                                className="w-6 h-6 flex items-center justify-center rounded bg-blue-50 dark:bg-blue-900/30 text-[#0066FF] dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-center font-bold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-800">Rs. {formatAmount(item.price * item.quantity)}</td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              onClick={() => handleDeleteItem(item.item_id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors inline-flex items-center justify-center"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {cartItems.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm italic bg-slate-50/50 dark:bg-transparent">
                            No items added to order yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-2.5 space-y-2 px-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Subtotal</span>
                    <span className="text-slate-900 dark:text-white font-bold">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Tax ({taxRate}%)</span>
                    <span className="text-slate-900 dark:text-white font-bold">{formatCurrency(taxAmount)}</span>
                  </div>
                  {serviceChargeAmount > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Service ({serviceChargeRate}%)</span>
                      <span className="text-slate-900 dark:text-white font-bold">{formatCurrency(serviceChargeAmount)}</span>
                    </div>
                  )}
                  {deliveryFee > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Delivery</span>
                      <span className="text-slate-900 dark:text-white font-bold">{formatCurrency(deliveryFee)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1120] shrink-0 space-y-3">
              <div className="flex justify-between items-center px-1">
                <span className="text-base font-bold text-slate-900 dark:text-white">Total Amount</span>
                <span className="text-xl font-black text-slate-900 dark:text-white">{formatCurrency(totalAmount)}</span>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide shrink-0">Quick Cash</span>
                <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
                  {quickCashOptions.map(amt => (
                    <button
                      key={amt}
                      onClick={() => setAmountReceived(amt.toString())}
                      className={`px-2.5 py-1 rounded-md border text-[11px] font-bold transition-colors shrink-0 tabular-nums ${parseFloat(amountReceived) === amt
                        ? 'bg-blue-50 border-[#0066FF] text-[#0066FF]'
                        : 'bg-white dark:bg-[#1E293B] border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300'
                        }`}
                    >
                      {amt}
                    </button>
                  ))}
                  <button
                    onClick={() => setAmountReceived(totalAmount > 0 ? String(totalAmount) : "")}
                    className={`px-2.5 py-1 rounded-md border text-[11px] font-bold transition-colors shrink-0 ${amountReceived && Math.abs(parseFloat(amountReceived) - totalAmount) < 0.01
                      ? 'bg-blue-50 border-[#0066FF] text-[#0066FF]'
                      : 'bg-white dark:bg-[#1E293B] border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300'
                      }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <div className="bg-white dark:bg-[#1E293B] rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 focus-within:border-[#0066FF] transition-colors relative">
                  <p className="text-[8px] uppercase font-bold text-slate-500 mb-0.5">Discount (Rs.)</p>
                  <input
                    type="number"
                    value={discount || ''}
                    onChange={e => setDiscount(Math.max(0, Math.min(Number(e.target.value) || 0, maxDiscount)))}
                    placeholder="0.00"
                    className="w-full bg-transparent text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div className="bg-white dark:bg-[#1E293B] rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 focus-within:border-[#0066FF] transition-colors relative">
                  <p className="text-[8px] uppercase font-bold text-slate-500 mb-0.5">Receive (Rs.)</p>
                  <input
                    type="number"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-transparent text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div className="bg-[#E6F4EA] dark:bg-emerald-900/20 rounded-lg border-[#A8DAB5] dark:border-emerald-800/50 p-1.5 relative">
                  <p className="text-[8px] uppercase font-bold text-[#1E8E3E] dark:text-emerald-400 mb-0.5">Change</p>
                  <div className="text-sm font-bold text-[#1E8E3E] dark:text-emerald-400">{formatCurrency(changeAmount)}</div>
                </div>
              </div>

              <button
                id="complete-payment-btn"
                onClick={handleCheckout}
                disabled={posLoading || !orderId || cartItems.length === 0}
                className="w-full bg-[#0066FF] hover:bg-[#0052CC] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg py-3 flex items-center justify-center font-bold text-sm shadow-lg transition-colors"
              >
                Complete Payment
              </button>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={handlePrintKOT}
                  disabled={!orderId || cartItems.length === 0}
                  className="py-2 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-50 rounded-md text-[9px] font-bold uppercase transition-colors flex items-center justify-center space-x-1 shadow-sm"
                >
                  <Printer size={12} strokeWidth={2.5} />
                  <span>PRINT KOT</span>
                </button>
                <button
                  id="draft-btn"
                  onClick={() => navigate(`${basePath}/pos/0`)}
                  disabled={!orderId}
                  className="py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-[#0066FF] dark:text-blue-400 disabled:opacity-50 rounded-md text-[9px] font-bold uppercase transition-colors flex items-center justify-center space-x-1 shadow-sm"
                >
                  <FileText size={12} strokeWidth={2.5} />
                  <span>HOLD ORDER</span>
                </button>
                <button
                  id="cancel-btn"
                  onClick={handleCancelOrder}
                  disabled={!orderId}
                  className="py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 disabled:opacity-50 rounded-md text-[9px] font-bold uppercase transition-colors flex items-center justify-center space-x-1 shadow-sm"
                >
                  <X size={12} strokeWidth={3} />
                  <span>CANCEL ORDER</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 6px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #94A3B8; }
        .dark .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: #475569; }
      `}</style>

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



