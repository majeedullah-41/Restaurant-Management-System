import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, AlertTriangle, CheckCircle2, Lock } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

interface TableData {
  id: number;
  table_number: number;
  status: string;
}

export default function TableManagement() {
  const [tables, setTables] = useState<TableData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState<string>("");

  const loadTables = async () => {
    try {
      await invoke("init_tables_if_needed");
      const data: any = await invoke("get_table_statuses");
      setTables(data);
    } catch (err) {
      console.error("Failed to load tables", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTables();
  }, []);

  const openAdminModal = (table: TableData) => {
    setSelectedTable(table);
    setNewStatus(table.status);
    setErrorMsg("");
  };

  const closeAdminModal = () => {
    setSelectedTable(null);
    setErrorMsg("");
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable) return;
    
    setErrorMsg("");
    try {
      await invoke("admin_update_table_status", { 
        tableNumber: selectedTable.table_number, 
        status: newStatus 
      });
      closeAdminModal();
      loadTables();
    } catch (err: any) {
      setErrorMsg(err); 
    }
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNumber) return;
    try {
      await invoke("add_table", { tableNumber: parseInt(newTableNumber) });
      setIsAddModalOpen(false);
      setNewTableNumber("");
      loadTables();
    } catch (err: any) {
      alert("Failed to add table: " + err);
    }
  };

  const handleDeleteTable = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this table?")) return;
    try {
      await invoke("delete_table", { id });
      closeAdminModal();
      loadTables();
    } catch (err: any) {
      setErrorMsg(err);
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden relative transition-colors">
      
      {/* ADMIN CONTROL MODAL */}
      {selectedTable && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-96 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Manage Table {selectedTable.table_number}</h3>
              <div className="flex items-center space-x-2">
                <button onClick={() => handleDeleteTable(selectedTable.id)} className="text-red-500 hover:text-red-700 p-1 bg-red-50 dark:bg-red-500/10 rounded-md transition-colors"><X size={18} /></button>
                <button onClick={closeAdminModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-white bg-slate-100 dark:bg-slate-800 p-1 rounded-md transition-colors"><X size={18}/></button>
              </div>
            </div>
            
            <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center space-x-3">
              {selectedTable.status === "Occupied" ? <Lock className="text-red-500" size={20}/> : <CheckCircle2 className="text-green-500" size={20}/>}
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-0.5">Current Status</p>
                <p className={`text-sm font-bold ${selectedTable.status === "Occupied" ? "text-red-500 dark:text-red-400" : "text-slate-900 dark:text-slate-300"}`}>{selectedTable.status}</p>
              </div>
            </div>

            <form onSubmit={handleUpdateStatus} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Override Status</label>
                <select 
                  value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Available">Available (Open for seating)</option>
                  <option value="Reserved">Reserved (VIP / Hold)</option>
                  <option value="Maintenance">Maintenance (Broken / Cleaning)</option>
                </select>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start space-x-2 text-red-600 dark:text-red-400 text-xs font-medium leading-relaxed">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors mt-4 shadow-lg shadow-blue-600/20">
                Apply Override
              </button>
            </form>
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-96 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add New Table</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20}/></button>
            </div>
            
            <form onSubmit={handleAddTable} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Table Number</label>
                <input 
                  type="number" value={newTableNumber} onChange={(e) => setNewTableNumber(e.target.value)}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                />
              </div>
              <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors mt-4 shadow-lg shadow-blue-600/20">
                Create Table
              </button>
            </form>
          </div>
        </div>
      )}

      {/* COMPONENT REPLACES THE ENTIRE ASIDE BLOCK */}
      <Sidebar activePage="tables" />

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors">
        <Header title="Table Management" subtitle="Override physical floor status. Occupied tables are locked by active orders." />

        <div className="flex-1 p-8 overflow-y-auto flex flex-col">
          <div className="mb-6 flex justify-end shrink-0">
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-colors shadow-lg shadow-blue-600/20"
            >
              <span>Add Table</span>
            </button>
          </div>
          
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">Loading floor plan...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {tables.map((table) => {
                let bgStyle = "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500";
                let textStyle = "text-slate-900 dark:text-white";
                let badgeStyle = "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400";

                if (table.status === "Occupied") {
                  bgStyle = "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 hover:border-red-400 dark:hover:border-red-500";
                  textStyle = "text-red-600 dark:text-red-400";
                  badgeStyle = "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400";
                } else if (table.status === "Reserved") {
                  bgStyle = "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900/50 hover:border-purple-400 dark:hover:border-purple-500";
                  textStyle = "text-purple-600 dark:text-purple-400";
                  badgeStyle = "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400";
                } else if (table.status === "Maintenance") {
                  bgStyle = "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/50 hover:border-orange-400 dark:hover:border-orange-500";
                  textStyle = "text-orange-600 dark:text-orange-400";
                  badgeStyle = "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400";
                }

                return (
                  <div 
                    key={table.id}
                    onClick={() => openAdminModal(table)}
                    className={`relative p-6 rounded-2xl border-2 cursor-pointer transition-all hover:-translate-y-1 shadow-lg ${bgStyle}`}
                  >
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <span className={`text-4xl font-black ${textStyle}`}>
                        {table.table_number}
                      </span>
                      <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${badgeStyle}`}>
                        {table.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}