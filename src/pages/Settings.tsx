import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Settings as SettingsIcon, Users, Tag, RotateCcw, Database, Shield } from 'lucide-react';
import { BusinessProfile } from '../components/settings/BusinessProfile';
import { SystemPreferences } from '../components/settings/SystemPreferences';
import { UserManagement } from '../components/settings/UserManagement';
import { CategoryManagement } from '../components/settings/CategoryManagement';
import { LocalStorageCacheView } from '../components/settings/LocalStorageCacheView';
import { AdminDashboard } from '../components/settings/AdminDashboard';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../contexts/ToastContext';
import { Button } from '../components/ui/Button';

type SettingsTab = 'business' | 'system' | 'users' | 'categories' | 'cache' | 'admin';

const TAB_IDS: SettingsTab[] = ['business', 'system', 'users', 'categories', 'cache', 'admin'];

export function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as SettingsTab | null;
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    tabParam && TAB_IDS.includes(tabParam) ? tabParam : 'business'
  );
  const { resetToDefaults } = useSettings();
  const { showToast } = useToast();

  // Update tab when URL param changes
  useEffect(() => {
    if (tabParam && TAB_IDS.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  // Update URL when tab changes
  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const tabs = [
    { id: 'business' as SettingsTab, label: 'Business Profile', icon: Building2 },
    { id: 'system' as SettingsTab, label: 'System', icon: SettingsIcon },
    { id: 'users' as SettingsTab, label: 'Users', icon: Users },
    { id: 'categories' as SettingsTab, label: 'Categories', icon: Tag },
    { id: 'cache' as SettingsTab, label: 'Data & cache', icon: Database },
    { id: 'admin' as SettingsTab, label: 'Admin & logs', icon: Shield },
  ];

  const handleReset = () => {
    if (window.confirm('Reset all settings to defaults? Business profile, system preferences, and local cache settings will be restored. This cannot be undone.')) {
      resetToDefaults();
      showToast('success', 'Settings reset to defaults. Refresh the page if you don’t see changes.');
    }
  };

  return (
    <div className="space-y-8 min-h-screen bg-[var(--edk-bg)]">
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-3xl font-bold text-[var(--edk-ink)] tracking-tight mb-2" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Settings</h1>
          <p className="text-[var(--edk-ink-2)] text-sm">Manage your store configuration</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={handleReset}
          className="flex items-center gap-2"
          leftIcon={<RotateCcw className="w-5 h-5" strokeWidth={2} />}
        >
          Reset to Defaults
        </Button>
      </div>

      <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-0 overflow-hidden animate-fade-in-up">
        <nav className="flex gap-2 px-6 border-b border-[var(--edk-border)]">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-4 border-b-2 font-semibold transition-all duration-200 ${
                activeTab === tab.id
                  ? 'border-[var(--edk-red)] text-[var(--edk-red)]'
                  : 'border-transparent text-[var(--edk-ink-2)] hover:text-[var(--edk-ink)]'
              }`}
            >
              <tab.icon className="w-5 h-5" strokeWidth={2} />
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="p-6">
          {activeTab === 'business' && <BusinessProfile />}
          {activeTab === 'system' && <SystemPreferences />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'categories' && <CategoryManagement />}
          {activeTab === 'cache' && <LocalStorageCacheView />}
          {activeTab === 'admin' && <AdminDashboard />}
        </div>
      </div>
    </div>
  );
}
