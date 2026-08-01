import { Moon, Sun, CalendarDays } from "lucide-react";
import { Link } from 'react-router-dom';
import { useTheme } from "./ThemeProvider";

interface HeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export default function Header({ title, subtitle, children }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const role = localStorage.getItem("userRole") || "Admin";

  return (
    <header className="h-[72px] px-8 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-[#0B1120] transition-colors">
      <div>
        <h1 className="text-[28px] font-bold text-slate-900 dark:text-white leading-tight">{title}</h1>
        {subtitle && <p className="text-[15px] text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
      </div>

      <div className="flex items-center space-x-6">
        {children}

        {/* Date and Time */}
        <div className="hidden md:flex items-center space-x-3 text-slate-500 dark:text-slate-400">
          <CalendarDays size={20} className="text-blue-600" />
          <div className="text-[13px] text-right">
            <p className="text-slate-900 dark:text-white font-bold">
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <p className="text-slate-500 font-semibold uppercase text-[11px]">
              {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center border-l border-slate-200 dark:border-slate-800 pl-6 h-8">
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>

        {/* Profile */}
        <Link to="/admin/profile" className="flex items-center space-x-3 border-l border-slate-200 dark:border-slate-800 pl-6 cursor-pointer group">
          <div className="hidden md:block text-right">
            <p className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight group-hover:text-blue-600 transition-colors">{role === "Admin" ? "Admin" : role}</p>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 font-medium">{role === "Admin" ? "Administrator" : "Staff Member"}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[15px] shadow-sm">
            {role === "Admin" ? "AD" : "CA"}
          </div>
        </Link>
      </div>
    </header>
  );
}
