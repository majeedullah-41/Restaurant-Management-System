import { useState, useEffect, useMemo } from "react";
import { invoke } from "../lib/api";
import { useAuth } from "../lib/auth";
import { X, Plus, Trash2, CheckCircle2, Lock, AlertTriangle, Pencil } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { ConfirmModal } from "../components/ConfirmModal";
import { AlertModal } from "../components/AlertModal";

interface TableData {
  id: number;
  table_number: number;
  status: string;
  category_id: number | null;
  category_name: string | null;
}

interface TableCategory {
  id: number;
  name: string;
}

export default function TableManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [tables, setTables] = useState<TableData[]>([]);
  const [categories, setCategories] = useState<TableCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals & Forms
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Category management
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [editingCat, setEditingCat] = useState<TableCategory | null>(null);
  const [catError, setCatError] = useState<string | null>(null);
  const [deleteCatId, setDeleteCatId] = useState<number | null>(null);
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);

  // Existing table management
  const [selectedTable, setSelectedTable] = useState<TableData | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

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

  const loadCategories = async () => {
    try {
      const data: any = await invoke("get_table_categories");
      setCategories(data);
    } catch (err) {
      console.error("Failed to load categories", err);
    }
  };

  useEffect(() => {
    loadTables();
    loadCategories();
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
        tableId: selectedTable.id,
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
    if (!newTableNumber || !selectedCategoryId) return;
    setSaveMsg(null);
    setErrorAlert(null);
    try {
      const res: any = await invoke("add_tables", {
        numbers: newTableNumber,
        categoryId: parseInt(selectedCategoryId)
      });
      setSaveMsg(res || "Table(s) added");
      setIsAddModalOpen(false);
      setNewTableNumber("");
      setSelectedCategoryId("");
      loadTables();
    } catch (err: any) {
      setErrorAlert("Failed to add table(s): " + err);
    }
  };

  const handleDeleteTable = async (id: number) => {
    setDeleteConfirmId(id);
  };

  const confirmDeleteTable = async () => {
    if (deleteConfirmId === null) return;
    try {
      await invoke("delete_table", { id: deleteConfirmId });
      closeAdminModal();
      loadTables();
    } catch (err: any) {
      setErrorMsg(err);
    }
    setDeleteConfirmId(null);
  };

  // Category handlers
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName) return;
    setCatError(null);
    try {
      if (editingCat) {
        await invoke("update_table_category", { id: editingCat.id, name: catName });
      } else {
        await invoke("add_table_category", { name: catName });
      }
      setIsCatModalOpen(false);
      setEditingCat(null);
      setCatName("");
      loadCategories();
    } catch (err: any) {
      setCatError(String(err));
    }
  };

  const openEditCategory = (cat: TableCategory) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatError(null);
    setIsCatModalOpen(true);
  };

  const handleDeleteCategory = (id: number) => {
    setDeleteCatId(id);
  };

  const confirmDeleteCategory = async () => {
    if (deleteCatId === null) return;
    try {
      await invoke("delete_table_category", { id: deleteCatId });
      loadCategories();
      loadTables();
    } catch (err: any) {
      setErrorAlert(String(err));
    }
    setDeleteCatId(null);
  };

  const GENERAL_ID = "__general__";

  const groupedSections = useMemo(() => {
    const sections: { key: string; label: string; tables: TableData[] }[] = [];
    const byKey = new Map<string, { key: string; label: string; tables: TableData[] }>();

    const ensure = (key: string, label: string) => {
      if (!byKey.has(key)) {
        const sec = { key, label, tables: [] as TableData[] };
        byKey.set(key, sec);
        sections.push(sec);
      }
      return byKey.get(key)!;
    };

    // General (uncategorized) bucket always appears first
    ensure(GENERAL_ID, "General");

    tables.forEach((t) => {
      if (t.category_id == null) {
        byKey.get(GENERAL_ID)!.tables.push(t);
      } else {
        const key = `cat-${t.category_id}`;
        ensure(key, t.category_name || `Category ${t.category_id}`).tables.push(t);
      }
    });

    return sections;
  }, [tables]);

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden relative transition-colors">

      {/* ADMIN CONTROL MODAL */}
      {selectedTable && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-96 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Manage Table {selectedTable.table_number}</h3>
              <div className="flex items-center space-x-2">
                {isAdmin && <button onClick={() => handleDeleteTable(selectedTable.id)} className="text-red-500 hover:text-red-700 p-1 bg-red-50 dark:bg-red-500/10 rounded-md transition-colors" title="Delete Table"><Trash2 size={18} /></button>}
                <button onClick={closeAdminModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-white bg-slate-100 dark:bg-slate-800 p-1 rounded-md transition-colors"><X size={18}/></button>
              </div>
            </div>

            <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 flex items-center space-x-3">
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

      {/* ADD TABLE MODAL */}
      {isAddModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-96 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add New Table</h3>
              <button onClick={() => { setIsAddModalOpen(false); setNewTableNumber(""); setSelectedCategoryId(""); setSaveMsg(null); setErrorAlert(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={20}/></button>
            </div>

            <form onSubmit={handleAddTable} className="space-y-4">
               <div>
                 <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Category</label>
                {categories.length === 0 ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg">
                    No categories yet. Click “Manage Categories” from the table list to add one first.
                  </div>
                ) : (
                  <select
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    required
                  >
                    <option value="">Select a category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Table Numbers</label>
                <input
                  type="text"
                  value={newTableNumber}
                  onChange={(e) => { setNewTableNumber(e.target.value); }}
                  placeholder='e.g. 1,2,3 or 1-10'
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  required
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Comma-separated numbers and ranges are supported (e.g. 1-5,8,11-15).</p>
              </div>

              {errorAlert && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start space-x-2 text-red-600 dark:text-red-400 text-xs font-medium">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{errorAlert}</span>
                </div>
              )}

              <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors mt-4 shadow-lg shadow-blue-600/20">
                Create Table(s)
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CATEGORY MANAGEMENT MODAL */}
      {isCatModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-96 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingCat ? "Edit Category" : "Add Category"}</h3>
              <button onClick={() => { setIsCatModalOpen(false); setEditingCat(null); setCatName(""); setCatError(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={20}/></button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Category Name</label>
                <input
                  type="text"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Patio, Indoor..."
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>

              {catError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 rounded-lg flex items-start space-x-2 text-red-600 dark:text-red-400 text-xs font-medium">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{catError}</span>
                </div>
              )}

              <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors mt-4 shadow-lg shadow-blue-600/20">
                {editingCat ? "Update Category" : "Create Category"}
              </button>
             </form>
          </div>
        </div>
      )}

      {/* MANAGE CATEGORIES LIST MODAL */}
      {isManageCategoriesOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-96 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-6 shrink-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Table Categories</h3>
              <button onClick={() => setIsManageCategoriesOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X size={20}/></button>
            </div>

            {categories.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No categories yet. Add one to group your tables.</p>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 -mr-1">
                {categories.map((cat) => {
                  const tableCount = tables.filter(t => t.category_id === cat.id).length;
                  return (
                    <div key={cat.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{cat.name}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{tableCount} table{tableCount !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button onClick={() => openEditCategory(cat)} className="text-slate-500 hover:text-blue-600 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Edit"><Pencil size={14} /></button>
                        <button onClick={() => handleDeleteCategory(cat.id)} className="text-slate-500 hover:text-red-600 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded" title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => { setIsManageCategoriesOpen(false); setEditingCat(null); setCatName(""); setCatError(null); setIsCatModalOpen(true); }}
              className="w-full h-10 shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-lg flex items-center justify-center space-x-2 transition-colors mt-4"
            >
              <Plus size={16} />
              <span>Add Category</span>
            </button>
          </div>
        </div>
      )}

      {/* COMPONENT REPLACES THE ENTIRE ASIDE BLOCK */}
      <Sidebar activePage="tables" />

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors min-w-0">
        <Header title="Table Management" subtitle="Override physical floor status. Occupied tables are locked by active orders." />

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto flex flex-col">
          <div className="flex justify-between items-center mb-6 shrink-0">
            {isAdmin && (
              <>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setIsManageCategoriesOpen(true)}
                    className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-colors"
                  >
                  <Plus size={16} />
                  <span>Manage Categories</span>
                </button>
                </div>
                <button
                  onClick={() => { setIsAddModalOpen(true); setSaveMsg(null); setErrorAlert(null); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-colors shadow-lg shadow-blue-600/20"
                >
                  <Plus size={16} />
                  <span>Add Table</span>
                </button>
              </>
            )}
          </div>

          {saveMsg && (
            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/50 rounded-lg flex items-center space-x-2 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>{saveMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">Loading floor plan...</div>
          ) : (
            <div className="space-y-8">
              {groupedSections.filter((section) => section.tables.length > 0).map((section) => (
                <div key={section.key}>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">{section.label}</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {section.tables.map((table) => {
                      let bgStyle = "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500";
                      let textStyle = "text-slate-900 dark:text-white";
                      let badgeStyle = "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400";

                      if (table.status === "Occupied") {
                        bgStyle = "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 hover:border-red-400 dark:border-red-500";
                        textStyle = "text-red-600 dark:text-red-400";
                        badgeStyle = "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400";
                      } else if (table.status === "Reserved") {
                        bgStyle = "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900/50 hover:border-purple-400 dark:border-purple-500";
                        textStyle = "text-purple-600 dark:text-purple-400";
                        badgeStyle = "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400";
                      } else if (table.status === "Maintenance") {
                        bgStyle = "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900/50 dark:border-orange-500 hover:border-orange-400 dark:border-orange-500";
                        textStyle = "text-orange-600 dark:text-orange-400";
                        badgeStyle = "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400";
                      }

                      return (
                        <div
                          key={table.id}
                          onClick={() => isAdmin && openAdminModal(table)}
                          className={`relative p-6 rounded-2xl border-2 cursor-pointer transition-all hover:-translate-y-1 shadow-lg ${bgStyle} ${isAdmin ? "" : "opacity-60 cursor-default"}`}
                        >
                          <div className="flex flex-col items-center justify-center space-y-3">
                            <span className={`text-4xl font-black ${textStyle}`}>
                              {table.table_number}
                            </span>
                            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${badgeStyle}`}>
                              {table.status}
                            </span>
                            {table.category_name && (
                              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full truncate">
                                {table.category_name}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <ConfirmModal
        isOpen={deleteConfirmId !== null}
        title="Delete Table"
        message="Are you sure you want to delete this table?"
        type="danger"
        confirmText="Delete"
        onConfirm={confirmDeleteTable}
        onCancel={() => setDeleteConfirmId(null)}
      />

      <ConfirmModal
        isOpen={deleteCatId !== null}
        title="Delete Category"
        message="Are you sure you want to delete this category? Tables assigned to it will be unaffected."
        type="danger"
        confirmText="Delete"
        onConfirm={confirmDeleteCategory}
        onCancel={() => setDeleteCatId(null)}
      />

      <AlertModal
        isOpen={errorAlert !== null}
        title="Error"
        message={errorAlert || ""}
        type="danger"
        onClose={() => setErrorAlert(null)}
      />
    </div>
  );
}
