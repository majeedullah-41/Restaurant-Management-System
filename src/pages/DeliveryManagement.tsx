import { useState, useEffect } from "react";
import { invoke } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import { Truck, CheckCircle2, MapPin, Clock, User, Phone, Navigation, ChevronDown, Printer } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { AlertModal } from "../components/AlertModal";
import { useToast } from "../lib/toast";
import { DeliveryReceiptTemplate } from "../components/DeliveryReceiptTemplate";
import {
  loadPrintSettings,
  printTicketDocument,
  assetFileUrl,
  buildDeliveryReceiptText,
  DEFAULT_PRINT_SETTINGS,
  type PrintSettings,
  type ReceiptDocument,
} from "../lib/printing";

interface DeliveryOrder {
  id: number;
  order_number: number;
  created_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  status: string;
  delivery_status: string;
  total_price: number;
  delivery_fee: number;
  driver_name: string | null;
}

interface Staff {
  id: number;
  name: string;
  role: string | null;
}

export default function DeliveryManagement() {
  const toast = useToast();
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Record<number, number>>({});
  const [restaurantName, setRestaurantName] = useState<string>("");
  const [restaurantAddress, setRestaurantAddress] = useState<string>("");
  const [restaurantContact, setRestaurantContact] = useState<string>("");
  const [restaurantLogo, setRestaurantLogo] = useState<string | null>(null);
  const [taxRate, setTaxRate] = useState(0);
  const [printSettings, setPrintSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);

  const [alertModal, setAlertModal] = useState<{isOpen: boolean; title: string; message: string; type: 'danger' | 'warning' | 'info' | 'success'}>({
    isOpen: false, title: '', message: '', type: 'danger'
  });

  const showAlert = (title: string, message: string, type: 'danger' | 'warning' | 'info' | 'success' = 'danger') => {
    setAlertModal({ isOpen: true, title, message, type });
  };

  const fetchDeliveries = async () => {
    try {
      const data: DeliveryOrder[] = await invoke("get_active_deliveries");
      setDeliveries(data);
    } catch (err) {
      console.error("Failed to load deliveries:", err);
      toast.error("Failed to load active deliveries.");
    }
  };

  const fetchStaff = async () => {
    try {
      const data: Staff[] = await invoke("get_staff_dropdown");
      // Filter for drivers if necessary, or show all for now
      setStaff(data.filter(s => (s.role ?? '').toLowerCase().includes('driver') || (s.role ?? '').toLowerCase() === 'staff'));
    } catch (err) {
      console.error("Failed to load staff:", err);
    }
  };

  const fetchSettings = async () => {
    try {
      const settings: any = await invoke("get_settings");
      if (settings.restaurant_name) setRestaurantName(settings.restaurant_name);
      if (settings.address) setRestaurantAddress(settings.address);
      if (settings.contact_number) setRestaurantContact(settings.contact_number);
      if (settings.logo_path) setRestaurantLogo(settings.logo_path);
      if (settings.tax_rate) setTaxRate(settings.tax_rate);
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
    try {
      setPrintSettings(await loadPrintSettings());
    } catch (err) {
      console.error("Failed to load print settings:", err);
    }
  };

  useEffect(() => {
    fetchDeliveries();
    fetchStaff();
    fetchSettings();
    
    // Set interval to refresh automatically every 30s
    const interval = setInterval(fetchDeliveries, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleAssignDriver = async (orderId: number) => {
    const driverId = selectedDriver[orderId];
    if (!driverId) {
      showAlert("Validation Error", "Please select a driver first.", "warning");
      return;
    }
    try {
      await invoke("assign_delivery_driver", { orderId, driverId });
      toast.success("Driver assigned successfully.");
      fetchDeliveries();
    } catch (err) {
      toast.error("Failed to assign driver: " + err);
    }
  };

  const handleMarkDelivered = async (orderId: number) => {
    try {
      await invoke("update_delivery_status", { orderId, status: "Delivered" });
      toast.success("Order marked as delivered and closed.");
      fetchDeliveries();
    } catch (err) {
      toast.error("Failed to update delivery status: " + err);
    }
  };

  const handlePrintTicket = async (order: DeliveryOrder) => {
    let items: { id: number; name: string; price: number; quantity: number }[] = [];
    try {
      items = await invoke("get_order_items", { orderId: order.id });
    } catch (err) {
      console.error("Failed to fetch items", err);
    }

    // The delivery receipt shows payment details, so pull the full order row.
    let full: any = {};
    try {
      const history: any[] = await invoke("get_order_history");
      full = history.find(o => o.id === order.id) || {};
    } catch (err) {
      console.error("Failed to load order details", err);
    }

    const formattedId = `#ORD-${(order.order_number || order.id).toString().padStart(4, '0')}`;
    const dateStr = new Date(full.closed_at || full.created_at || order.created_at || new Date()).toLocaleString();

    try {
      const text = buildDeliveryReceiptText(
        {
          restaurantName: restaurantName || 'Restaurant Name',
          restaurantAddress: restaurantAddress || undefined,
          restaurantContact: restaurantContact || undefined,
          orderId: formattedId,
          orderType: 'Delivery',
          date: dateStr,
          items,
          cashierName: full.cashier_name || 'Admin',
          subtotal: full.subtotal ?? order.total_price,
          taxRate,
          taxAmount: full.tax_amount ?? 0,
          discount: full.discount_amount ?? 0,
          totalAmount: full.total_price ?? order.total_price,
          amountReceived: full.amount_received ?? 0,
          changeAmount: full.change_due ?? 0,
          deliveryFee: order.delivery_fee ?? 0,
          customerName: order.customer_name,
          customerPhone: order.customer_phone,
          deliveryAddress: order.delivery_address,
        },
        printSettings.deliveryReceiptLayout
      );
      const doc: ReceiptDocument = {
        kind: "delivery_receipt",
        restaurant: {
          name: restaurantName || 'Restaurant Name',
          address: restaurantAddress || null,
          contact: restaurantContact || null,
        },
        meta: { order_id: formattedId, date_time: dateStr, order_type: 'Delivery', table_label: "", cashier_name: full.cashier_name || 'Admin' },
        customer: { name: order.customer_name, phone: order.customer_phone, address: order.delivery_address },
        items,
        totals: {
          subtotal: full.subtotal ?? order.total_price,
          tax_rate: taxRate,
          tax_amount: full.tax_amount ?? 0,
          discount: full.discount_amount ?? 0,
          delivery_fee: order.delivery_fee ?? 0,
          total_amount: full.total_price ?? order.total_price,
        },
        payment: { amount_received: full.amount_received ?? 0, change_amount: full.change_due ?? 0 },
      };
      const element = (
        <DeliveryReceiptTemplate
          restaurantName={restaurantName || 'Restaurant Name'}
          restaurantAddress={restaurantAddress || undefined}
          restaurantContact={restaurantContact || undefined}
          logoUrl={assetFileUrl(restaurantLogo)}
          orderId={formattedId}
          orderType="Delivery"
          date={dateStr}
          items={items}
          subtotal={full.subtotal ?? order.total_price}
          discount={full.discount_amount ?? 0}
          taxAmount={full.tax_amount ?? 0}
          taxRate={taxRate}
          totalAmount={full.total_price ?? order.total_price}
          amountReceived={full.amount_received ?? 0}
          changeAmount={full.change_due ?? 0}
          deliveryFee={order.delivery_fee ?? 0}
          cashierName={full.cashier_name || 'Admin'}
          customerName={order.customer_name}
          customerPhone={order.customer_phone}
          deliveryAddress={order.delivery_address}
          config={printSettings.deliveryReceiptLayout}
        />
      );
      await printTicketDocument("delivery_receipt", element, doc, text, printSettings);
      toast.success("Delivery receipt sent to the printer.");
    } catch (err) {
      console.error("Failed to print delivery receipt:", err);
      toast.error("Failed to print delivery receipt: " + err);
    }
  };

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-[#0F172A] text-slate-700 dark:text-slate-300 font-sans overflow-hidden">
      <Sidebar activePage="deliveries" />

      <main className="flex-1 flex flex-col relative z-10 overflow-hidden min-w-0">
        <Header title="Delivery Management" subtitle="Manage active deliveries and assign drivers" />

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto custom-scrollbar">
          {deliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <Truck size={48} className="text-slate-300 dark:text-slate-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">No Active Deliveries</h2>
              <p className="text-sm">When new delivery orders are placed, they will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {deliveries.map(order => (
                <div key={order.id} className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col">
                  
                  {/* Card Header */}
                  <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-slate-900 dark:text-white">Order #{order.order_number || order.id}</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          order.delivery_status === 'Pending' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                          order.delivery_status === 'Dispatched' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {order.delivery_status === 'Pending' ? 'Delivery Pending' : order.delivery_status}
                        </span>
                        <button 
                          onClick={() => handlePrintTicket(order)}
                          className="ml-2 text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 transition-colors"
                          title="Print Delivery Ticket"
                        >
                          <Printer size={16} />
                        </button>
                      </div>
                      <div className="flex items-center text-[11px] text-slate-500 mt-1">
                        <Clock size={12} className="mr-1" />
                        {order.created_at ? new Date(order.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Unknown Time'}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Total</p>
                      <p className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(order.total_price)}</p>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-1 space-y-4">
                    {/* Customer Info */}
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-500">
                        <User size={14} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{order.customer_name || 'Walk-in'}</p>
                        <p className="text-xs text-slate-500 flex items-center mt-0.5"><Phone size={10} className="mr-1"/> {order.customer_phone || 'N/A'}</p>
                      </div>
                    </div>

                    {/* Address Info */}
                    <div className="flex items-start space-x-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                      <div className="mt-0.5 shrink-0 text-red-500">
                        <MapPin size={16} />
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug break-words line-clamp-3">
                        {order.delivery_address || 'No address provided'}
                      </p>
                    </div>

                    {/* Driver Assignment */}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                      {order.delivery_status === 'Pending' ? (
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Assign Driver</label>
                          <div className="flex space-x-2">
                            <div className="relative flex-1">
                              <select
                                value={selectedDriver[order.id] || ""}
                                onChange={(e) => setSelectedDriver({...selectedDriver, [order.id]: parseInt(e.target.value)})}
                                className="w-full bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white text-xs border border-slate-200 dark:border-slate-700 rounded-lg p-2 pr-8 focus:outline-none focus:border-indigo-500 appearance-none"
                              >
                                <option value="" disabled>Select Driver...</option>
                                {staff.map(s => (
                                  <option key={s.id} value={s.id}>{s.name} ({s.role || 'Staff'})</option>
                                ))}
                              </select>
                              <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            </div>
                            <button
                              onClick={() => handleAssignDriver(order.id)}
                              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                            >
                              Dispatch
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-3 bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800/30">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-300">
                            <Navigation size={14} />
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold tracking-wider text-indigo-500">Dispatched with</p>
                            <p className="text-sm font-semibold text-slate-900 dark:text-indigo-100">{order.driver_name || 'Unknown Driver'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <button
                      onClick={() => handleMarkDelivered(order.id)}
                      disabled={order.delivery_status !== 'Dispatched'}
                      className="w-full py-2.5 rounded-lg font-bold text-sm flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20"
                    >
                      <CheckCircle2 size={16} className="mr-2" />
                      Mark as Delivered
                    </button>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <AlertModal 
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
      />
    </div>
  );
}
