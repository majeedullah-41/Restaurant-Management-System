import { Moon, Sun, CalendarDays } from "lucide-react";
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
    <header className="h-16 px-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50 dark:bg-[#0F172A] transition-colors">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
      </div>

      <div className="flex items-center space-x-6">
        {children}

        {/* Date and Time */}
        <div className="hidden md:flex items-center space-x-2 text-slate-500 dark:text-slate-400">
          <CalendarDays size={18} />
          <div className="text-xs">
            <p className="text-slate-900 dark:text-white font-medium">
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <p>
              {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>

        {/* Profile */}
        <div className="flex items-center space-x-3 border-l border-slate-200 dark:border-slate-800 pl-6 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 p-1.5 rounded-lg transition-colors">
          <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-500 font-bold shadow-inner">
            {role === "Admin" ? "AD" : "CA"}
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{role === "Admin" ? "Admin" : role}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{role === "Admin" ? "Administrator" : "Staff Member"}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
