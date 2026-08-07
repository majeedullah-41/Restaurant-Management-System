import { useState, useEffect } from "react";
import { invoke } from "../lib/api";
import { formatCurrency } from "../lib/utils";
import { Plus, Trash2, UserCircle, X, Edit2, Clock } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { ConfirmModal } from "../components/ConfirmModal";
import { AlertModal } from "../components/AlertModal";

interface StaffMember {
  id: number;
  name: string;
  role: string | null;
  category_id: number | null;
  category_name: string | null;
  phone: string;
  salary: number;
  pin_code: string | null;
}

interface StaffCategory {
  id: number;
  name: string;
}

export default function StaffManagement() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [categories, setCategories] = useState<StaffCategory[]>([]);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);

  // Edit State
  const [editingStaffId, setEditingStaffId] = useState<number | null>(null);

  // Staff Form
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [phone, setPhone] = useState("");
  const [salary, setSalary] = useState<string>("0");

  // Category Form
  const [newCategoryName, setNewCategoryName] = useState("");

  // Attendance State
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);

  // Clock In/Out State
  const [clockCategoryId, setClockCategoryId] = useState<number | "">("");
  const [clockStaffId, setClockStaffId] = useState<number | "">("");

  // App Dialogs
  const [alertMessage, setAlertMessage] = useState<{ title: string; message: string; type: 'danger' | 'success' } | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);
  const [deleteStaffId, setDeleteStaffId] = useState<number | null>(null);

  const loadStaff = async () => {
    try {
      const data: any = await invoke("get_staff");
      setStaff(data);
    } catch (err) {
      console.error("Failed to load staff", err);
    }
  };

  const loadCategories = async () => {
    try {
      const data: any = await invoke("get_staff_categories");
      setCategories(data);
    } catch (err) {
      console.error("Failed to load categories", err);
    }
  };

  const loadAttendance = async (date: string) => {
    try {
      const data: any = await invoke("get_attendance", { date });
      setAttendanceRecords(data);
    } catch (err) {
      console.error("Failed to load attendance", err);
    }
  };

  useEffect(() => {
    loadStaff();
    loadCategories();
  }, []);

  useEffect(() => {
    if (isAttendanceModalOpen) {
      loadAttendance(attendanceDate);
    }
  }, [isAttendanceModalOpen, attendanceDate]);

  const handleClockInOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clockStaffId) {
      setAlertMessage({ title: "No Staff Selected", message: "Please select a staff member.", type: "danger" });
      return;
    }
    try {
      const msg = await invoke<string>("clock_in_out", { staffId: Number(clockStaffId) });
      setAlertMessage({ title: "Success", message: msg, type: "success" });
      setClockStaffId("");
      setClockCategoryId("");
      loadAttendance(attendanceDate);
    } catch (err: any) {
      console.error(err);
      setAlertMessage({ title: "Clock In/Out Failed", message: String(err), type: "danger" });
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    try {
      if (editingStaffId) {
        await invoke("update_staff", {
          id: editingStaffId,
          name,
          categoryId: categoryId === "" ? null : Number(categoryId),
          phone,
          salary: Number(salary),
          pinCode: "" // Send empty string since PIN is no longer used but API still expects it
        });
      } else {
        await invoke("add_staff", {
          name,
          categoryId: categoryId === "" ? null : Number(categoryId),
          phone,
          salary: Number(salary),
          pinCode: ""
        });
      }
      setIsModalOpen(false);
      setName("");
      setPhone("");
      setCategoryId("");
      setSalary("0");
      setEditingStaffId(null);
      loadStaff();
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (person: StaffMember) => {
    setEditingStaffId(person.id);
    setName(person.name);
    setPhone(person.phone);
    setCategoryId(person.category_id || "");
    setSalary(person.salary.toString());
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setEditingStaffId(null);
    setName("");
    setPhone("");
    setCategoryId("");
    setSalary("0");
    setIsModalOpen(true);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName) return;
    try {
      await invoke("add_staff_category", { name: newCategoryName });
      setNewCategoryName("");
      loadCategories();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    setDeleteCategoryId(id);
  };

  const confirmDeleteCategory = async () => {
    if (deleteCategoryId === null) return;
    try {
      await invoke("delete_staff_category", { id: deleteCategoryId });
      loadCategories();
    } catch (err) {
      console.error(err);
    }
    setDeleteCategoryId(null);
  };

  const handleDeleteStaff = async (id: number) => {
    setDeleteStaffId(id);
  };

  const confirmDeleteStaff = async () => {
    if (deleteStaffId === null) return;
    try {
      await invoke("delete_staff", { id: deleteStaffId });
      loadStaff();
    } catch (err) {
      console.error(err);
    }
    setDeleteStaffId(null);
  };

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-300 font-sans overflow-hidden relative transition-colors">

      {isModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-96 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingStaffId ? "Edit Staff Member" : "Add Staff Member"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveStaff} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Full Name</label>
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Phone Number</label>
                <input
                  type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Category</label>
                <select
                  value={categoryId} onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- No Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Monthly Salary (Rs.)</label>
                <input
                  type="number" value={salary} onChange={(e) => setSalary(e.target.value)}
                  className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
                />
              </div>
              <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors mt-4 shadow-lg shadow-blue-600/20">
                {editingStaffId ? "Update Staff" : "Register Staff"}
              </button>
            </form>
          </div>
        </div>
      )}

      {isCategoryModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl w-96 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Staff Categories</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X size={20} /></button>
            </div>

            <form onSubmit={handleAddCategory} className="flex gap-2 mb-6">
              <input
                type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="New Category"
                className="flex-1 h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" required
              />
              <button type="submit" className="h-11 px-4 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white font-bold rounded-lg transition-colors">
                Add
              </button>
            </form>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {categories.map(c => (
                <div key={c.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{c.name}</span>
                  <button onClick={() => handleDeleteCategory(c.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button>
                </div>
              ))}
              {categories.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No categories added yet.</p>}
            </div>
          </div>
        </div>
      )}

      {isAttendanceModalOpen && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-full">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="text-blue-500" />
                Staff Attendance
              </h3>
              <button onClick={() => setIsAttendanceModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={20} /></button>
            </div>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              {/* Left Side: Manual Clock In/Out */}
              <div className="w-full md:w-1/3 p-6 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 overflow-y-auto">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">Manual Clock</h4>
                <form onSubmit={handleClockInOut} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Filter by Category</label>
                    <select
                      value={clockCategoryId}
                      onChange={(e) => {
                        setClockCategoryId(e.target.value === "" ? "" : Number(e.target.value));
                        setClockStaffId("");
                      }}
                      className="w-full h-11 bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm shadow-sm"
                    >
                      <option value="">All Categories</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Select Staff Member</label>
                    <select
                      required
                      value={clockStaffId}
                      onChange={e => setClockStaffId(Number(e.target.value))}
                      className="w-full h-11 bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm shadow-sm"
                    >
                      <option value="" disabled>Select Staff</option>
                      {staff
                        .filter(s => clockCategoryId === "" ? true : s.category_id === clockCategoryId)
                        .map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.category_name || 'Uncategorized'})</option>
                        ))}
                    </select>
                  </div>
                  <button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md shadow-blue-500/20 transition-all mt-2">
                    Clock In / Out
                  </button>
                </form>
              </div>

              {/* Right Side: Daily Attendance Log */}
              <div className="w-full md:w-2/3 p-6 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
                <div className="flex justify-between items-center mb-4 shrink-0">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Daily Log</h4>
                  <input
                    type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)}
                    className="h-9 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-md px-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {attendanceRecords.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-sm text-slate-500 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                      No attendance records for this date.
                    </div>
                  ) : (
                    attendanceRecords.map(rec => (
                      <div key={rec.id} className="flex justify-between items-center p-4 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">{rec.staff_name}</span>
                          <span className="text-xs font-medium text-slate-500 flex items-center mt-1">
                            <Clock size={12} className="mr-1" />
                            In: {new Date(rec.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-right">
                          {rec.clock_out ? (
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-700 px-3 py-1 rounded-full">
                              Out: {new Date(rec.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-500/20 px-3 py-1 rounded-full animate-pulse">
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Sidebar activePage="staff" />

      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors min-w-0">
        <Header title="Staff Management" subtitle="Manage employee access, roles, and contact information." />

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto flex flex-col">
          <div className="mb-6 flex justify-end shrink-0 space-x-3">
            <button
              onClick={() => setIsAttendanceModalOpen(true)}
              className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:text-indigo-400 px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-colors shadow-sm"
            >
              <Clock size={16} />
              <span>Attendance</span>
            </button>
            <button
              onClick={() => setIsCategoryModalOpen(true)}
              className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-colors shadow-sm"
            >
              <span>Categories</span>
            </button>
            <button
              onClick={openAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-colors shadow-lg shadow-blue-600/20"
            >
              <Plus size={16} />
              <span>Add Employee</span>
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {staff.map((person) => (
              <div key={person.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between group hover:border-slate-300 dark:hover:border-slate-700 transition-colors shadow-sm">
                <div className="flex items-center space-x-4">
                  <div className={`p-3 rounded-xl border bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400 shrink-0`}>
                    <UserCircle size={24} />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-6">
                    <div className="w-48">
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg truncate">{person.name}</h3>
                      <div className="flex items-center mt-1">
                        <span className="text-xs text-slate-600 dark:text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {person.category_name || person.role || "Uncategorized"}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-slate-500 w-32 truncate">
                      {person.phone || "No phone listed"}
                    </div>
                    <div className="text-sm font-bold text-green-600 dark:text-green-400">
                      Salary: {formatCurrency(person.salary)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => openEditModal(person)}
                    className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-50 dark:bg-slate-950 p-2 rounded-lg transition-colors border border-slate-200 dark:border-slate-800/50"
                    title="Edit Staff"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteStaff(person.id)}
                    className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 bg-slate-50 dark:bg-slate-950 p-2 rounded-lg transition-colors border border-slate-200 dark:border-slate-800/50"
                    title="Delete Staff"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {staff.length === 0 && (
              <div className="w-full py-20 text-center text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                No staff members registered.
              </div>
            )}
          </div>
        </div>
      </main>

      <ConfirmModal
        isOpen={deleteCategoryId !== null}
        title="Delete Category"
        message="Remove this category?"
        type="danger"
        confirmText="Delete"
        onConfirm={confirmDeleteCategory}
        onCancel={() => setDeleteCategoryId(null)}
      />

      <ConfirmModal
        isOpen={deleteStaffId !== null}
        title="Delete Staff Member"
        message="Remove this staff member from the system?"
        type="danger"
        confirmText="Delete"
        onConfirm={confirmDeleteStaff}
        onCancel={() => setDeleteStaffId(null)}
      />

      <AlertModal
        isOpen={alertMessage !== null}
        title={alertMessage?.title || ""}
        message={alertMessage?.message || ""}
        type={alertMessage?.type || "danger"}
        buttonText="OK"
        onClose={() => setAlertMessage(null)}
      />
    </div>
  );
}