import { useState, useEffect, useCallback } from 'react';
import { Users as UsersIcon, Plus, Shield, KeyRound, Copy, MapPin, Trash2 } from 'lucide-react';
import { User, Warehouse } from '../../types';
import { ROLES } from '../../types/permissions';
import { emailForRole, getDefaultUserPassword, ROLES_WITH_SHARED_PASSWORD } from '../../constants/defaultCredentials';
import { useToast } from '../../contexts/ToastContext';
import { useStore } from '../../contexts/StoreContext';
import { API_BASE_URL } from '../../lib/api';
import { apiGet } from '../../lib/apiClient';
import { getUserFriendlyMessage } from '../../lib/errorMessages';
import { getUserScopes, setUserScopes } from '../../services/userScopesApi';
import { Button } from '../ui/Button';

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

  // Add User: assign POS (store/warehouse) when creating user — single flow
  const [addUserStoreId, setAddUserStoreId] = useState('');
  const [addUserWarehouseId, setAddUserWarehouseId] = useState('');
  const [addUserWarehouses, setAddUserWarehouses] = useState<Warehouse[]>([]);
  const [addUserPosList, setAddUserPosList] = useState<ScopeEntry[]>([]);

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

  // Add User form: load warehouses when store changes
  useEffect(() => {
    if (!addUserStoreId?.trim()) {
      setAddUserWarehouses([]);
      setAddUserWarehouseId('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await apiGet<Warehouse[]>(API_BASE_URL, `/api/warehouses?store_id=${encodeURIComponent(addUserStoreId)}`);
        if (!cancelled && Array.isArray(list)) setAddUserWarehouses(list);
        else if (!cancelled) setAddUserWarehouses([]);
      } catch {
        if (!cancelled) setAddUserWarehouses([]);
      }
    })();
    return () => { cancelled = true; };
  }, [addUserStoreId]);

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

  const addAddUserPosEntry = () => {
    if (!addUserStoreId?.trim() || !addUserWarehouseId?.trim()) return;
    const store = stores.find((s) => s.id === addUserStoreId);
    const wh = addUserWarehouses.find((w) => w.id === addUserWarehouseId);
    const exists = addUserPosList.some((s) => s.storeId === addUserStoreId && s.warehouseId === addUserWarehouseId);
    if (exists) return;
    setAddUserPosList((prev) => [...prev, { storeId: addUserStoreId, warehouseId: addUserWarehouseId, storeName: store?.name, warehouseName: wh?.name }]);
    setAddUserWarehouseId('');
  };

  const removeAddUserPosEntry = (index: number) => {
    setAddUserPosList((prev) => prev.filter((_, i) => i !== index));
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
      showToast('error', getUserFriendlyMessage(err));
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

  const handleCreateUser = async () => {
    if (!newUser.fullName.trim()) {
      showToast('error', 'Please enter a full name');
      return;
    }

    const email = (newUser.role === 'admin' || newUser.role === 'super_admin') ? '' : (newUser.email?.trim() || emailForRole(newUser.role));
    const password = (newUser.role === 'admin' || newUser.role === 'super_admin') ? '' : getDefaultUserPassword();

    const userDetails = `User Details:
Full Name: ${newUser.fullName}
Email: ${email || '(Set in backend)'}
Role: ${newUser.role}
Password: ${password || '(Set in backend)'}

Create this user in your backend admin panel with these exact credentials.`;

    const textToCopy = (newUser.role === 'admin' || newUser.role === 'super_admin')
      ? `Full Name: ${newUser.fullName}\nRole: ${newUser.role}\nEmail and Password: Set in backend`
      : `Email: ${email}\nPassword: ${password}\nRole: ${newUser.role}\nFull Name: ${newUser.fullName}`;

    try {
      await navigator.clipboard?.writeText(textToCopy);
    } catch {
      showToast('warning', userDetails);
      return;
    }

    // Persist POS access for this user so they only see assigned store(s)
    if (email && addUserPosList.length > 0) {
      setSavingScopes(true);
      try {
        await setUserScopes(email, addUserPosList.map((s) => ({ storeId: s.storeId, warehouseId: s.warehouseId })));
        showToast('success', `User details copied. POS access saved: ${addUserPosList.map((s) => s.storeName ?? s.storeId).join(', ')}. Create this user in your backend with the copied credentials.`);
      } catch (err) {
        showToast('error', getUserFriendlyMessage(err));
        setSavingScopes(false);
        return;
      } finally {
        setSavingScopes(false);
      }
    } else {
      showToast('success', `User details copied to clipboard! Create this user in your backend admin panel:\nEmail: ${email || '(set in backend)'}\nPassword: ${password || '(set in backend)'}\nRole: ${newUser.role}`);
    }

    setNewUser({
      fullName: '',
      email: emailForRole('viewer'),
      role: 'viewer' as User['role'],
      password: getDefaultUserPassword(),
    });
    setAddUserPosList([]);
    setAddUserStoreId('');
    setAddUserWarehouseId('');
    setAddUserWarehouses([]);
    setShowAddUser(false);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Default logins section hidden in production */}
      {!import.meta.env.PROD && (
        <div className="solid-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-bold text-slate-900">Logins for other roles</h3>
          </div>
          <p className="text-sm text-slate-600 mb-4">
            Keep admin credentials as you have them. For <strong>manager, cashier, warehouse, driver, viewer</strong> use: email <strong>role@extremedeptkidz.com</strong>, password <strong>{getDefaultUserPassword() || '(set in backend)'}</strong> (same for all).
          </p>
          <div className="table-scroll-wrap rounded-lg border border-slate-200">
            <table className="w-full text-sm min-w-[280px]">
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
                        <Button
                          type="button"
                          variant="action"
                          onClick={() => copyToClipboard(`${emailForRole(role.id)}\t${getDefaultUserPassword()}`)}
                          className="p-2 rounded hover:bg-slate-200 active:bg-slate-300 text-slate-500 hover:text-slate-700 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                          title="Copy email and password"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="solid-card animate-fade-in-up">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <UsersIcon className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-bold text-slate-900">User Management</h2>
          </div>
          <Button
            type="button"
            onClick={() => setShowAddUser(!showAddUser)}
            variant="primary"
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add User
          </Button>
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
        <div className="table-scroll-wrap">
          <table className="w-full min-w-[320px]">
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
                <>Email: <strong>{newUser.role}@extremedeptkidz.com</strong>. Password: <strong>{getDefaultUserPassword() || '(set in backend)'}</strong> (same for all other roles).{newUser.role === 'cashier' && (<> For another POS (e.g. Main town), use <strong>cashier_maintown@…</strong> then assign that email in &quot;Store & warehouse access&quot; below.</>)}</>
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
                onChange={(e) => {
                  if (newUser.role !== 'admin' && newUser.role !== 'super_admin') {
                    setNewUser((u) => ({ ...u, email: e.target.value.trim() || emailForRole(u.role) }));
                  }
                }}
                placeholder={newUser.role === 'admin' || newUser.role === 'super_admin' ? 'Set in backend / VITE_SUPER_ADMIN_EMAILS' : 'e.g. maintown_cashier@extremedeptkidz.com'}
                className={`input-field w-full font-mono ${newUser.role === 'admin' || newUser.role === 'super_admin' ? 'bg-slate-100 text-slate-700' : 'text-slate-800'}`}
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

          {/* POS access: assign which store(s) this user can use (Main Town, Store, etc.) */}
          {newUser.role !== 'admin' && newUser.role !== 'super_admin' && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-800 mb-1">POS access</h4>
              <p className="text-sm text-slate-600 mb-3">
                Assign which location(s) this user can use — e.g. Main Town or Store. They will only see these in POS.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Store</label>
                  <select
                    value={addUserStoreId}
                    onChange={(e) => setAddUserStoreId(e.target.value)}
                    className="input-field w-full text-sm"
                    aria-label="Store for new user"
                  >
                    <option value="">— Select store —</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Warehouse</label>
                  <select
                    value={addUserWarehouseId}
                    onChange={(e) => setAddUserWarehouseId(e.target.value)}
                    disabled={!addUserStoreId}
                    className="input-field w-full text-sm"
                    aria-label="Warehouse for new user"
                  >
                    <option value="">— Select warehouse —</option>
                    {addUserWarehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={addAddUserPosEntry}
                disabled={!addUserStoreId || !addUserWarehouseId}
                size="sm"
                className="mt-2"
              >
                Add location
              </Button>
              {addUserPosList.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {addUserPosList.map((entry, i) => (
                    <span
                      key={`${entry.storeId}-${entry.warehouseId}-${i}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm text-slate-800"
                    >
                      {entry.storeName ?? entry.storeId} → {entry.warehouseName ?? entry.warehouseId}
                      <Button
                        type="button"
                        variant="action"
                        onClick={() => removeAddUserPosEntry(i)}
                        className="p-0.5 rounded hover:bg-slate-100 text-slate-500 min-h-0"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <Button
              type="button"
              variant="primary"
              onClick={() => handleCreateUser()}
              disabled={savingScopes}
            >
              {savingScopes ? 'Saving…' : 'Create User (set in backend)'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowAddUser(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Assign store & warehouse to user (admin). No assignment = access to all (legacy). */}
      <div className="mt-8 pt-8 border-t border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-5 h-5 text-primary-600" aria-hidden />
          <h3 className="text-lg font-semibold text-slate-900">Store & warehouse access</h3>
        </div>
        <p className="text-sm text-slate-600 mb-2">
          Assign which store(s) and warehouse(s) a user can use in POS. No assignment = access to all (legacy). Enter the user&apos;s login email below.
        </p>
        <div className="text-sm text-slate-600 mb-5 p-3 rounded-lg bg-primary-50/50 border border-primary-100">
          <strong className="text-slate-700">How POS logins work:</strong> Role comes from the <strong>email username</strong> (before @). For cashier (POS) use: <code className="px-1 py-0.5 bg-white rounded text-xs">cashier@…</code>, <code className="px-1 py-0.5 bg-white rounded text-xs">cashier_maintown@…</code>, or <code className="px-1 py-0.5 bg-white rounded text-xs">maintown_cashier@…</code>. All get the same Cashier role; assign each email to its store below. <code className="px-1 py-0.5 bg-white rounded text-xs">maintown@…</code> alone gives View Only — add <code className="px-1 py-0.5 bg-white rounded text-xs">_cashier</code> (e.g. <code className="px-1 py-0.5 bg-white rounded text-xs">maintown_cashier@…</code>).
        </div>
        <div className="space-y-5">
          {/* User email: full-width editable field so any email can be entered */}
          <div className="space-y-2">
            <label htmlFor="user-scope-email" className="block text-sm font-medium text-slate-700">
              User email (login)
            </label>
            <input
              id="user-scope-email"
              type="email"
              value={scopeEmail}
              onChange={(e) => setScopeEmail(e.target.value)}
              onBlur={() => scopeEmail.trim() && loadScopesForEmail(scopeEmail)}
              placeholder="e.g. cashier@extremedeptkidz.com"
              autoComplete="off"
              className="input-field w-full max-w-md"
              aria-label="User email for scope assignment"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => loadScopesForEmail(scopeEmail)}
                disabled={loadingScopes || !scopeEmail.trim()}
              >
                {loadingScopes ? 'Loading…' : 'Load current'}
              </Button>
              {showAddUser && suggestedScopeEmail && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => { setScopeEmail(suggestedScopeEmail); loadScopesForEmail(suggestedScopeEmail); }}
                >
                  Use suggested ({suggestedScopeEmail})
                </Button>
              )}
            </div>
          </div>

          {/* Store + warehouse picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <Button
            type="button"
            variant="secondary"
            onClick={addScopeEntry}
            disabled={!selectedStoreId || !selectedWarehouseId}
          >
            Add location
          </Button>

          {/* Assigned locations: card layout */}
          {scopeList.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">Assigned locations</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {scopeList.map((entry, i) => (
                  <div
                    key={`${entry.storeId}-${entry.warehouseId}-${i}`}
                    className="flex items-center justify-between gap-3 p-4 rounded-xl border border-slate-200/80 bg-white shadow-sm hover:shadow-md transition-shadow"
                  >
                    <span className="text-sm font-medium text-slate-800 truncate">
                      {entry.storeName ?? entry.storeId} → {entry.warehouseName ?? entry.warehouseId}
                    </span>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => removeScopeEntry(i)}
                      className="flex-shrink-0"
                      aria-label="Remove location"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="primary"
                onClick={handleSaveScopes}
                disabled={savingScopes}
                className="mt-2 w-full sm:w-auto min-w-[200px]"
              >
                {savingScopes ? 'Saving…' : 'Save store & warehouse access'}
              </Button>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
