import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import api from '../api/client';

interface Notification {
  id: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

export default function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then((r) => r.data).catch(() => []),
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: false,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open, handleClickOutside]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-lg hover:bg-gray-100 dark:bg-space-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors focus-ring relative"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-space-900 border border-subtle rounded-xl shadow-xl z-50 overflow-hidden dropdown-enter">
          <div className="px-4 py-3 border-b border-subtle">
            <h3 className="text-sm font-semibold">Notifications</h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {(!notifications || notifications.length === 0) ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">No notifications</div>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markReadMutation.mutate(n.id);
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:bg-space-800 transition-colors border-b border-subtle last:border-0 ${
                    n.read ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                    <div className={n.read ? 'ml-4' : ''}>
                      <p className="text-sm text-gray-600 dark:text-slate-300">{n.message}</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
