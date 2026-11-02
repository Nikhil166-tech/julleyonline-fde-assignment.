import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layers, User, Mail, Lock, Building, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';

export function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    organizationName: '',
    tenantName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register({
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        organizationName: formData.organizationName.trim(),
        tenantName: formData.tenantName.trim() || undefined,
      });
      navigate('/');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Brand Logo & Heading */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-xs">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">JulleyOnline</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900">Create your account</h2>
        <p className="mt-1 text-xs text-slate-500">Get started with JulleyOnline</p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 sm:px-8 shadow-card border border-slate-200 rounded-2xl">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Sarah Connor"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="name@company.com"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  placeholder="Minimum 8 characters"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Company Name</label>
                <input
                  type="text"
                  name="organizationName"
                  value={formData.organizationName}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Acme Corp"
                  className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Workspace</label>
                <input
                  type="text"
                  name="tenantName"
                  value={formData.tenantName}
                  onChange={handleChange}
                  placeholder="e.g. Engineering"
                  className="w-full px-2.5 py-2 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              loading={loading}
              className="w-full py-2.5 text-xs font-semibold mt-4"
            >
              Create Account
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-600 font-semibold hover:text-brand-700">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
