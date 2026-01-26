import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn } from 'lucide-react';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch {
      setError('Invalid username or password. Try: admin, manager, or cashier');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4">
      <div className="glass-card w-full max-w-md p-8 animate-fade-in-up">
        <div className="text-center mb-8">
          <h1 className="text-[28px] font-extrabold gradient-text tracking-tight mb-1">
            Extreme Dept Kidz
          </h1>
          <p className="text-slate-500 text-sm font-medium">Inventory & POS</p>
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-6">Sign in</h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200/50 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-semibold text-slate-700 mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="input-field w-full"
              placeholder="admin, manager, cashier"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input-field w-full"
              placeholder="Any password for demo"
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
            <LogIn className="w-5 h-5" />
            Sign in
          </button>
        </form>

        <p className="text-xs text-slate-500 mt-6 text-center">
          Demo: use admin, manager, or cashier (password can be anything)
        </p>
      </div>
    </div>
  );
}
