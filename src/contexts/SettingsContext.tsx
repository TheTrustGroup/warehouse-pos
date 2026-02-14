import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { getStoredData, setStoredData, removeStoredData } from '../lib/storage';

export interface BusinessSettings {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  taxRate: number;
  currency: string;
  logo?: string;
}

export interface SystemSettings {
  lowStockThreshold: number;
  autoBackup: boolean;
  emailNotifications: boolean;
  receiptFooter: string;
  defaultWarehouse: string;
  /** UI animations (liquid glass, transitions). Respects prefers-reduced-motion when false. */
  animationsEnabled: boolean;
  /** Sound effects on sync complete / success (optional). */
  soundEffects: boolean;
}

interface SettingsContextType {
  businessSettings: BusinessSettings;
  systemSettings: SystemSettings;
  updateBusinessSettings: (settings: Partial<BusinessSettings>) => void;
  updateSystemSettings: (settings: Partial<SystemSettings>) => void;
  resetToDefaults: () => void;
}

const defaultBusinessSettings: BusinessSettings = {
  businessName: 'Extreme Dept Kidz',
  address: 'Accra, Greater Accra, Ghana',
  phone: '+233 XX XXX XXXX',
  email: 'info@extremedeptkidz.com',
  taxRate: 15,
  currency: 'GHS',
};

const defaultSystemSettings: SystemSettings = {
  lowStockThreshold: 10,
  autoBackup: true,
  emailNotifications: true,
  receiptFooter: 'Thank you for shopping with us!',
  defaultWarehouse: 'Main Store',
  animationsEnabled: true,
  soundEffects: false,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(defaultBusinessSettings);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(defaultSystemSettings);

  // Load from storage on mount (uses localStorage with in-memory fallback when unavailable)
  useEffect(() => {
    const business = getStoredData<BusinessSettings>('business_settings', defaultBusinessSettings);
    const system = getStoredData<SystemSettings>('system_settings', defaultSystemSettings);
    if (business && typeof business === 'object') setBusinessSettings({ ...defaultBusinessSettings, ...business });
    if (system && typeof system === 'object') setSystemSettings({ ...defaultSystemSettings, ...system });
  }, []);

  // Save to storage on change
  useEffect(() => {
    setStoredData('business_settings', businessSettings);
  }, [businessSettings]);

  useEffect(() => {
    setStoredData('system_settings', systemSettings);
  }, [systemSettings]);

  const updateBusinessSettings = (settings: Partial<BusinessSettings>) => {
    setBusinessSettings(prev => ({ ...prev, ...settings }));
  };

  const updateSystemSettings = (settings: Partial<SystemSettings>) => {
    setSystemSettings(prev => ({ ...prev, ...settings }));
  };

  const resetToDefaults = () => {
    setBusinessSettings(defaultBusinessSettings);
    setSystemSettings(defaultSystemSettings);
    removeStoredData('business_settings');
    removeStoredData('system_settings');
  };

  return (
    <SettingsContext.Provider value={{
      businessSettings,
      systemSettings,
      updateBusinessSettings,
      updateSystemSettings,
      resetToDefaults,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return context;
}
