import { useState } from 'react';
import { Settings as SettingsIcon, Save } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { validateSystemPreferences } from '../../lib/validationSchemas';
import { Button } from '../ui/Button';

export function SystemPreferences() {
  const { systemSettings, updateSystemSettings } = useSettings();
  const { showToast } = useToast();
  const [formData, setFormData] = useState(systemSettings);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    try {
      const validated = validateSystemPreferences(formData);
      setIsSubmitting(true);
      updateSystemSettings(validated);
      showToast('success', 'System preferences updated successfully.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Invalid settings.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="solid-card animate-fade-in-up">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="w-6 h-6 text-primary-600" />
        <h2 className="text-xl font-bold text-slate-900">System Preferences</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Low Stock Threshold
            </label>
            <input
              type="number"
              value={formData.lowStockThreshold}
              onChange={e => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value) })}
              className="input-field"
              min="1"
            />
            <p className="text-xs text-slate-500 mt-1">Alert when stock falls below this number</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Warehouse
            </label>
            <input
              type="text"
              value={formData.defaultWarehouse}
              onChange={e => setFormData({ ...formData, defaultWarehouse: e.target.value })}
              className="input-field"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Receipt Footer Message
          </label>
          <textarea
            value={formData.receiptFooter}
            onChange={e => setFormData({ ...formData, receiptFooter: e.target.value })}
            className="input-field"
            rows={3}
            placeholder="This message will appear at the bottom of all receipts"
          />
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.autoBackup}
              onChange={e => setFormData({ ...formData, autoBackup: e.target.checked })}
              className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <p className="font-medium text-slate-900">Enable Auto Backup</p>
              <p className="text-sm text-slate-500">Automatically backup data daily</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.emailNotifications}
              onChange={e => setFormData({ ...formData, emailNotifications: e.target.checked })}
              className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <p className="font-medium text-slate-900">Email Notifications</p>
              <p className="text-sm text-slate-500">Receive alerts for low stock and daily reports</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.animationsEnabled}
              onChange={e => setFormData({ ...formData, animationsEnabled: e.target.checked })}
              className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <p className="font-medium text-slate-900">Enable animations</p>
              <p className="text-sm text-slate-500">Liquid glass transitions, hover effects. Respects system reduce-motion.</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.soundEffects}
              onChange={e => setFormData({ ...formData, soundEffects: e.target.checked })}
              className="w-5 h-5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <div>
              <p className="font-medium text-slate-900">Sound effects</p>
              <p className="text-sm text-slate-500">Optional sounds on sync complete (when enabled).</p>
            </div>
          </label>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" className="flex items-center gap-2" disabled={isSubmitting} aria-busy={isSubmitting}>
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving…' : 'Save Preferences'}
          </Button>
        </div>
      </form>
    </div>
  );
}
