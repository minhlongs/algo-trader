/**
 * ToastContainer — Fixed container for stacking toast notifications
 */
import { useNotificationsStore } from '../../stores/notifications-store';
import { ToastItem } from './ToastItem';

export function ToastContainer() {
  const { notifications, removeNotification } = useNotificationsStore();

  if (notifications.length === 0) return null;

  return (
    <div
      className="fixed top-20 right-6 z-[60] flex flex-col gap-2"
      style={{ maxWidth: '440px', width: '100%' }}
    >
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          style={{
            animation: `slideIn 0.3s ease-out ${index * 0.1}s both`,
          }}
        >
          <ToastItem notification={notification} onClose={() => removeNotification(notification.id)} />
        </div>
      ))}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
