import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, ShieldAlert, CheckCircle2 } from "lucide-react";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleNext = async () => {
    setError("");
    if (step === 1) {
      if (!username) {
        setError("Please enter your username/email");
        return;
      }
      try {
        const q: any = await invoke("get_security_question", { username });
        if (q) {
          setQuestion(q);
          setStep(2);
        }
      } catch (err: any) {
        setError(err.toString());
      }
    } else if (step === 2) {
      if (!answer || !newPassword) {
        setError("Please provide an answer and a new password.");
        return;
      }
      try {
        await invoke("reset_password_with_security_answer", {
          username,
          answer,
          newPassword
        });
        setSuccess(true);
      } catch (err: any) {
        setError(err.toString());
      }
    }
  };

  const handleClose = () => {
    setStep(1);
    setUsername("");
    setQuestion("");
    setAnswer("");
    setNewPassword("");
    setError("");
    setSuccess(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-500">
              <ShieldAlert size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Reset Password</h2>
          </div>
          <button onClick={handleClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Password Reset!</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">Your password has been successfully updated. You can now log in.</p>
              <button onClick={handleClose} className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors">
                Back to Login
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {step === 1 && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Enter your Username / Email</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="admin@restaurant.com"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Note: You must have previously set up a Security Question in your Settings to use this feature.
                  </p>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="p-4 bg-orange-50 dark:bg-orange-500/10 rounded-lg border border-orange-100 dark:border-orange-500/20">
                    <p className="text-sm font-semibold text-orange-800 dark:text-orange-400 text-center">{question}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Security Answer</label>
                    <input
                      type="text"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter your answer"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="Enter new password"
                    />
                  </div>
                </div>
              )}

              {error && <p className="text-red-600 dark:text-red-400 text-sm font-bold text-center">{error}</p>}

              <button
                onClick={handleNext}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors mt-2"
              >
                {step === 1 ? "Next" : "Reset Password"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
