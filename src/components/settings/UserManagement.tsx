import { useState } from 'react';
import { Users as UsersIcon, Plus, Edit, Trash2, Shield, KeyRound, Copy } from 'lucide-react';
import { User } from '../../types';
import { ROLES } from '../../types/permissions';
import { emailForRole, DEFAULT_USER_PASSWORD, ROLES_WITH_SHARED_PASSWORD } from '../../constants/defaultCredentials';
import { useToast } from '../../contexts/ToastContext';

const initialUsers: User[] = Object.values(ROLES).map((role, i) => ({
  id: String(i + 1),
  username: role.id,
  email: emailForRole(role.id),
  role: role.id as User['role'],
  fullName: role.name,
  permissions: role.permissions,
  isActive: true,
  lastLogin: new Date(),
  createdAt: new Date(),
}));

export function UserManagement() {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: emailForRole('viewer'),
    role: 'viewer' as User['role'],
    password: DEFAULT_USER_PASSWORD,
  });
  const { showToast } = useToast();

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

  const deleteUser = (id: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      setUsers(users.filter(u => u.id !== id));
    }
  };

  const toggleUserStatus = (id: string) => {
    setUsers(users.map(u => u.id === id ? { ...u, isActive: !u.isActive } : u));
  };

  const handleCreateUser = () => {
    // Validate form
    if (!newUser.fullName.trim()) {
      showToast('error', 'Please enter a full name');
      return;
    }

    const email = newUser.role === 'admin' ? '' : emailForRole(newUser.role);
    const password = newUser.role === 'admin' ? '' : DEFAULT_USER_PASSWORD;
    
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
        password: DEFAULT_USER_PASSWORD,
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
            Keep admin credentials as you have them. For <strong>manager, cashier, warehouse, driver, viewer</strong> use: email <strong>role@extremedeptkidz.com</strong>, password <strong>{DEFAULT_USER_PASSWORD}</strong> (same for all).
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
                      <td className="px-4 py-3 font-mono text-slate-800">{DEFAULT_USER_PASSWORD}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(`${emailForRole(role.id)}\t${DEFAULT_USER_PASSWORD}`)}
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

      {/* Users Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Last Login</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Actions</th>
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
                  <button
                    onClick={() => toggleUserStatus(user.id)}
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      user.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {user.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {user.lastLogin.toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-blue-50 rounded-lg text-blue-600">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteUser(user.id)}
                      className="p-2 hover:bg-red-50 rounded-lg text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add User Form */}
      {showAddUser && (
        <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <h3 className="font-semibold text-slate-900 mb-2">Add New User</h3>
          {!import.meta.env.PROD && (
            <p className="text-sm text-slate-600 mb-4">
              {newUser.role !== 'admin' ? (
                <>Email: <strong>{newUser.role}@extremedeptkidz.com</strong>. Password: <strong>{DEFAULT_USER_PASSWORD}</strong> (same for all other roles).</>
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
                  setNewUser((u) => ({ ...u, role, email: emailForRole(role), password: DEFAULT_USER_PASSWORD }));
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
                value={newUser.role === 'admin' ? '' : (newUser.email || emailForRole(newUser.role))}
                readOnly={newUser.role !== 'admin'}
                placeholder={newUser.role === 'admin' ? 'Set in backend' : undefined}
                className="input-field w-full bg-slate-100 font-mono text-slate-700"
              />
            </div>
            {!import.meta.env.PROD && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <input
                    type="text"
                    value={newUser.role === 'admin' ? '' : newUser.password}
                    readOnly
                    placeholder={newUser.role === 'admin' ? 'Set in backend' : undefined}
                    className="input-field w-full bg-slate-100 font-mono text-slate-700"
                  />
                </div>
                {newUser.role !== 'admin' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
                    <input
                      type="text"
                      value={DEFAULT_USER_PASSWORD}
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
      </div>
    </div>
  );
}
