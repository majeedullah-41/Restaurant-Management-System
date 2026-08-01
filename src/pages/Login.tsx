import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Server, Settings2 } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [restaurantName, setRestaurantName] = useState("Restaurant");
  const [restaurantLogo, setRestaurantLogo] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchSettings() {
      try {
        const settings: any = await invoke("get_settings");
        if (settings.restaurant_name) setRestaurantName(settings.restaurant_name);
        if (settings.logo_path) setRestaurantLogo(settings.logo_path);
      } catch (err) {
        console.error("Failed to fetch settings", err);
      }
    }
    fetchSettings();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); 

    try {
      const res: any = await invoke("login", { email, password });
      if (res.success) {
        localStorage.setItem("userRole", res.role);
        localStorage.setItem("userName", res.username);
        localStorage.setItem("displayName", res.display_name || "");
        
        if (res.role === "Admin") {
          navigate("/admin/dashboard");
        } else if (res.role === "Cashier") {
          navigate("/cashier/dashboard");
        }
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError("An unexpected error occurred connecting to the database.");
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-950 transition-colors p-4 md:p-8 lg:p-12">
      <div className="flex flex-col md:flex-row w-full h-full bg-white dark:bg-[#0B1120] rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 transition-colors">
        
        {/* LEFT SIDE: The Restaurant Image Area */}
        <div className="hidden md:flex flex-col w-1/2 bg-black relative">
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20 z-10"></div>
          
          <img 
            src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=2070&auto=format&fit=crop" 
            alt="Restaurant Interior"
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
          
          <div className="relative z-20 flex flex-col items-center justify-center h-full p-12 text-center">
            {restaurantLogo ? (
              <div className="w-24 h-24 bg-white/10 backdrop-blur-md rounded-3xl p-3 mb-8 shadow-2xl shadow-black/50 border border-white/20 flex items-center justify-center">
                <img src={restaurantLogo} alt="Restaurant Logo" className="w-full h-full object-contain rounded-xl" />
              </div>
            ) : (
              <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mb-8 shadow-lg shadow-blue-600/30 border border-blue-400/30">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path>
                  <path d="M7 2v20"></path>
                  <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path>
                </svg>
              </div>
            )}
            <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-2 drop-shadow-lg leading-tight uppercase">
              {restaurantName}
            </h1>
            <p className="text-blue-400 font-bold tracking-[0.2em] uppercase text-sm mb-8 drop-shadow-md">Management System</p>
            <div className="flex items-center space-x-3 text-slate-300 font-medium">
              <span>Simple</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              <span>Fast</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              <span>Offline</span>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: The Login Form */}
        <div className="flex w-full md:w-1/2 flex-col px-8 lg:px-24 bg-white dark:bg-[#1E293B] transition-colors py-8 overflow-y-auto">
          <div className="flex-1 flex flex-col justify-center w-full max-w-md mx-auto">
            <div className="flex items-center space-x-4 mb-10">
              <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center border border-blue-100 dark:border-blue-800 shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 dark:text-blue-500"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <div>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Welcome Back!</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Please login to continue.</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2.5">
                <Label htmlFor="email" className="text-slate-700 dark:text-slate-300 font-semibold">Email Address</Label>
                <div className="relative">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-3 text-slate-400"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>
                  <Input 
                    id="email" type="email" placeholder="Enter your email"
                    className="pl-10 h-12 bg-slate-50 dark:bg-[#0B1120] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus-visible:ring-blue-500 rounded-xl"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="password" className="text-slate-700 dark:text-slate-300 font-semibold">Password</Label>
                <div className="relative">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-3 text-slate-400"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  <Input 
                    id="password" type="password" placeholder="Enter your password"
                    className="pl-10 h-12 bg-slate-50 dark:bg-[#0B1120] border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus-visible:ring-blue-500 rounded-xl"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center space-x-2">
                  <input type="checkbox" id="remember" className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-600" />
                  <label htmlFor="remember" className="text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer">Remember Me</label>
                </div>
                <a href="#" className="text-sm font-semibold text-blue-600 dark:text-blue-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors">Forgot Password?</a>
              </div>

              {error && <p className="text-red-500 text-sm font-medium bg-red-50 dark:bg-red-500/10 p-3 rounded-lg border border-red-100 dark:border-red-500/20">{error}</p>}

              <Button type="submit" className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-md transition-all shadow-lg shadow-blue-600/25 mt-4">
                LOGIN
              </Button>
            </form>

            <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
              <div className="flex items-center space-x-1.5 whitespace-nowrap"><ShieldCheck size={16} /><span>Secure</span></div>
              <div className="flex items-center space-x-1.5 whitespace-nowrap"><Server size={16} /><span>Reliable</span></div>
              <div className="flex items-center space-x-1.5 whitespace-nowrap"><Settings2 size={16} /><span>Built for Restaurants</span></div>
            </div>
          </div>
          
          {/* Bottom Footer Info */}
          <div className="mt-8 flex flex-col md:flex-row justify-between items-center gap-2 text-xs text-slate-400 dark:text-slate-500 max-w-full">
            <span className="whitespace-nowrap">Version 1.0.0</span>
            <div className="flex items-center space-x-1.5 whitespace-nowrap">
               <ShieldCheck size={14} className="text-blue-500" />
               <span>Your data is safe and secure</span>
            </div>
            <span className="whitespace-nowrap truncate">© {new Date().getFullYear()} {restaurantName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}