import { useEffect, useRef } from 'react';

export type NotificationPermission = 'default' | 'granted' | 'denied';

export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return Promise.resolve('denied');
  return Notification.requestPermission();
}

export function sendNotification(title: string, body?: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: '/favicon.ico' });
}

export function useStepChangeNotifications(steps: Array<{ id: string; status: string; name: string; owner_type: string }> | undefined): void {
  const prevStatusesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!steps) return;

    for (const step of steps) {
      const prev = prevStatusesRef.current[step.id];
      const curr = step.status;

      if (prev !== undefined && prev !== curr) {
        if (curr === 'running' && step.owner_type === 'approval_gate') {
          sendNotification('AWW — Action Required', `Step "${step.name}" needs your approval`);
        }
        if (curr === 'completed') {
          sendNotification('AWW — Step Completed', `"${step.name}" finished`);
        }
      }

      prevStatusesRef.current[step.id] = curr;
    }
  }, [steps]);
}
