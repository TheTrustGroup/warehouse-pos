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
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      resetToDefaults();
      alert('Settings reset successfully!');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Settings</h1>
          <p className="text-slate-500 text-sm">Manage your store configuration</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={handleReset}
          className="flex items-center gap-2"
        >
          <RotateCcw className="w-5 h-5" strokeWidth={2} />
          Reset to Defaults
        </Button>
      </div>

      {/* Tabs */}
      <div className="solid-card p-0 overflow-hidden animate-fade-in-up">
        <nav className="flex gap-2 px-6 border-b border-slate-200/50">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-4 border-b-2 font-semibold transition-all duration-200 ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <tab.icon className="w-5 h-5" strokeWidth={2} />
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Tab Content */}
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
