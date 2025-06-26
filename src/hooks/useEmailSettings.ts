
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export const useEmailSettings = (
  notificationEmail: string,
  setNotificationEmail: (email: string) => void
) => {
  const { user } = useAuth();

  // Load saved email from localStorage on component mount (with error handling)
  useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('cameraNotificationEmail');
      if (savedEmail) {
        setNotificationEmail(savedEmail);
      } else if (user?.email) {
        setNotificationEmail(user.email);
      }
    } catch (error) {
      console.error('Error accessing localStorage:', error);
      // Fallback to user email if localStorage is not available
      if (user?.email) {
        setNotificationEmail(user.email);
      }
    }
  }, [user, setNotificationEmail]);
};
