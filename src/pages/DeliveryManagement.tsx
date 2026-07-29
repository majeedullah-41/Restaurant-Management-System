import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Truck, CheckCircle2, MapPin, Clock, User, Phone, Navigation, ChevronDown, Printer } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { AlertModal } from "../components/AlertModal";

interface DeliveryOrder {
  id: number;
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
  role: string;
}

export default function DeliveryManagement() {
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Record<number, number>>({});
  const [restaurantLogo, setRestaurantLogo] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>("");
  
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
      showAlert("Error", "Failed to load active deliveries.");
    }
  };

  const fetchStaff = async () => {
    try {
      const data: Staff[] = await invoke("get_staff");
      // Filter for drivers if necessary, or show all for now
      setStaff(data.filter(s => s.role.toLowerCase().includes('driver') || s.role.toLowerCase() === 'staff'));
    } catch (err) {
      console.error("Failed to load staff:", err);
    }
  };

  const fetchSettings = async () => {
    try {
      const settings: any = await invoke("get_settings");
      if (settings.restaurant_name) setRestaurantName(settings.restaurant_name);
      if (settings.restaurant_logo) setRestaurantLogo(settings.restaurant_logo);
    } catch (err) {
      console.error("Failed to load settings:", err);
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
      showAlert("Success", "Driver assigned successfully.", "success");
      fetchDeliveries();
    } catch (err) {
      showAlert("Error", "Failed to assign driver: " + err);
    }
  };

  const handleMarkDelivered = async (orderId: number) => {
    try {
      await invoke("update_delivery_status", { orderId, status: "Delivered" });
      showAlert("Success", "Order marked as delivered and closed.", "success");
      fetchDeliveries();
    } catch (err) {
      showAlert("Error", "Failed to update delivery status: " + err);
    }
  };

  const handlePrintTicket = async (order: DeliveryOrder) => {
    let items: any[] = [];
    try {
      items = await invoke("get_order_items", { orderId: order.id });
    } catch(err) {
      console.error("Failed to fetch items", err);
    }

    const formattedId = `#ORD-${order.id.toString().padStart(4, '0')}`;
    const dateStr = order.created_at ? new Date(order.created_at).toLocaleString() : new Date().toLocaleString();

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Delivery Ticket ${formattedId}</title>
      <style>
        body { font-family: monospace; width: 80mm; margin: 0 auto; padding: 20px; font-size: 14px; color: #000; background: #fff; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .flex { display: flex; justify-content: space-between; }
        .border-b { border-bottom: 2px dashed #000; margin: 15px 0; }
        .items-header { font-weight: bold; margin-bottom: 5px; }
        h1 { font-size: 1.5em; margin: 0; }
        p { margin: 4px 0; }
      </style>
    </head>
    <body>
      <div class="text-center">
        ${restaurantLogo ? `<img src="${restaurantLogo}" style="max-height: 80px; max-width: 100%; display: block; margin: 0 auto 10px;" />` : ''}
        <h1>${restaurantName || "Restaurant Name"}</h1>
        <p class="font-bold">*** DELIVERY TICKET ***</p>
        <div class="border-b"></div>
      </div>
      
      <div>
        <div class="flex"><span>Order #:</span><span class="font-bold">${formattedId}</span></div>
        <div class="flex"><span>Date:</span><span>${dateStr}</span></div>
        <div class="flex"><span>Driver:</span><span>${order.driver_name || 'Pending Dispatch'}</span></div>
      </div>
      
      <div class="border-b"></div>

      <div class="flex items-header">
        <span style="width: 50%">Item</span>
        <span style="width: 15%; text-align: center;">Qty</span>
        <span style="width: 35%; text-align: right;">Total</span>
      </div>
      
      ${items.map(item => `
      <div class="flex" style="margin-bottom: 4px;">
        <span style="width: 50%">${item.name}</span>
        <span style="width: 15%; text-align: center;">${item.quantity}</span>
        <span style="width: 35%; text-align: right;">${(item.price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      </div>
      `).join('')}

      <div class="border-b"></div>
      
      <div class="flex"><span>Total Amt:</span><span class="font-bold">Rs. ${order.total_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>

      <div class="border-b"></div>
      
      <div>
        <p class="font-bold" style="font-size: 16px; margin-bottom: 10px;">Customer Details:</p>
        <p><strong>Name:</strong> ${order.customer_name || 'Walk-in'}</p>
        <p><strong>Phone:</strong> ${order.customer_phone || 'N/A'}</p>
        <p style="margin-top: 10px;"><strong>Address:</strong><br/>${order.delivery_address || 'No address provided'}</p>
      </div>

      <div class="border-b"></div>
      <div class="text-center">
        <p>Please collect Rs. ${order.total_price.toLocaleString(undefined, { minimumFractionDigits: 2 })} from the customer.</p>
        <p style="margin-top:20px;">End of Ticket</p>
        <p style="margin-top: 10px; font-size: 12px;">Software provided by EagleNest Creations<br/>(0346-4451505)</p>
      </div>
      <script>
        window.onload = () => { window.print(); }
      </script>
    </body>
    </html>
    `;

    try {
      await invoke("save_print_html", { filename: "rms_delivery_ticket.html", html: htmlContent });
    } catch (err) {
      console.error("Failed to generate ticket:", err);
      showAlert("Error", "Failed to generate delivery ticket");
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-[#0F172A] text-slate-700 dark:text-slate-300 font-sans overflow-hidden">
      <Sidebar activePage="deliveries" />

      <main className="flex-1 flex flex-col relative z-10 overflow-hidden">
        <Header title="Delivery Management" subtitle="Manage active deliveries and assign drivers" />

        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
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
                        <h3 className="font-bold text-slate-900 dark:text-white">Order #{order.id}</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          order.delivery_status === 'Pending' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                          order.delivery_status === 'Dispatched' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {order.delivery_status}
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
                      <p className="font-bold text-blue-600 dark:text-blue-400">Rs. {order.total_price.toLocaleString()}</p>
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
                                  <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
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
