import { useNavigate } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <p className="text-gray-500 dark:text-slate-400 mb-6">Page not found</p>
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-gray-900 dark:text-white rounded-lg transition-colors"
      >
        <Home className="w-4 h-4" />
        Back to Dashboard
      </button>
    </div>
  );
}
