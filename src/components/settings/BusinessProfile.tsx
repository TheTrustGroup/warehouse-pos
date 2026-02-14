import { useState } from 'react';
import { Building2, Save, Upload } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { validateBusinessProfile } from '../../lib/validationSchemas';
import { Button } from '../ui/Button';

export function BusinessProfile() {
  const { businessSettings, updateBusinessSettings } = useSettings();
  const { showToast } = useToast();
  const [formData, setFormData] = useState(businessSettings);
  const [logoPreview, setLogoPreview] = useState(businessSettings.logo || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setLogoPreview(result);
        setFormData({ ...formData, logo: result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    try {
      const validated = validateBusinessProfile({ ...formData, logo: formData.logo ?? logoPreview });
      setIsSubmitting(true);
      updateBusinessSettings({ ...validated, logo: formData.logo ?? logoPreview ?? businessSettings.logo });
      showToast('success', 'Business profile updated successfully.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Please check required fields.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="solid-card animate-fade-in-up">
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="w-6 h-6 text-primary-600" strokeWidth={2} />
        <h2 className="text-xl font-semibold text-slate-900">Business Profile</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Logo Upload */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Business Logo
          </label>
          <div className="flex items-center gap-4">
            {logoPreview && (
              <img
                src={logoPreview}
                alt="Logo preview"
                className="w-20 h-20 object-contain rounded-lg border-2 border-slate-200"
              />
            )}
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
                id="logo-upload"
              />
              <label
                htmlFor="logo-upload"
                className="btn-secondary cursor-pointer inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload Logo
              </label>
            </div>
          </div>
        </div>

        {/* Business Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Business Name *
            </label>
            <input
              type="text"
              value={formData.businessName}
              onChange={e => setFormData({ ...formData, businessName: e.target.value })}
              className="input-field"
              required
              aria-required="true"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Phone Number *
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
              className="input-field"
              required
              aria-required="true"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="input-field"
              required
              aria-required="true"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Tax Rate (%) *
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.taxRate}
              onChange={e => setFormData({ ...formData, taxRate: parseFloat(e.target.value) })}
              className="input-field"
              required
              aria-required="true"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Address *
            </label>
            <textarea
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              className="input-field"
              rows={3}
              required
              aria-required="true"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" className="flex items-center gap-2" disabled={isSubmitting} aria-busy={isSubmitting}>
            <Save className="w-4 h-4" />
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
