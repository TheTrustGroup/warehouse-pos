import { useState, useEffect, useCallback } from 'react';
import { Users as UsersIcon, Plus, Shield, KeyRound, Copy, MapPin, Trash2 } from 'lucide-react';
import { User, Warehouse } from '../../types';
import { ROLES } from '../../types/permissions';
import { emailForRole, getDefaultUserPassword, ROLES_WITH_SHARED_PASSWORD } from '../../constants/defaultCredentials';
import { useToast } from '../../contexts/ToastContext';
import { useStore } from '../../contexts/StoreContext';
import { API_BASE_URL } from '../../lib/api';
import { apiGet } from '../../lib/apiClient';
import { getUserScopes, setUserScopes } from '../../services/userScopesApi';

interface ScopeEntry {
  storeId: string;
  warehouseId: string;
  storeName?: string;
  warehouseName?: string;
}

export function UserManagement() {
  const [users] = useState<User[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: emailForRole('viewer'),
    role: 'viewer' as User['role'],
    password: getDefaultUserPassword(),
  });
  const { showToast } = useToast();
  const { stores } = useStore();

  // Store & warehouse assignment (admin)
  const [scopeEmail, setScopeEmail] = useState('');
  const [scopeList, setScopeList] = useState<ScopeEntry[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [warehousesForStore, setWarehousesForStore] = useState<Warehouse[]>([]);
  const [loadingScopes, setLoadingScopes] = useState(false);
  const [savingScopes, setSavingScopes] = useState(false);

  const suggestedScopeEmail = newUser.role === 'admin' || newUser.role === 'super_admin' ? '' : (newUser.email || emailForRole(newUser.role));

  const loadScopesForEmail = useCallback(async (email: string) => {
    const e = email?.trim()?.toLowerCase();
    if (!e) return;
    setLoadingScopes(true);
    try {
      const scopes = await getUserScopes(e);
      setScopeList(scopes.map((s) => ({ storeId: s.storeId, warehouseId: s.warehouseId, storeName: s.storeName, warehouseName: s.warehouseName })));
    } catch {
      showToast('error', 'Failed to load scope for this user.');
      setScopeList([]);
    } finally {
      setLoadingScopes(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!selectedStoreId?.trim()) {
      setWarehousesForStore([]);
      setSelectedWarehouseId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await apiGet<Warehouse[]>(API_BASE_URL, `/api/warehouses?store_id=${encodeURIComponent(selectedStoreId)}`);
        if (!cancelled && Array.isArray(list)) setWarehousesForStore(list);
        else if (!cancelled) setWarehousesForStore([]);
      } catch {
        if (!cancelled) setWarehousesForStore([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedStoreId]);

  const addScopeEntry = () => {
    if (!selectedStoreId?.trim() || !selectedWarehouseId?.trim()) return;
    const store = stores.find((s) => s.id === selectedStoreId);
    const wh = warehousesForStore.find((w) => w.id === selectedWarehouseId);
    const exists = scopeList.some((s) => s.storeId === selectedStoreId && s.warehouseId === selectedWarehouseId);
    if (exists) return;
    setScopeList((prev) => [...prev, { storeId: selectedStoreId, warehouseId: selectedWarehouseId, storeName: store?.name, warehouseName: wh?.name }]);
    setSelectedWarehouseId('');
  };

  const removeScopeEntry = (index: number) => {
    setScopeList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveScopes = async () => {
    const e = scopeEmail?.trim()?.toLowerCase();
    if (!e) {
      showToast('error', 'Enter the user’s login email.');
      return;
    }
    setSavingScopes(true);
    try {
      await setUserScopes(e, scopeList.map((s) => ({ storeId: s.storeId, warehouseId: s.warehouseId })));
      showToast('success', 'Store & warehouse access saved. User will see only these locations in POS.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSavingScopes(false);
    }
  };

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    cashier: 'bg-green-100 text-green-700',
    warehouse: 'bg-amber-100 text-amber-700',
    driver: 'bg-cyan-100 text-cyan-700',
    viewer: 'bg-slate-100 text-slate-700',
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
  };

  const handleCreateUser = () => {
    // Validate form
    if (!newUser.fullName.trim()) {
      showToast('error', 'Please enter a full name');
      return;
    }

    const email = newUser.role === 'admin' ? '' : emailForRole(newUser.role);
    const password = newUser.role === 'admin' ? '' : getDefaultUserPassword();
    
    // Create user details string
    const userDetails = `User Details:
Full Name: ${newUser.fullName}
Email: ${email || '(Set in backend)'}
Role: ${newUser.role}
Password: ${password || '(Set in backend)'}

Create this user in your backend admin panel with these exact credentials.`;
    
    // Copy to clipboard
    const textToCopy = newUser.role === 'admin' 
      ? `Full Name: ${newUser.fullName}\nRole: ${newUser.role}\nEmail and Password: Set in backend`
      : `Email: ${email}\nPassword: ${password}\nRole: ${newUser.role}\nFull Name: ${newUser.fullName}`;
    
    navigator.clipboard?.writeText(textToCopy).then(() => {
      showToast('success', `User details copied to clipboard! Create this user in your backend admin panel:\nEmail: ${email || '(set in backend)'}\nPassword: ${password || '(set in backend)'}\nRole: ${newUser.role}`);
      
      // Reset form
      setNewUser({
        fullName: '',
        email: emailForRole('viewer'),
        role: 'viewer' as User['role'],
        password: getDefaultUserPassword(),
      });
      setShowAddUser(false);
    }).catch(() => {
      // Fallback if clipboard API fails
      showToast('warning', userDetails);
    });
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Default logins section hidden in production */}
      {!import.meta.env.PROD && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-bold text-slate-900">Logins for other roles</h3>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Keep admin credentials as you have them. For <strong>manager, cashier, warehouse, driver, viewer</strong> use: email <strong>role@extremedeptkidz.com</strong>, password <strong>{getDefaultUserPassword() || '(set in backend)'}</strong> (same for all).
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Email (login)</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-700">Password</th>
                  <th className="px-4 py-3 w-10" aria-label="Copy" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {Object.values(ROLES)
                  .filter((role) => ROLES_WITH_SHARED_PASSWORD.includes(role.id as typeof ROLES_WITH_SHARED_PASSWORD[number]))
                  .map((role) => (
                    <tr key={role.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${roleColors[role.id]}`}>
                          {role.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-800">{emailForRole(role.id)}</td>
                      <td className="px-4 py-3 font-mono text-slate-800">{getDefaultUserPassword() || '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(`${emailForRole(role.id)}\t${getDefaultUserPassword()}`)}
                          className="p-1.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700"
                          title="Copy email and password"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="glass-card animate-fade-in-up">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <UsersIcon className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-bold text-slate-900">User Management</h2>
          </div>
          <button
            onClick={() => setShowAddUser(!showAddUser)}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>

      {/* Empty State - Users are managed in backend */}
      {users.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UsersIcon className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Users are managed in your backend</h3>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">
            User accounts are created and managed in your backend admin panel. Use the "Add User" button above to copy credentials for creating new users in your backend.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://extremedeptkidz.com/admin"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              Go to Backend Admin
            </a>
            <a
              href="/CREATE_USER_IN_BACKEND.md"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary inline-flex items-center gap-2"
            >
              View Setup Guide
            </a>
          </div>
        </div>
      )}

      {/* Users Table - Only show if users exist (for future API integration) */}
      {users.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary-600 font-semibold">
                          {user.fullName.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{user.fullName}</p>
                        <p className="text-sm text-slate-500">@{user.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[user.role]}`}>
                      <Shield className="w-3 h-3" />
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      user.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {user.lastLogin.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User Form */}
      {showAddUser && (
        <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <h3 className="font-semibold text-slate-900 mb-2">Add New User</h3>
          {!import.meta.env.PROD && (
            <p className="text-sm text-slate-600 mb-4">
              {newUser.role !== 'admin' ? (
                <>Email: <strong>{newUser.role}@extremedeptkidz.com</strong>. Password: <strong>{getDefaultUserPassword() || '(set in backend)'}</strong> (same for all other roles).</>
              ) : (
                <>Admin: set email and password in your backend. Keep your existing admin credentials.</>
              )}
            </p>
          )}
          {import.meta.env.PROD && (
            <p className="text-sm text-slate-600 mb-4">
              User credentials are managed in the backend. Contact your administrator to create new users.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                value={newUser.fullName}
                onChange={(e) => setNewUser((u) => ({ ...u, fullName: e.target.value }))}
                placeholder="e.g. Store Manager"
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
              <select
                value={newUser.role}
                onChange={(e) => {
                  const role = e.target.value as User['role'];
                  setNewUser((u) => ({ ...u, role, email: emailForRole(role), password: getDefaultUserPassword() }));
                }}
                className="input-field w-full"
              >
                {Object.values(ROLES).map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email (login)</label>
              <input
                type="email"
                value={newUser.role === 'admin' || newUser.role === 'super_admin' ? '' : (newUser.email || emailForRole(newUser.role))}
                readOnly={newUser.role === 'admin' || newUser.role === 'super_admin'}
                placeholder={newUser.role === 'admin' || newUser.role === 'super_admin' ? 'Set in backend / VITE_SUPER_ADMIN_EMAILS' : undefined}
                className="input-field w-full bg-slate-100 font-mono text-slate-700"
              />
            </div>
            {!import.meta.env.PROD && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input
                    type="text"
                    value={newUser.role === 'admin' || newUser.role === 'super_admin' ? '' : newUser.password}
                    readOnly
                    placeholder={newUser.role === 'admin' || newUser.role === 'super_admin' ? 'Set in backend' : undefined}
                    className="input-field w-full bg-slate-100 font-mono text-slate-700"
                  />
                </div>
                {newUser.role !== 'admin' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
                    <input
                      type="text"
                      value={getDefaultUserPassword()}
                      readOnly
                      className="input-field w-full bg-slate-100 font-mono text-slate-700"
                    />
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex gap-3 mt-4">
            <button 
              type="button" 
              onClick={handleCreateUser}
              className="btn-primary"
            >
              Create User (set in backend)
            </button>
            <button type="button" onClick={() => setShowAddUser(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Assign store & warehouse to user (admin). No assignment = access to all (legacy). */}
      <div className="mt-8 pt-8 border-t border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-5 h-5 text-primary-600" aria-hidden />
          <h3 className="text-lg font-semibold text-slate-900">Store & warehouse access</h3>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Assign which store(s) and warehouse(s) a user can use in POS. No assignment = access to all (legacy). Use the login email of the user.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">User email (login)</label>
            <div className="flex gap-2 flex-wrap">
              <input
                type="email"
                value={scopeEmail}
                onChange={(e) => setScopeEmail(e.target.value)}
                onBlur={() => scopeEmail.trim() && loadScopesForEmail(scopeEmail)}
                placeholder="e.g. cashier@extremedeptkidz.com"
                className="input-field flex-1 min-w-[200px]"
                aria-label="User email for scope"
              />
              <button
                type="button"
                onClick={() => loadScopesForEmail(scopeEmail)}
                disabled={loadingScopes || !scopeEmail.trim()}
                className="btn-secondary"
              >
                {loadingScopes ? 'Loading…' : 'Load'}
              </button>
              {showAddUser && suggestedScopeEmail && (
                <button
                  type="button"
                  onClick={() => { setScopeEmail(suggestedScopeEmail); loadScopesForEmail(suggestedScopeEmail); }}
                  className="btn-secondary text-sm"
                >
                  Use suggested ({suggestedScopeEmail})
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Store</label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="input-field w-full"
                aria-label="Select store"
              >
                <option value="">— Select store —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Warehouse</label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                disabled={!selectedStoreId}
                className="input-field w-full"
                aria-label="Select warehouse"
              >
                <option value="">— Select warehouse —</option>
                {warehousesForStore.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={addScopeEntry}
            disabled={!selectedStoreId || !selectedWarehouseId}
            className="btn-secondary"
          >
            Add location
          </button>
          {scopeList.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Assigned locations</p>
              <ul className="space-y-2">
                {scopeList.map((entry, i) => (
                  <li key={`${entry.storeId}-${entry.warehouseId}-${i}`} className="flex items-center justify-between gap-2 py-2 px-3 bg-slate-50 rounded-xl border border-slate-200/60">
                    <span className="text-sm text-slate-800">
                      {entry.storeName ?? entry.storeId} → {entry.warehouseName ?? entry.warehouseId}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeScopeEntry(i)}
                      className="btn-action btn-action-delete"
                      aria-label="Remove location"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={handleSaveScopes}
                disabled={savingScopes}
                className="btn-primary mt-3"
              >
                {savingScopes ? 'Saving…' : 'Save store & warehouse access'}
              </button>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
