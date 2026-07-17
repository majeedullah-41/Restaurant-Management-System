import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Search, Plus, X, Pencil, Trash2, Filter, MoreVertical, 
  Pizza, Coffee, Sandwich, Beef, Croissant, Utensils
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

// Mock Icons for Categories (since DB just has names)
const getCategoryIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('burger') || n.includes('beef')) return <Beef size={20} />;
  if (n.includes('pizza')) return <Pizza size={20} />;
  if (n.includes('drink') || n.includes('coffee') || n.includes('beverage')) return <Coffee size={20} />;
  if (n.includes('sandwich')) return <Sandwich size={20} />;
  if (n.includes('bread') || n.includes('croissant') || n.includes('pastry')) return <Croissant size={20} />;
  return <Utensils size={20} />;
};

export default function MenuManagement() {
  const [categories, setCategories] = useState<{id: number, name: string}[]>([]);
  const [menuItems, setMenuItems] = useState<{id: number, name: string, category_id: number, price: number}[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  
  // Modals & Forms
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<{id: number, name: string} | null>(null);
  const [editingItem, setEditingItem] = useState<{id: number, name: string, category_id: number, price: number} | null>(null);
  const [catName, setCatName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemCatId, setItemCatId] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

  async function loadData() {
    try {
      const fetchedCategories: any = await invoke("get_categories");
      const fetchedItems: any = await invoke("get_menu_items");
      setCategories(fetchedCategories);
      setMenuItems(fetchedItems);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  }

  useEffect(() => { loadData(); }, []);

  // --- CATEGORY HANDLERS ---
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName) return;
    try {
      if (editingCat) await invoke("update_category", { id: editingCat.id, name: catName });
      else await invoke("add_category", { name: catName });
      setIsCatModalOpen(false); setEditingCat(null); setCatName("");
      loadData();
    } catch (err) { console.error(err); }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!window.confirm("Delete category?")) return;
    try {
      await invoke("delete_category", { id });
      if (selectedCategoryId === id) setSelectedCategoryId(null);
      loadData();
    } catch (err) { console.error(err); }
  };

  // --- MENU ITEM HANDLERS ---
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName || !itemPrice || !itemCatId) return;
    try {
      if (editingItem) await invoke("update_menu_item", { id: editingItem.id, name: itemName, categoryId: parseInt(itemCatId), price: parseFloat(itemPrice) });
      else await invoke("add_menu_item", { name: itemName, categoryId: parseInt(itemCatId), price: parseFloat(itemPrice) });
      setIsItemModalOpen(false); setEditingItem(null); setItemName(""); setItemPrice(""); setItemCatId("");
      loadData();
    } catch (err) { console.error(err); }
  };

  const handleDeleteItem = async (id: number) => {
    if (!window.confirm("Delete item?")) return;
    try {
      await invoke("delete_menu_item", { id });
      loadData();
    } catch (err) { console.error(err); }
  };

  const openCatModal = (cat: {id: number, name: string} | null = null) => {
    setEditingCat(cat); setCatName(cat ? cat.name : ""); setIsCatModalOpen(true);
  };

  const openItemModal = (item: {id: number, name: string, category_id: number, price: number} | null = null) => {
    setEditingItem(item); setItemName(item ? item.name : ""); setItemPrice(item ? item.price.toString() : "");
    setItemCatId(item ? item.category_id.toString() : (selectedCategoryId ? selectedCategoryId.toString() : ""));
    setIsItemModalOpen(true);
  };

  const displayedItems = menuItems.filter(item => {
    if (selectedCategoryId && item.category_id !== selectedCategoryId) return false;
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      
      {/* MODALS */}
      {isCatModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-96 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingCat ? "Edit Category" : "Add New Category"}</h3>
              <button onClick={() => setIsCatModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20}/></button>
            </div>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Category Name</label>
                <input 
                  type="text" value={catName} onChange={(e) => setCatName(e.target.value)}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  autoFocus required
                />
              </div>
              <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors mt-2 shadow-lg shadow-blue-600/20">
                {editingCat ? "Update Category" : "Save Category"}
              </button>
            </form>
          </div>
        </div>
      )}

      {isItemModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-96 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingItem ? "Edit Menu Item" : "Add New Menu Item"}</h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20}/></button>
            </div>
            <form onSubmit={handleSaveItem} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Item Name</label>
                <input 
                  type="text" value={itemName} onChange={(e) => setItemName(e.target.value)}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Category</label>
                <select 
                  value={itemCatId} onChange={(e) => setItemCatId(e.target.value)}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                >
                  <option value="" disabled>Select a category...</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Price (Rs.)</label>
                <input 
                  type="number" step="0.01" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                />
              </div>
              <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors mt-4 shadow-lg shadow-blue-600/20">
                {editingItem ? "Update Menu Item" : "Save Menu Item"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <Sidebar activePage="menu" />

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 transition-colors">
        <Header title="Menu Management" subtitle="Manage your restaurant's food, drinks, and categories." />

        <div className="flex-1 p-8 overflow-hidden flex gap-8">
          
          {/* LEFT COLUMN: Categories */}
          <div className="w-80 flex flex-col">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col h-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Categories</h2>
                <button onClick={() => openCatModal(null)} className="text-blue-600 dark:text-blue-500 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center space-x-1 transition-colors">
                  <Plus size={16} />
                  <span>Add Category</span>
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                <div 
                  onClick={() => setSelectedCategoryId(null)}
                  className={`p-3.5 rounded-xl flex items-center justify-between cursor-pointer transition-all ${
                    selectedCategoryId === null 
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" 
                      : "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${selectedCategoryId === null ? 'bg-blue-500' : 'bg-slate-100 dark:bg-slate-800'}`}>
                      <Utensils size={20} />
                    </div>
                    <span className="font-semibold">All Categories</span>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${selectedCategoryId === null ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-800'}`}>
                    {menuItems.length}
                  </span>
                </div>

                {categories.map(cat => {
                  const itemCount = menuItems.filter(i => i.category_id === cat.id).length;
                  const isActive = selectedCategoryId === cat.id;
                  
                  return (
                    <div 
                      key={cat.id} 
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`p-3.5 rounded-xl flex items-center justify-between group cursor-pointer transition-all ${
                        isActive 
                          ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" 
                          : "bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                          {getCategoryIcon(cat.name)}
                        </div>
                        <span className="font-semibold">{cat.name}</span>
                      </div>
                      <div className="flex items-center">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full group-hover:hidden ${isActive ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-800'}`}>
                          {itemCount}
                        </span>
                        <div className="hidden group-hover:flex space-x-1">
                          <button onClick={(e) => { e.stopPropagation(); openCatModal(cat); }} className={`p-1.5 rounded-md hover:bg-black/10 ${isActive ? "text-white" : "text-slate-500"}`}><Pencil size={14}/></button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id); }} className={`p-1.5 rounded-md hover:bg-black/10 ${isActive ? "text-white" : "text-red-500"}`}><Trash2 size={14}/></button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Total items summary card */}
              <div className="mt-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 flex items-center justify-between border border-slate-200 dark:border-slate-800">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Items</span>
                  <span className="text-xl font-bold text-slate-900 dark:text-white">{menuItems.length}</span>
                </div>
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-500">
                  <Utensils size={20} />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Menu Items */}
          <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            
            {/* Toolbar */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {selectedCategoryId ? `${categories.find(c => c.id === selectedCategoryId)?.name || "Category"} Items` : "All Menu Items"}
              </h2>
              
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search menu..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white w-64"
                  />
                </div>
                
                <button className="flex items-center space-x-2 px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                  <Filter size={16} />
                  <span>Filter</span>
                </button>

                <button onClick={() => openItemModal(null)} className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-blue-600/20">
                  <Plus size={16} />
                  <span>Add Item</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                  <tr className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-4">Image</th>
                    <th className="px-6 py-4">Item Name</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Price</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {displayedItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        No menu items found.
                      </td>
                    </tr>
                  ) : (
                    displayedItems.map(item => {
                      const catName = categories.find(c => c.id === item.category_id)?.name || "Unknown";
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                               <Utensils size={20} />
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-slate-900 dark:text-white">{item.name}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                              {catName}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-slate-900 dark:text-white">Rs. {item.price.toFixed(2)}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {/* Toggle Switch Mock */}
                            <div className="inline-flex items-center justify-center w-10 h-5 bg-blue-600 rounded-full cursor-pointer relative">
                              <span className="absolute right-1 w-3.5 h-3.5 bg-white rounded-full"></span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button onClick={() => openItemModal(item)} className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors">
                                <Pencil size={18} />
                              </button>
                              <button onClick={() => handleDeleteItem(item.id)} className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors">
                                <Trash2 size={18} />
                              </button>
                              <button className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                                <MoreVertical size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
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