import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

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
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(defaultBusinessSettings);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(defaultSystemSettings);

  // Load from localStorage on mount
  useEffect(() => {
    const storedBusiness = localStorage.getItem('business_settings');
    const storedSystem = localStorage.getItem('system_settings');

    if (storedBusiness) {
      setBusinessSettings(JSON.parse(storedBusiness));
    }
    if (storedSystem) {
      setSystemSettings(JSON.parse(storedSystem));
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem('business_settings', JSON.stringify(businessSettings));
  }, [businessSettings]);

  useEffect(() => {
    localStorage.setItem('system_settings', JSON.stringify(systemSettings));
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
    localStorage.removeItem('business_settings');
    localStorage.removeItem('system_settings');
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
