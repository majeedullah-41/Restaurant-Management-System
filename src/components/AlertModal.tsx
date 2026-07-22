import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';

export type AlertModalType = 'danger' | 'warning' | 'info' | 'success';

interface AlertModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: AlertModalType;
  onClose: () => void;
  buttonText?: string;
}

export function AlertModal({
  isOpen,
  title,
  message,
  type = 'info',
  onClose,
  buttonText = 'OK',
}: AlertModalProps) {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <XCircle className="text-red-600 dark:text-red-400" size={24} />;
      case 'success':
        return <CheckCircle className="text-emerald-600 dark:text-emerald-400" size={24} />;
      case 'warning':
        return <AlertTriangle className="text-amber-600 dark:text-amber-400" size={24} />;
      case 'info':
      default:
        return <Info className="text-blue-600 dark:text-blue-400" size={24} />;
    }
  };

  const getIconBg = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-100 dark:bg-red-500/20';
      case 'success':
        return 'bg-emerald-100 dark:bg-emerald-500/20';
      case 'warning':
        return 'bg-amber-100 dark:bg-amber-500/20';
      case 'info':
      default:
        return 'bg-blue-100 dark:bg-blue-500/20';
    }
  };

  const getButtonClasses = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 shadow-red-600/20 text-white';
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20 text-white';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20 text-white';
      case 'info':
      default:
        return 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 text-white';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-center space-x-4 mb-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${getIconBg()}`}>
              {getIcon()}
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h3>
            </div>
          </div>
          
          <div className="mb-6">
            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">{message}</p>
          </div>

          <div className="flex items-center">
            <button
              onClick={onClose}
              className={`flex-1 px-4 py-2.5 rounded-xl font-semibold shadow-lg transition-colors flex items-center justify-center space-x-2 ${getButtonClasses()}`}
            >
              <span>{buttonText}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
