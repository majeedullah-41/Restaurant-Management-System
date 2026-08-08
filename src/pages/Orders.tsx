import React, { useState, useEffect } from "react";
import { invoke } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import { useAuth } from "../lib/auth";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, CheckCircle2, ChevronDown, ChevronRight, PackageOpen, User, Clock, Banknote, FileText, Tag, AlertCircle, ExternalLink, Percent, Phone, MapPin } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import DateFilterToolbar from "../components/DateFilterToolbar";

interface OrderHistory {
  id: number;
  table_id: number;
  table_number: number;
  table_category_name?: string;
  status: string;
  total_items: number;
  total_price: number;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  amount_received: number;
  change_due: number;
  customer_name: string | null;
  cashier_name: string | null;
  order_note: string | null;
  order_type: string | null;
  created_at: string | null;
  closed_at: string | null;
  delivery_fee?: number;
  customer_phone?: string;
  delivery_address?: string;
  service_charge_amount?: number;
}

interface OrderItem {
  id: number;
  item_id: number;
  name: string;
  price: number;
  quantity: number;
}

const EditablePayable = ({ order, onDiscountUpdated }: { order: OrderHistory, onDiscountUpdated: (orderId: number, discountAmt: number) => void }) => {
  const grossTotal = order.total_price + order.discount_amount;
  const [val, setVal] = useState<string>(order.total_price.toFixed(2));

  useEffect(() => {
    setVal(order.total_price.toFixed(2));
  }, [order.total_price, order.discount_amount]);

  return (
    <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-3 space-y-2">
      <label className="text-xs font-semibold text-blue-700 dark:text-blue-400">Net Payable Amount</label>
      <div className="flex items-center space-x-2">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Rs.</span>
        <input
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={async () => {
            const parsed = parseFloat(val);
            if (isNaN(parsed) || parsed < 0) {
              setVal(order.total_price.toFixed(2));
              return;
            }
            const capped = Math.min(parsed, grossTotal);
            const discountAmt = Math.max(0, grossTotal - capped);
            try {
              await invoke("update_order_discount", { orderId: order.id, discountAmount: discountAmt });
              onDiscountUpdated(order.id, discountAmt);
              setVal(capped.toFixed(2));
            } catch (err) {
              console.error("Failed to update discount", err);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="flex-1 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-500/30 rounded-lg px-3 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {order.discount_amount > 0 && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          Discount of {formatCurrency(order.discount_amount)} applied
        </p>
      )}
    </div>
  );
};

export default function Orders() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHistoryPage = location.pathname.includes('history');
  const { user } = useAuth();
  const role = user?.role || "Admin";
  const basePath = role === "Cashier" ? "/cashier" : "/admin";

  const [allOrders, setAllOrders] = useState<OrderHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [orderItems, setOrderItems] = useState<Record<number, OrderItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<Record<number, boolean>>({});
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });

  const handleDiscountUpdated = (orderId: number, discountAmt: number) => {
    setAllOrders(prev => prev.map(o => o.id === orderId ? { ...o, discount_amount: discountAmt, total_price: o.total_price + o.discount_amount - discountAmt } : o));
  };

  // Filter orders based on the current page
  const orders = allOrders.filter(order => {
    const statusMatch = isHistoryPage ? order.status === 'Closed' : (order.status === 'Open' || order.status === 'Placed');
    if (!statusMatch) return false;

    if (isHistoryPage) {
      const dateStr = order.closed_at || order.created_at;
      if (!dateStr) return false;
      const orderDate = new Date(dateStr);
      const start = dateRange.startDate ? new Date(dateRange.startDate) : null;
      const end = dateRange.endDate ? new Date(dateRange.endDate) : null;
      
      if (start && end) {
        const d = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());
        const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        if (d < s || d > e) {
           return false;
        }
      } else {
        return false; // don't show anything until dateRange is set
      }
    }
    
    return true;
  });

  const toggleRow = async (orderId: number) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }
    setExpandedOrderId(orderId);
    
    if (!orderItems[orderId]) {
      setLoadingItems(prev => ({ ...prev, [orderId]: true }));
      try {
        const items: OrderItem[] = await invoke("get_order_items", { orderId });
        setOrderItems(prev => ({ ...prev, [orderId]: items }));
      } catch (err) {
        console.error("Failed to load order items", err);
      } finally {
        setLoadingItems(prev => ({ ...prev, [orderId]: false }));
      }
    }
  };

  const filteredOrders = orders.filter(order => 
    order.id.toString().includes(searchQuery.trim())
  );

  useEffect(() => {
    async function fetchHistory() {
      try {
        const data: any = await invoke("get_order_history");
        setAllOrders(data);
      } catch (err) {
        console.error("Failed to load order history", err);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  const totalRevenue = orders.reduce((sum, order) => sum + order.total_price, 0);

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      
      <Sidebar activePage={isHistoryPage ? "history" : "orders"} />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors min-w-0">
        <Header 
          title={isHistoryPage ? "Order History" : "Orders"} 
          subtitle={isHistoryPage ? "View past completed orders." : "Manage active and incoming orders."}
        />

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
              <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm mb-1">{isHistoryPage ? 'Total Orders' : 'Open Orders'}</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{orders.length}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col justify-center shadow-sm">
              <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm mb-1">{isHistoryPage ? 'Total Items Sold' : 'Total Items'}</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{orders.reduce((sum, o) => sum + o.total_items, 0)}</p>
            </div>
            <div className={`${isHistoryPage ? 'bg-blue-50 dark:bg-blue-600/10 border-blue-200 dark:border-blue-500/20' : 'bg-amber-50 dark:bg-amber-600/10 border-amber-200 dark:border-amber-500/20'} border rounded-2xl p-6 flex flex-col justify-center shadow-sm`}>
              <p className={`${isHistoryPage ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'} font-semibold text-sm mb-1`}>{isHistoryPage ? 'Total Revenue' : 'Total Amount'}</p>
              <p className={`text-3xl font-black ${isHistoryPage ? 'text-blue-700 dark:text-blue-500' : 'text-amber-700 dark:text-amber-500'}`}>{formatCurrency(totalRevenue)}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{isHistoryPage ? 'Completed Transactions' : 'Active Orders'}</h2>
              <div className="flex items-center space-x-4">
                {isHistoryPage && (
                  <DateFilterToolbar 
                    onDateRangeChange={(startDate, endDate) => setDateRange({ startDate, endDate })}
                    defaultMode="month"
                  />
                )}
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search Order ID..." 
                    className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm rounded-lg pl-9 pr-4 py-2 w-64 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600"
                  />
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <th className="p-4 pl-6 font-semibold">Order ID</th>
                    <th className="p-4 font-semibold">Table</th>
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold text-center">Items</th>
                    <th className="p-4 pr-6 font-semibold text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">Loading history...</td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">{isHistoryPage ? 'No completed orders found.' : 'No open orders at the moment.'}</td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <React.Fragment key={order.id}>
                        <tr 
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group cursor-pointer"
                          onClick={() => toggleRow(order.id)}
                        >
                          <td className="p-4 pl-6 font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                            {expandedOrderId === order.id ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                            <span>#{order.id}</span>
                          </td>
                          <td className="p-4 font-medium text-slate-700 dark:text-slate-300">
                            {order.table_number === 0 ? 'Walk-in' : (order.table_category_name ? `${order.table_category_name} - Table ${order.table_number.toString().padStart(2, '0')}` : `Table ${order.table_number.toString().padStart(2, '0')}`)}
                          </td>
                          <td className="p-4">
                            <span className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                              order.status === 'Open'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                            }`}>
                              {order.status === 'Open' ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
                              <span>{order.order_type === 'Delivery' && order.status === 'Placed' ? 'Delivery Pending' : order.status}</span>
                            </span>
                          </td>
                          <td className="p-4 font-medium text-slate-700 dark:text-slate-300 text-center">{order.total_items}</td>
                          <td className="p-4 pr-6 font-bold text-blue-600 dark:text-blue-400 text-right">{formatCurrency(order.total_price)}</td>
                        </tr>
                        {expandedOrderId === order.id && (
                          <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800/50">
                            <td colSpan={5} className="p-0">
                              <div className="p-6 pl-12 bg-slate-50 dark:bg-slate-900/50 shadow-inner">
                                {/* Go to POS button for open orders */}
                                {order.status === 'Open' && (
                                  <div className="mb-4">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`${basePath}/pos/${order.table_id}/${order.id}`);
                                      }}
                                      className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-blue-600/20"
                                    >
                                      <ExternalLink size={16} />
                                      <span>Continue in POS</span>
                                    </button>
                                  </div>
                                )}
                                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center"><PackageOpen size={16} className="mr-2"/> Order Items</h4>
                                {loadingItems[order.id] ? (
                                  <p className="text-sm text-slate-500">Loading items...</p>
                                ) : orderItems[order.id]?.length > 0 ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    {orderItems[order.id].map(item => (
                                      <div key={item.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex justify-between items-center">
                                        <div>
                                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.name}</p>
                                          <p className="text-xs text-slate-500 dark:text-slate-400">{item.quantity} x {formatCurrency(item.price)}</p>
                                        </div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency((item.quantity * item.price))}</p>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-slate-500">No items found for this order.</p>
                                )}

                                {/* Digital Receipt View */}
                                <div className="mt-8 border-t border-slate-200 dark:border-slate-800/50 pt-6">
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    
                                    {/* Order Context Details */}
                                    <div className="space-y-4">
                                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center mb-4"><FileText size={16} className="mr-2"/> Order Details</h4>
                                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-3">
                                        <div className="flex items-center text-sm">
                                          <Tag size={14} className="text-slate-400 mr-2" />
                                          <span className="text-slate-500 dark:text-slate-400 w-24">Type:</span>
                                          <span className="font-medium text-slate-900 dark:text-white">{order.order_type || 'Dine-in'}</span>
                                        </div>
                                        {order.order_type === 'Delivery' && (
                                          <>
                                            <div className="flex items-center text-sm">
                                              <Phone size={14} className="text-slate-400 mr-2" />
                                              <span className="text-slate-500 dark:text-slate-400 w-24">Phone:</span>
                                              <span className="font-medium text-slate-900 dark:text-white">{order.customer_phone || 'N/A'}</span>
                                            </div>
                                            <div className="flex items-start text-sm">
                                              <MapPin size={14} className="text-slate-400 mr-2 mt-0.5" />
                                              <span className="text-slate-500 dark:text-slate-400 w-24">Address:</span>
                                              <span className="font-medium text-slate-900 dark:text-white flex-1">{order.delivery_address || 'N/A'}</span>
                                            </div>
                                          </>
                                        )}
                                        <div className="flex items-center text-sm">
                                          <User size={14} className="text-slate-400 mr-2" />
                                          <span className="text-slate-500 dark:text-slate-400 w-24">Customer:</span>
                                          <span className="font-medium text-slate-900 dark:text-white">{order.customer_name || 'Guest (No Customer)'}</span>
                                        </div>
                                        <div className="flex items-center text-sm">
                                          <User size={14} className="text-slate-400 mr-2" />
                                          <span className="text-slate-500 dark:text-slate-400 w-24">Cashier:</span>
                                          <span className="font-medium text-slate-900 dark:text-white">{order.cashier_name || 'Admin'}</span>
                                        </div>
                                        <div className="flex items-center text-sm pt-2 border-t border-slate-100 dark:border-slate-700/50">
                                          <Clock size={14} className="text-slate-400 mr-2" />
                                          <span className="text-slate-500 dark:text-slate-400 w-24">Opened:</span>
                                          <span className="font-medium text-slate-900 dark:text-white">{order.created_at || 'Unknown'}</span>
                                        </div>
                                        <div className="flex items-center text-sm">
                                          <Clock size={14} className="text-slate-400 mr-2" />
                                          <span className="text-slate-500 dark:text-slate-400 w-24">Closed:</span>
                                          <span className="font-medium text-slate-900 dark:text-white">{order.closed_at || 'Unknown'}</span>
                                        </div>
                                        {order.order_note && (
                                          <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50 mt-2">
                                            <p className="text-xs text-slate-400 mb-1">Notes</p>
                                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-amber-50 dark:bg-amber-500/10 p-2 rounded-lg border border-amber-100 dark:border-amber-500/20">{order.order_note}</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Financial Breakdown */}
                                    <div className="space-y-4">
                                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center mb-4"><Banknote size={16} className="mr-2"/> Financial Summary</h4>
                                      <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                        <div className="space-y-2 mb-4">
                                          <div className="flex justify-between text-sm">
                                            <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                                            <span className="font-medium text-slate-900 dark:text-white">{formatCurrency((order.status === 'Open' ? order.total_price : order.subtotal))}</span>
                                          </div>
                                          {order.status === 'Closed' && (
                                            <div className="flex justify-between text-sm">
                                              <span className="text-slate-500 dark:text-slate-400">Tax Amount</span>
                                              <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(order.tax_amount)}</span>
                                            </div>
                                          )}
                                          {(order.service_charge_amount || 0) > 0 && (
                                            <div className="flex justify-between text-sm">
                                              <span className="text-slate-500 dark:text-slate-400">Service Charge</span>
                                              <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(order.service_charge_amount ?? 0)}</span>
                                            </div>
                                          )}
                                          {order.discount_amount > 0 && (
                                            <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                                              <span className="flex items-center"><Percent size={12} className="mr-1" /> Discount</span>
                                              <span className="font-medium">- {formatCurrency(order.discount_amount)}</span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-700 mb-4">
                                          <span className="font-semibold text-slate-900 dark:text-white">Grand Total</span>
                                          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency((order.total_price - order.discount_amount))}</span>
                                        </div>

                                        {/* Editable Net Payable for Open orders */}
                                        {order.status === 'Open' && (
                                          <EditablePayable order={order} onDiscountUpdated={handleDiscountUpdated} />
                                        )}

                                        {/* Payment details for closed orders */}
                                        {order.status === 'Closed' && (
                                          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 space-y-1">
                                            <div className="flex justify-between text-xs sm:text-sm">
                                              <span className="text-slate-500 dark:text-slate-400">Amount Received</span>
                                              <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(order.amount_received)}</span>
                                            </div>
                                            <div className="flex justify-between text-xs sm:text-sm">
                                              <span className="text-slate-500 dark:text-slate-400">Change Given</span>
                                              <span className="font-medium text-slate-900 dark:text-white">{formatCurrency(order.change_due)}</span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}