import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Clock } from "lucide-react";
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';

export default function Attendance() {
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [showClockModal, setShowClockModal] = useState(false);
  const [clockCategoryId, setClockCategoryId] = useState<number | "">("");
  const [clockStaffId, setClockStaffId] = useState<number | "">("");

  const [staff, setStaff] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const _staff: any = await invoke("get_staff");
      setStaff(_staff);
      const _categories: any = await invoke("get_staff_categories");
      setCategories(_categories);
    } catch (err) {
      console.error("Failed to load staff/categories", err);
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

  const handleClockInOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clockStaffId) {
      alert("Please select a staff member.");
      return;
    }
    try {
      const msg = await invoke<string>("clock_in_out", { staffId: Number(clockStaffId) });
      alert(msg);
      setShowClockModal(false);
      setClockStaffId("");
      setClockCategoryId("");
      loadAttendance(attendanceDate); // Refresh logs
    } catch (err) {
      console.error(err);
      alert(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadAttendance(attendanceDate);
  }, [attendanceDate]);

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-300 font-sans overflow-hidden relative transition-colors">
      <Sidebar activePage="attendance" />
      <main className="flex-1 flex flex-col bg-slate-50 dark:bg-[#0B1120] z-10 overflow-hidden transition-colors">
        <Header title="Staff Attendance" subtitle="Track employee clock-in and clock-out times.">
          <button 
            onClick={() => setShowClockModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center space-x-2 transition-colors shadow-lg shadow-blue-600/20"
          >
            <Clock size={16} />
            <span>Manual Clock In/Out</span>
          </button>
        </Header>
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl w-full max-w-3xl mx-auto shadow-sm">
            <div className="mb-6 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Daily Attendance Log</h3>
              <input 
                type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)}
                className="h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
              />
            </div>

            <div className="space-y-3 pr-2">
              {attendanceRecords.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">No attendance records for this date.</p>
              ) : (
                attendanceRecords.map(rec => (
                  <div key={rec.id} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">{rec.staff_name}</span>
                      <span className="text-xs text-slate-500">Clock In: {new Date(rec.clock_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div className="text-right">
                      {rec.clock_out ? (
                        <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Out: {new Date(rec.clock_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      ) : (
                        <span className="text-sm font-bold text-green-600 dark:text-green-500 bg-green-100 dark:bg-green-500/20 px-3 py-1 rounded-full">Active</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {showClockModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 p-6 rounded-xl w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 text-center">
              Manual Clock In/Out
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 text-center">
              Select a staff member to record their attendance.
            </p>
            <form onSubmit={handleClockInOut}>
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Filter by Category</label>
                <select 
                  value={clockCategoryId} 
                  onChange={(e) => {
                    setClockCategoryId(e.target.value === "" ? "" : Number(e.target.value));
                    setClockStaffId("");
                  }}
                  className="w-full bg-slate-50 dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">All Categories</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="mb-6">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Select Staff Member</label>
                <select 
                  required
                  value={clockStaffId} 
                  onChange={e => setClockStaffId(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="" disabled>Select Staff</option>
                  {staff
                    .filter(s => clockCategoryId === "" ? true : s.category_id === clockCategoryId)
                    .map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.category_name || 'Uncategorized'})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => { setShowClockModal(false); setClockStaffId(""); }} className="px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-lg shadow-blue-500/20 transition-all">
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
