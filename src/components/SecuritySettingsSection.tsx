import { useState, useEffect } from "react";
import { invoke } from "../lib/api";
import { useAuth } from "../lib/auth";
import { ShieldAlert, Save } from "lucide-react";

export default function SecuritySettingsSection() {
  const { user } = useAuth();
  const [question, setQuestion] = useState("What is your pet's name?");
  const [customQuestion, setCustomQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState("");

  const commonQuestions = [
    "What is your pet's name?",
    "What was the name of your first school?",
    "What city were you born in?",
    "What is your mother's maiden name?",
    "What was the make of your first car?"
  ];

  useEffect(() => {
    if (!user?.username) return;

    invoke("get_security_question", { username: user.username })
      .then((q: any) => {
        if (q) {
          if (commonQuestions.includes(q)) {
            setQuestion(q);
          } else {
            setQuestion("Custom Question...");
            setCustomQuestion(q);
          }
        }
      })
      .catch((e) => console.log("No security question set yet", e));
  }, [user?.username]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");

    const username = user?.username;
    if (!username) {
      setMessage("User not found in session. Please log out and log back in.");
      return;
    }

    const finalQuestion = question === "Custom Question..." ? customQuestion.trim() : question;
    if (!finalQuestion) {
      setMessage("Please provide a security question.");
      return;
    }

    try {
      await invoke("update_security_question", {
        username: username,
        question: finalQuestion,
        answer: answer.trim()
      });
      setMessage("Security question saved successfully!");
      setAnswer(""); // clear answer for security
      setTimeout(() => setMessage(""), 3000);
    } catch (err: any) {
      setMessage(err.toString());
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center border border-orange-100 dark:border-orange-800">
          <ShieldAlert size={20} className="text-orange-600 dark:text-orange-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Security & Password Reset</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Set a security question to recover your account if you forget your password</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Security Question</label>
          <select 
            value={question} 
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 cursor-pointer"
          >
            {commonQuestions.map(q => (
              <option key={q} value={q}>{q}</option>
            ))}
            <option value="Custom Question...">Custom Question...</option>
          </select>
        </div>

        {question === "Custom Question..." && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Your Custom Question</label>
            <input 
              type="text" 
              value={customQuestion} 
              onChange={(e) => setCustomQuestion(e.target.value)}
              required
              className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" 
              placeholder="e.g. What is my favorite food?"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Answer</label>
          <input 
            type="text" 
            value={answer} 
            onChange={(e) => setAnswer(e.target.value)}
            required
            className="w-full h-11 bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 rounded-lg px-4 text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" 
            placeholder="Your secret answer..."
          />
        </div>

        {message && (
          <p className={`text-sm font-bold ${message.includes("success") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {message}
          </p>
        )}

        <button type="submit" className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center space-x-2 mt-4 shadow-lg shadow-orange-600/20 cursor-pointer">
          <Save size={18} />
          <span>Save Security Question</span>
        </button>
      </form>
    </div>
  );
}
