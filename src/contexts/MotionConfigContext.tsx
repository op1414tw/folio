import React, { createContext, useContext, useEffect } from 'react';
import { MotionConfig } from 'motion/react';

interface MotionPreferencesContextValue {
  animationOverhaul: boolean;
}

const MotionPreferencesContext = createContext<MotionPreferencesContextValue>({
  animationOverhaul: false,
});

export const MotionPreferencesProvider: React.FC<{
  enabled: boolean;
  children: React.ReactNode;
}> = ({ enabled, children }) => {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('motion-overhaul', enabled);
    return () => {
      document.documentElement.classList.remove('motion-overhaul');
    };
  }, [enabled]);

  return (
    <MotionPreferencesContext.Provider value={{ animationOverhaul: enabled }}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </MotionPreferencesContext.Provider>
  );
};

export function useMotionPreferences(): MotionPreferencesContextValue {
  return useContext(MotionPreferencesContext);
}
