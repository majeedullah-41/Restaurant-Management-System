import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, User, Phone, X, Award } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

interface Customer {
  id: number;
  name: string;
  phone: string;
  visits: number;
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const loadCustomers = async () => {
    try {
      const data: any = await invoke("get_customers");
      setCustomers(data);
    } catch (err) {
      console.error("Failed to load customers", err);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    try {
      await invoke("add_customer", { name, phone });
      setIsModalOpen(false);
      setName("");
      setPhone("");
      loadCustomers();
    } catch (err) {
      console.error(err);
      alert("Failed to add customer. Make sure the phone number is unique.");
    }
  };

  const handleDeleteCustomer = async (id: number) => {
    if (!window.confirm("Remove this customer from the database?")) return;
    try {
      await invoke("delete_customer", { id });
      loadCustomers();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden relative transition-colors">
      
      {isModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-96 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add New Customer</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleSaveCustomer} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Full Name</label>
                <input 
                  type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ali Khan"
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Phone Number</label>
                <input 
                  type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx-xxxxxxx"
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                />
              </div>
              <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors mt-4 shadow-lg shadow-blue-600/20">
                Save Customer
              </button>
            </form>
          </div>
        </div>
      )}

      <Sidebar activePage="customers" />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors">
        <Header title="Customer Database" subtitle="Track your regular diners and VIPs.">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-colors shadow-lg shadow-blue-600/20"
          >
            <Plus size={16} />
            <span>Add Customer</span>
          </button>
        </Header>

        <div className="flex-1 p-8 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {customers.map((customer) => (
              <div key={customer.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex flex-col group hover:border-slate-300 dark:hover:border-slate-700 transition-colors shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className="h-12 w-12 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/20 flex items-center justify-center dark:text-blue-400">
                    <User size={24} />
                  </div>
                  <button 
                    onClick={() => handleDeleteCustomer(customer.id)}
                    className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                
                <h3 className="font-bold text-slate-900 dark:text-white text-lg">{customer.name}</h3>
                
                <div className="mt-4 space-y-2">
                  <div className="flex items-center text-sm text-slate-600 dark:text-slate-400 space-x-2">
                    <Phone size={14} className="text-slate-400 dark:text-slate-500"/>
                    <span>{customer.phone}</span>
                  </div>
                  <div className="flex items-center text-sm text-slate-600 dark:text-slate-400 space-x-2">
                    <Award size={14} className={customer.visits > 5 ? "text-yellow-500" : "text-slate-400 dark:text-slate-500"}/>
                    <span className={customer.visits > 5 ? "text-yellow-600 dark:text-yellow-500 font-bold" : ""}>
                      {customer.visits} Total Visits
                    </span>
                  </div>
                </div>
              </div>
            ))}
            
            {customers.length === 0 && (
              <div className="col-span-full py-20 text-center text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                No customers added yet. Start building your database!
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}