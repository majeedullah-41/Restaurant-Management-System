import { useState, useEffect, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

export interface DateFilterToolbarProps {
  onDateRangeChange: (startDate: string, endDate: string) => void;
  defaultMode?: 'date' | 'month' | 'custom';
}

export default function DateFilterToolbar({ onDateRangeChange, defaultMode = 'month' }: DateFilterToolbarProps) {
  const [mode, setMode] = useState<'date' | 'month' | 'custom'>(defaultMode);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const formatLocalDate = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    
  const formatDateForDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return dateStr;
  };

  const monthStartDate = formatLocalDate(selectedYear, selectedMonth, 1);
  const lastDayOfMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const monthEndDate = formatLocalDate(selectedYear, selectedMonth, lastDayOfMonth);

  const dayDateStr = formatLocalDate(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());

  const startDate = mode === 'month' ? monthStartDate : mode === 'date' ? dayDateStr : customStart;
  const endDate = mode === 'month' ? monthEndDate : mode === 'date' ? dayDateStr : customEnd;

  useEffect(() => {
    if (startDate && endDate) {
      onDateRangeChange(startDate, endDate);
    }
  }, [startDate, endDate, mode]);

  const isCurrentSelection = () => {
    const now = new Date();
    if (mode === 'month') {
      return selectedMonth === now.getMonth() && selectedYear === now.getFullYear();
    } else if (mode === 'date') {
      return selectedDate.getDate() === now.getDate() && selectedDate.getMonth() === now.getMonth() && selectedDate.getFullYear() === now.getFullYear();
    }
    return false;
  };

  const isFutureSelection = () => {
    const now = new Date();
    if (mode === 'month') {
      return selectedYear > now.getFullYear() || (selectedYear === now.getFullYear() && selectedMonth >= now.getMonth());
    } else if (mode === 'date') {
      const tDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const sDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      return sDate >= tDate;
    }
    return false;
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const goToPrev = () => {
    if (mode === 'custom') {
      setMode('month');
      return;
    }
    if (mode === 'month') {
      if (selectedMonth === 0) {
        setSelectedMonth(11);
        setSelectedYear(y => y - 1);
      } else {
        setSelectedMonth(m => m - 1);
      }
    } else if (mode === 'date') {
      const prev = new Date(selectedDate);
      prev.setDate(prev.getDate() - 1);
      setSelectedDate(prev);
    }
  };

  const goToNext = () => {
    if (mode === 'custom') {
      setMode('month');
      return;
    }
    if (mode === 'month') {
      if (selectedMonth === 11) {
        setSelectedMonth(0);
        setSelectedYear(y => y + 1);
      } else {
        setSelectedMonth(m => m + 1);
      }
    } else if (mode === 'date') {
      const next = new Date(selectedDate);
      next.setDate(next.getDate() + 1);
      setSelectedDate(next);
    }
  };

  const goToCurrent = () => {
    const now = new Date();
    if (mode === 'date') {
      setSelectedDate(now);
    } else {
      setMode('month');
      setSelectedMonth(now.getMonth());
      setSelectedYear(now.getFullYear());
    }
  };

  const applyCustomRange = () => {
    if (customStart && customEnd) {
      setMode('custom');
      setShowDatePicker(false);
    }
  };
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };
    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDatePicker]);

  return (
    <div className="flex items-center space-x-2">
      <div className="relative" ref={datePickerRef}>
        <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
          <button
            onClick={goToPrev}
            className="px-3 py-2.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-r border-slate-200 dark:border-slate-700"
            title={mode === 'custom' ? "Back to Month View" : mode === 'date' ? "Previous Day" : "Previous Month"}
          >
            <ChevronLeft size={16} />
          </button>
          <button 
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="px-5 py-2.5 flex items-center space-x-2.5 min-w-[200px] justify-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            <Calendar size={15} className="text-blue-500 shrink-0" />
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                {mode === 'month' ? `${monthNames[selectedMonth]} ${selectedYear}` : mode === 'date' ? `${selectedDate.getDate()} ${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}` : "Custom Range"}
              </span>
              {mode !== 'date' && (
                <span className="text-[11px] text-slate-400 font-medium">
                  {formatDateForDisplay(startDate)} — {formatDateForDisplay(endDate)}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={goToNext}
            disabled={mode !== 'custom' && isFutureSelection()}
            className="px-3 py-2.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-l border-slate-200 dark:border-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
            title={mode === 'custom' ? "Back to Month View" : mode === 'date' ? "Next Day" : "Next Month"}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Popover */}
        {showDatePicker && (
          <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-5 z-50 w-80">
            <div className="flex space-x-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mb-4">
              <button 
                onClick={() => setMode('date')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'date' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Daily
              </button>
              <button 
                onClick={() => setMode('month')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'month' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Monthly
              </button>
              <button 
                onClick={() => setMode('custom')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === 'custom' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Custom
              </button>
            </div>

            {mode === 'custom' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
                  <input 
                    type="date" 
                    value={customStart}
                    max={customEnd || undefined}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">End Date</label>
                  <input 
                    type="date" 
                    value={customEnd}
                    min={customStart || undefined}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="pt-2 flex gap-2">
                  <button 
                    onClick={applyCustomRange}
                    disabled={!customStart || !customEnd}
                    className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    Apply Range
                  </button>
                  <button 
                    onClick={() => setShowDatePicker(false)}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium py-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {(mode === 'date' || mode === 'month') && (
               <div className="py-2">
                 <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-4">
                   Use the arrows on the toolbar to navigate through {mode === 'date' ? 'days' : 'months'}.
                 </p>
                 <button 
                    onClick={() => setShowDatePicker(false)}
                    className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Close
                  </button>
               </div>
            )}
          </div>
        )}
      </div>

      {!isCurrentSelection() && mode !== 'custom' && (
        <button
          onClick={goToCurrent}
          className="px-3.5 py-2.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
        >
          {mode === 'date' ? 'Today' : 'This Month'}
        </button>
      )}
    </div>
  );
}
