import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { useNotificationStore } from '../store/notificationStore';

export function NotificationBar() {
  const notifications = useNotificationStore((state) => state.notifications);
  const dismiss = useNotificationStore((state) => state.dismiss);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-auto max-w-[90vw]">
      {notifications.map((notification) => {
        const isError = notification.type === 'error';
        const isSuccess = notification.type === 'success';

        const Icon = isError
          ? AlertTriangle
          : isSuccess
          ? CheckCircle
          : Info;

        const colorClasses = isError
          ? 'border-red-300 bg-red-50 text-red-800'
          : isSuccess
          ? 'border-green-300 bg-green-50 text-green-800'
          : 'border-blue-300 bg-blue-50 text-blue-800';

        const iconColor = isError
          ? 'text-red-500'
          : isSuccess
          ? 'text-green-500'
          : 'text-blue-500';

        const buttonColor = isError
          ? 'text-red-500 hover:text-red-700 hover:bg-red-100'
          : isSuccess
          ? 'text-green-500 hover:text-green-700 hover:bg-green-100'
          : 'text-blue-500 hover:text-blue-700 hover:bg-blue-100';

        return (
          <div
            key={notification.id}
            role="alert"
            aria-live="assertive"
            className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-lg ${colorClasses}`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} aria-hidden="true" />
            <span className="font-medium">{notification.message}</span>
            <button
              onClick={() => dismiss(notification.id)}
              className={`p-1 rounded transition-colors ${buttonColor}`}
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

