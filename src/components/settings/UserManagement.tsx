import { useState } from 'react';
import { Users as UsersIcon, Plus, Edit, Trash2, Shield } from 'lucide-react';
import { User } from '../../types';

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([
    {
      id: '1',
      username: 'admin',
      email: 'admin@extremedeptkidz.com',
      role: 'admin',
      fullName: 'Administrator',
      permissions: ['all'],
      isActive: true,
      lastLogin: new Date(),
      createdAt: new Date(),
    },
    {
      id: '2',
      username: 'manager1',
      email: 'manager@extremedeptkidz.com',
      role: 'manager',
      fullName: 'Store Manager',
      permissions: ['inventory', 'pos', 'reports'],
      isActive: true,
      lastLogin: new Date(),
      createdAt: new Date(),
    },
    {
      id: '3',
      username: 'cashier1',
      email: 'cashier@extremedeptkidz.com',
      role: 'cashier',
      fullName: 'Cashier One',
      permissions: ['pos'],
      isActive: true,
      lastLogin: new Date(),
      createdAt: new Date(),
    },
  ]);

  const [showAddUser, setShowAddUser] = useState(false);

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    manager: 'bg-blue-100 text-blue-700',
    cashier: 'bg-green-100 text-green-700',
    viewer: 'bg-slate-100 text-slate-700',
  };

  const deleteUser = (id: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      setUsers(users.filter(u => u.id !== id));
    }
  };

  const toggleUserStatus = (id: string) => {
    setUsers(users.map(u => u.id === id ? { ...u, isActive: !u.isActive } : u));
  };

  return (
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

      {/* Add User Form (Simple version) */}
      {showAddUser && (
        <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <h3 className="font-semibold text-slate-900 mb-4">Add New User</h3>
          <div className="grid grid-cols-2 gap-4">
            <input type="text" placeholder="Full Name" className="input-field" />
            <input type="text" placeholder="Username" className="input-field" />
            <input type="email" placeholder="Email" className="input-field" />
            <select className="input-field">
              <option>Select Role</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="cashier">Cashier</option>
              <option value="viewer">Viewer</option>
            </select>
            <input type="password" placeholder="Password" className="input-field" />
            <input type="password" placeholder="Confirm Password" className="input-field" />
          </div>
          <div className="flex gap-3 mt-4">
            <button className="btn-primary">Create User</button>
            <button onClick={() => setShowAddUser(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
