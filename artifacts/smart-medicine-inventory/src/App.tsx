import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import {
  Activity as ActivityIcon, AlertTriangle, Boxes, CalendarClock, Check, ChevronDown, ChevronRight,
  CircleHelp, ClipboardList, CreditCard, FileBarChart2, LayoutDashboard, LogOut, Menu, MessageSquareText,
  PackagePlus, Pill, Plus, Search, ShieldCheck, ShoppingBasket, Star, TrendingUp, X, Trash2, Pencil,
  RefreshCw, Download, CheckCircle2, User as UserIcon, Phone, MapPin, Mail, KeyRound, ArrowRight,
  Lock, CheckCircle, ShieldAlert
} from 'lucide-react';
import {
  getGetCurrentProfileQueryKey, getGetDashboardSummaryQueryKey, getGetDashboardTrendsQueryKey, getGetMedicineQueryKey,
  getGetStockReportQueryKey, getListActivitiesQueryKey, getListFeedbackQueryKey,
  getListMedicinesQueryKey, useCheckoutCart, useCreateMedicine, useDeleteMedicine, useGetCurrentProfile,
  useGetDashboardSummary, useGetDashboardTrends, useGetMedicine, useGetStockReport, useListActivities, useListFaqs,
  useListFeedback, useListMedicines, useSubmitFeedback, useSubmitQuestion, useUpdateMedicine,
} from '@workspace/api-client-react';
import type { Medicine, MedicineInput } from '@workspace/api-client-react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import '@/index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20000, retry: 1 } } });
const basePath = (import.meta.env.BASE_URL || '').replace(/\/$/, '');

const nav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/medicines', label: 'Medicine stock', icon: Pill },
  { href: '/cart', label: 'Dispense', icon: ShoppingBasket },
  { href: '/feedback', label: 'Feedback & help', icon: MessageSquareText },
  { href: '/reports', label: 'Reports', icon: FileBarChart2 },
];

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value || 0);
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
function daysUntilExpiry(value: string) {
  if (!value) return 999;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.ceil((Date.UTC(year, month - 1, day) - today) / 86400000);
}

function StatusPill({ medicine }: { medicine: Medicine }) {
  const days = daysUntilExpiry(medicine.expiryDate);
  const label = days < 0 ? 'Expired' : medicine.quantity < 10 ? 'Low stock' : days <= 30 ? 'Expiring soon' : 'In stock';
  const style = days < 0 || medicine.quantity < 10 ? 'bg-rose-50 text-rose-700' : days <= 30 ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-800';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${style}`}>{label}</span>;
}

function PageTitle({ eyebrow, title, sub, right }: { eyebrow: string; title: string; sub: string; right?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-teal-700"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" />{eyebrow}</div><h1 className="font-display text-3xl font-extrabold tracking-[-.04em] text-[#18364a] sm:text-[35px]">{title}</h1><p className="mt-2 text-sm text-slate-500">{sub}</p></div>{right}</div>;
}

function Button({ children, onClick, variant = 'primary', disabled, type = 'button', className = '' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'light' | 'quiet' | 'danger'; disabled?: boolean; type?: 'button' | 'submit'; className?: string }) {
  const cls = variant === 'primary' ? 'bg-[#126a9b] text-white hover:bg-[#0d577f] shadow-[0_5px_14px_rgba(18,106,155,.16)]' : variant === 'danger' ? 'bg-rose-600 text-white hover:bg-rose-700' : variant === 'light' ? 'bg-[#e6f4f3] text-[#176f70] hover:bg-[#d9eeec]' : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800';
  return <button type={type} disabled={disabled} onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${cls} ${className}`} data-testid="button-action">{children}</button>;
}

function QueryState({ loading, error, retry, children }: { loading: boolean; error: boolean; retry: () => void; children: ReactNode }) {
  if (loading) return <div className="space-y-3"><div className="h-24 animate-pulse rounded-2xl bg-[#e4eff1]" /><div className="h-52 animate-pulse rounded-2xl bg-[#e4eff1]" /></div>;
  if (error) return <div className="panel rounded-2xl px-6 py-10 text-center"><AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-600" /><h3 className="font-bold text-[#18364a]">We couldn't load this view</h3><p className="mt-1 text-sm text-slate-500">Your inventory data is safe. Try refreshing this section.</p><Button onClick={retry} variant="light" className="mt-4"><RefreshCw className="h-4 w-4" />Try again</Button></div>;
  return <>{children}</>;
}

function Logo({ dark = false }: { dark?: boolean }) {
  return <div className="flex items-center gap-3"><img src={`${basePath}/logo.svg`} className="h-10 w-10" alt="MediStock logo" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} /><span className={`font-display text-[17px] font-extrabold tracking-[-.04em] ${dark ? 'text-white' : 'text-[#18364a]'}`}>Medi<span className={dark ? 'text-teal-300' : 'text-teal-700'}>Stock</span><small className={`mt-0.5 block text-[9px] font-bold uppercase tracking-[.2em] ${dark ? 'text-slate-400' : 'text-slate-400'}`}>Smart Inventory</small></span></div>;
}

function Home() {
  const { isSignedIn, isAdmin } = useAuth();
  if (isSignedIn) {
    return <Redirect to={isAdmin ? "/dashboard" : "/customer/dashboard"} />;
  }

  return <div className="min-h-[100dvh] overflow-hidden bg-[#f2f8f9] text-[#18364a]">
    <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6"><Logo /><div className="flex items-center gap-3"><Link href="/sign-in" className="rounded-xl border border-[#d8e7e9] bg-white px-4 py-2 text-sm font-bold text-[#315366] hover:bg-slate-50">Sign In</Link><Link href="/sign-up" className="rounded-xl bg-[#126a9b] px-5 py-2.5 text-sm font-bold text-white shadow-[0_9px_24px_rgba(18,106,155,.2)] transition hover:-translate-y-0.5">Customer Register <ChevronRight className="ml-1 inline h-4 w-4" /></Link></div></header>
    <main className="mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.08fr_.92fr] lg:pb-28 lg:pt-16">
      <div className="relative z-10 rise-in"><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#cce3e4] bg-white/80 px-3.5 py-2 text-xs font-bold text-teal-800"><ShieldCheck className="h-4 w-4" />Smart Medicine Inventory Management System</div><h1 className="font-display max-w-[680px] text-[48px] font-extrabold leading-[1.02] tracking-[-.06em] sm:text-[64px] lg:text-[73px]">Medistock.<br /><span className="text-[#167f83]">Inventory & Care.</span></h1><p className="mt-6 max-w-xl text-lg leading-8 text-[#607985]">Separate role-based portals for pharmacy administrators and registered customers. Search medicine stock, track expiry dates, manage dispensing, and register easily with email or phone.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/sign-in?tab=customer" className="inline-flex items-center gap-2 rounded-xl bg-[#126a9b] px-6 py-3.5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(18,106,155,.22)] transition hover:-translate-y-0.5">Customer Portal <ChevronRight className="h-4 w-4" /></Link><Link href="/sign-in?tab=admin" className="inline-flex items-center gap-2 rounded-xl border border-[#d8e7e9] bg-white px-6 py-3.5 text-sm font-bold text-[#315366] hover:bg-[#f7fbfb]"><Lock className="h-4 w-4 text-teal-700" />Admin Login</Link></div><div className="mt-10 flex items-center gap-3 text-xs text-slate-500"><span className="flex -space-x-2">{['bg-[#d4eced]','bg-[#dfe9f5]','bg-[#e4efe5]'].map((c,i)=><span key={i} className={`${c} grid h-8 w-8 place-items-center rounded-full border-2 border-[#f2f8f9] text-[10px] font-extrabold text-[#23566a]`}>{['AD','CU','RX'][i]}</span>)}</span><span>Designed with role-based access for Administrators & Customers</span></div></div>
      <div className="relative rise-in delay-1"><div className="absolute -right-20 -top-16 h-80 w-80 rounded-full bg-[#bce8e6]/50 blur-3xl" /><div className="relative rounded-[28px] border border-white/80 bg-[#e5f1f2] p-4 shadow-[0_35px_90px_rgba(26,76,94,.16)] sm:p-6"><div className="mb-4 flex items-center justify-between px-1"><div><div className="text-[10px] font-bold uppercase tracking-[.2em] text-teal-700">Live Inventory</div><div className="mt-1 font-display text-xl font-extrabold">Welcome to Medistock</div></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-teal-700"><ActivityIcon className="h-5 w-5" /></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white p-4"><span className="text-xs font-semibold text-slate-500">Admin Features</span><div className="mt-2 text-sm font-bold text-[#18364a]">Full Stock Control</div><div className="mt-1 text-[11px] text-teal-700">CRUD, Cart & Reports</div></div><div className="rounded-2xl bg-[#126a9b] p-4 text-white"><span className="text-xs font-semibold text-blue-100">Customer Access</span><div className="mt-2 text-sm font-bold text-white">Stock & Inquiries</div><div className="mt-1 text-[11px] text-teal-100">Email or Phone Signup</div></div></div><div className="mt-4 rounded-2xl bg-white p-4"><div className="text-xs font-bold text-[#315366]">Role-Based Architecture</div><p className="mt-1 text-xs text-slate-500 leading-relaxed">Customers can only access customer features and their profile. Administrators have exclusive control over medicine stock, dispensing, and system reports.</p></div></div></div>
    </main>
    <section className="border-y border-[#dce8eb] bg-white/75 py-14"><div className="mx-auto grid max-w-7xl gap-8 px-6 md:grid-cols-3"><Feature icon={<Lock />} title="Two Login Options" text="Admin and Customer login options with instant role-based dashboard redirection." /><Feature icon={<Phone />} title="Phone or Email Signup" text="Customers without email can register securely using verified phone numbers." /><Feature icon={<ShieldCheck />} title="Hashed Passwords & RBAC" text="Protected routes and hashed credentials ensure strict security and access control." /></div></section>
    <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-xs text-slate-500"><Logo /><span>Medistock – Smart Medicine Inventory Management System</span></footer>
  </div>;
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <article className="flex gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e6f4f3] text-teal-700">{icon}</span><div><h3 className="font-display text-base font-extrabold">{title}</h3><p className="mt-1 max-w-xs text-sm leading-6 text-slate-500">{text}</p></div></article>; }

// ----------------------------------------------------
// 1. Two Login Options: Admin Login & Customer Login
// ----------------------------------------------------
function SignInPage() {
  const [location, setLocation] = useLocation();
  const { login, isSignedIn, isAdmin } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  const initialTab = searchParams.get('tab') === 'admin' ? 'admin' : 'customer';

  const [activeTab, setActiveTab] = useState<'admin' | 'customer'>(initialTab);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isSignedIn) {
      setLocation(isAdmin ? '/dashboard' : '/customer/dashboard');
    }
  }, [isSignedIn, isAdmin, setLocation]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(identifier, password, activeTab);
      if (user.role === 'admin') {
        setLocation('/dashboard');
      } else {
        setLocation('/customer/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f2f8f9] px-4 py-10">
      <div className="mb-6 flex flex-col items-center">
        <Link href="/" aria-label="Medistock home"><Logo /></Link>
      </div>

      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-[#dce8eb] bg-white p-7 shadow-xl sm:p-9">
        <div className="mb-6 text-center">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-[#18364a]">
            Welcome to Medistock
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Please select your login type to access your dashboard
          </p>
        </div>

        {/* Two Login Options Tab Switcher */}
        <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-[#edf4f6] p-1.5" data-testid="login-tab-switcher">
          <button
            type="button"
            onClick={() => { setActiveTab('customer'); setError(''); }}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition ${activeTab === 'customer' ? 'bg-white text-[#126a9b] shadow-sm' : 'text-slate-500 hover:text-[#18364a]'}`}
            data-testid="tab-customer-login"
          >
            <UserIcon className="h-4 w-4" />
            Customer Login
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('admin'); setError(''); }}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition ${activeTab === 'admin' ? 'bg-white text-[#126a9b] shadow-sm' : 'text-slate-500 hover:text-[#18364a]'}`}
            data-testid="tab-admin-login"
          >
            <Lock className="h-4 w-4" />
            Admin Login
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === 'admin' ? (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#315366]">Admin Email or Username</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="admin@medistock.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3.5 py-3 text-sm text-[#18364a] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  data-testid="input-admin-identifier"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#315366]">Registered Email or Phone Number</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="name@example.com or phone number"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3.5 py-3 text-sm text-[#18364a] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                  data-testid="input-customer-identifier"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Log in using your registered email address or phone number.</p>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#315366]">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3.5 py-3 text-sm text-[#18364a] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              data-testid="input-login-password"
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full py-3">
            {loading ? 'Signing in…' : activeTab === 'admin' ? 'Sign In as Administrator' : 'Sign In as Customer'}
          </Button>

          {activeTab === 'admin' && (
            <div className="mt-4 rounded-xl border border-teal-100 bg-[#edf7f7] p-3 text-[11px] text-[#28575c]">
              <span className="font-bold">Default Admin Credentials:</span><br />
              Email: <code className="font-semibold text-teal-900">admin@medistock.com</code><br />
              Password: <code className="font-semibold text-teal-900">Admin@123</code>
            </div>
          )}

          {activeTab === 'customer' && (
            <div className="mt-5 border-t border-[#edf2f3] pt-4 text-center text-xs text-slate-500">
              New customer?{' '}
              <Link href="/sign-up" className="font-bold text-[#126a9b] hover:underline" data-testid="link-to-register">
                Register here
              </Link>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 2. Customer Registration Page (With Phone OTP & No-Email Support)
// ----------------------------------------------------
function SignUpPage() {
  const [, setLocation] = useLocation();
  const { registerCustomer, sendPhoneOtp, verifyPhoneOtp, isSignedIn } = useAuth();

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hasNoEmail, setHasNoEmail] = useState(false);

  // Phone verification state
  const [otpCode, setOtpCode] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [otpMessage, setOtpMessage] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isSignedIn) {
      setLocation('/customer/dashboard');
    }
  }, [isSignedIn, setLocation]);

  const handleSendOtp = async () => {
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid phone number (at least 10 digits) before requesting verification code.');
      return;
    }
    setError('');
    setSendingOtp(true);
    try {
      const res = await sendPhoneOtp(phone);
      setIsOtpSent(true);
      setOtpMessage(res.message);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.trim().length === 0) {
      setError('Please enter the verification code.');
      return;
    }
    setError('');
    setVerifyingOtp(true);
    try {
      const res = await verifyPhoneOtp(phone, otpCode);
      setIsPhoneVerified(true);
      setOtpMessage(res.message);
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please check the code.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    // Field Validations
    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Please enter your full name (minimum 2 characters).');
      return;
    }

    const ageNum = Number(age);
    if (!age || isNaN(ageNum) || ageNum < 1 || ageNum > 125) {
      setError('Please enter a valid age between 1 and 125.');
      return;
    }

    const cleanPhoneDigits = phone.replace(/\D/g, '');
    if (!cleanPhoneDigits || cleanPhoneDigits.length < 10) {
      setError('Please enter a valid phone number with at least 10 digits.');
      return;
    }

    if (!address.trim() || address.trim().length < 3) {
      setError('Please enter your residential address.');
      return;
    }

    if (!hasNoEmail) {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        setError('Please enter a valid email address or check "I do not have an email address".');
        return;
      }
    } else {
      // Must verify phone if no email
      if (!isPhoneVerified) {
        setError('Customers registering without an email address must verify their phone number first.');
        return;
      }
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }

    setLoading(true);

    try {
      await registerCustomer({
        fullName: fullName.trim(),
        age: ageNum,
        phone: phone.trim(),
        address: address.trim(),
        email: hasNoEmail ? null : email.trim().toLowerCase(),
        password,
        confirmPassword,
        hasNoEmail,
        verificationCode: isPhoneVerified ? undefined : otpCode,
      });

      setLocation('/customer/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check the provided information.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f2f8f9] px-4 py-10">
      <div className="mb-6 flex flex-col items-center">
        <Link href="/" aria-label="Medistock home"><Logo /></Link>
      </div>

      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-[#dce8eb] bg-white p-7 shadow-xl sm:p-9">
        <div className="mb-6">
          <div className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-700">Patient & Customer Portal</div>
          <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[#18364a]">
            Customer Registration
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Create your account to view available stock, place medicine inquiries, and track orders.
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* 1. Full Name */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-[#315366]">Full Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul Sharma"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3.5 py-2.5 text-sm text-[#18364a] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                data-testid="input-register-fullname"
              />
            </div>

            {/* 2. Age */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#315366]">Age *</label>
              <input
                type="number"
                min="1"
                max="125"
                required
                placeholder="e.g. 28"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3.5 py-2.5 text-sm text-[#18364a] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                data-testid="input-register-age"
              />
            </div>

            {/* 3. Phone Number */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#315366]">Phone Number *</label>
              <input
                type="tel"
                required
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setIsPhoneVerified(false);
                  setIsOtpSent(false);
                }}
                className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3.5 py-2.5 text-sm text-[#18364a] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                data-testid="input-register-phone"
              />
            </div>

            {/* 4. Address */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-bold text-[#315366]">Address *</label>
              <textarea
                required
                rows={2}
                placeholder="Street address, City, State, PIN"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3.5 py-2.5 text-sm text-[#18364a] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                data-testid="input-register-address"
              />
            </div>

            {/* 5. Email Address Option */}
            <div className="sm:col-span-2 rounded-2xl border border-[#dce8eb] bg-[#f9fcfc] p-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#315366]">Email Address</label>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#126a9b]">
                  <input
                    type="checkbox"
                    checked={hasNoEmail}
                    onChange={(e) => {
                      setHasNoEmail(e.target.checked);
                      if (e.target.checked) setEmail('');
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    data-testid="checkbox-no-email"
                  />
                  I do not have an email address
                </label>
              </div>

              {!hasNoEmail ? (
                <div className="mt-2.5">
                  <input
                    type="email"
                    required={!hasNoEmail}
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-[#dce8eb] bg-white px-3.5 py-2.5 text-sm text-[#18364a] outline-none focus:border-teal-500"
                    data-testid="input-register-email"
                  />
                </div>
              ) : (
                <div className="mt-2.5 rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-xs text-teal-900">
                  <p className="font-semibold">Phone-based Registration Selected</p>
                  <p className="mt-0.5 text-[11px] text-teal-700">
                    Your phone number will be your primary login credential. No fake email address is created. Please verify your phone number below.
                  </p>
                </div>
              )}
            </div>

            {/* Phone Verification Section */}
            {(hasNoEmail || isOtpSent || isPhoneVerified) && (
              <div className="sm:col-span-2 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-amber-900">Phone Verification</h4>
                    <p className="text-[11px] text-amber-700">Verify phone number via one-time passcode</p>
                  </div>
                  {isPhoneVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-3 py-1 text-xs font-bold text-teal-800" data-testid="badge-phone-verified">
                      <CheckCircle className="h-3.5 w-3.5" /> Verified
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={sendingOtp || !phone}
                      onClick={handleSendOtp}
                      className="rounded-lg bg-[#126a9b] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0d577f] disabled:opacity-50"
                      data-testid="button-send-otp"
                    >
                      {sendingOtp ? 'Sending…' : isOtpSent ? 'Resend OTP' : 'Send OTP'}
                    </button>
                  )}
                </div>

                {otpMessage && (
                  <p className="mt-2 text-xs font-medium text-teal-800">{otpMessage}</p>
                )}

                {isOtpSent && !isPhoneVerified && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="Enter 6-digit OTP"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-40 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-bold tracking-widest text-center text-[#18364a] outline-none focus:border-teal-500"
                      data-testid="input-register-otp"
                    />
                    <button
                      type="button"
                      disabled={verifyingOtp || !otpCode}
                      onClick={handleVerifyOtp}
                      className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
                      data-testid="button-verify-otp"
                    >
                      {verifyingOtp ? 'Verifying…' : 'Verify Code'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 6. Password */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#315366]">Password (min. 6 chars) *</label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3.5 py-2.5 text-sm text-[#18364a] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                data-testid="input-register-password"
              />
            </div>

            {/* 7. Confirm Password */}
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#315366]">Confirm Password *</label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3.5 py-2.5 text-sm text-[#18364a] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                data-testid="input-register-confirm-password"
              />
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full py-3 mt-2">
            {loading ? 'Creating Account…' : 'Register Customer Account'}
          </Button>

          <div className="mt-4 border-t border-[#edf2f3] pt-4 text-center text-xs text-slate-500">
            Already registered?{' '}
            <Link href="/sign-in?tab=customer" className="font-bold text-[#126a9b] hover:underline">
              Sign in here
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// 3. Customer Dashboard & Portal
// ----------------------------------------------------
function CustomerDashboard() {
  const { user, logout } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const medicines = useListMedicines({ search: search || undefined, status: 'all' });
  const client = useQueryClient();
  const submitFeedback = useSubmitFeedback();
  const submitQuestion = useSubmitQuestion();
  const faqs = useListFaqs();

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [feedbackNotice, setFeedbackNotice] = useState('');
  const [questionNotice, setQuestionNotice] = useState('');

  const rows = medicines.data || [];
  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((m) => {
      if (m.category) set.add(m.category);
    });
    return Array.from(set);
  }, [rows]);

  const filteredMedicines = useMemo(() => {
    return rows.filter((m) => {
      if (category !== 'all' && m.category !== category) return false;
      return true;
    });
  }, [rows, category]);

  const handleFeedback = (e: FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    submitFeedback.mutate(
      { data: { rating, comment: comment.trim() } },
      {
        onSuccess: () => {
          setFeedbackNotice('Thank you! Your feedback has been sent to the pharmacy administration.');
          setComment('');
          client.invalidateQueries({ queryKey: getListFeedbackQueryKey() });
        },
      },
    );
  };

  const handleQuestion = (e: FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;
    submitQuestion.mutate(
      {
        data: {
          name: user?.fullName || 'Customer',
          email: user?.email || null,
          question: questionText.trim(),
        },
      },
      {
        onSuccess: () => {
          setQuestionNotice('Your inquiry has been received. Our pharmacy team will assist you.');
          setQuestionText('');
        },
      },
    );
  };

  return (
    <div className="min-h-[100dvh] bg-[#f2f8f9] text-[#18364a]">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[#dce8eb] bg-white/90 px-6 backdrop-blur-xl sm:px-10">
        <Link href="/customer/dashboard"><Logo /></Link>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="block text-xs font-bold text-[#18364a]">{user?.fullName || 'Customer'}</span>
            <span className="block text-[10px] font-semibold text-teal-700">Customer Account</span>
          </div>
          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 rounded-xl border border-[#dce8eb] bg-white px-3 py-2 text-xs font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
            data-testid="button-customer-logout"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <PageTitle
          eyebrow="Customer Portal"
          title={`Hello, ${user?.fullName || 'Customer'}`}
          sub="Explore medicine availability, submit inquiries, and manage your account."
        />

        {/* Customer Profile & Info Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="panel rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Account Type</span>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <UserIcon className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 font-display text-lg font-extrabold text-[#18364a]">Customer</div>
            <div className="mt-1 text-[11px] text-teal-700">Role: Patient / Customer</div>
          </div>

          <div className="panel rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Contact Phone</span>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700">
                <Phone className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 font-data text-lg font-bold text-[#18364a]">{user?.phone || 'Not provided'}</div>
            <div className="mt-1 text-[11px] text-slate-400">Verified for account recovery</div>
          </div>

          <div className="panel rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Email Address</span>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-700">
                <Mail className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 truncate text-sm font-bold text-[#18364a]">{user?.email || 'Phone-only account'}</div>
            <div className="mt-1 text-[11px] text-slate-400">{user?.email ? 'Direct communications' : 'No fake email used'}</div>
          </div>

          <div className="panel rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">Delivery Address</span>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <MapPin className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3 truncate text-sm font-bold text-[#18364a]">{user?.address || 'Not registered'}</div>
            <div className="mt-1 text-[11px] text-slate-400">Age: {user?.age || '—'} years</div>
          </div>
        </div>

        {/* Medicine Catalog Section */}
        <section className="panel mb-8 rounded-2xl p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-extrabold text-[#18364a]">Medicine Stock & Availability</h2>
              <p className="mt-1 text-xs text-slate-500">Live inventory status for pharmacy medicines</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px]">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search medicine or category…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] py-2.5 pl-10 pr-3 text-xs outline-none focus:border-teal-500"
                  data-testid="input-customer-medicine-search"
                />
              </div>

              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3 py-2.5 text-xs font-bold text-[#315366] outline-none"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <QueryState loading={medicines.isLoading} error={medicines.isError} retry={() => medicines.refetch()}>
            {filteredMedicines.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#f6fafb] text-[10px] uppercase tracking-[.13em] text-slate-400">
                    <tr>
                      <th className="px-5 py-3.5 font-extrabold">Medicine</th>
                      <th className="px-5 py-3.5 font-extrabold">Category</th>
                      <th className="px-5 py-3.5 font-extrabold">Price per unit</th>
                      <th className="px-5 py-3.5 font-extrabold">Availability</th>
                      <th className="px-5 py-3.5 font-extrabold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf2f3]">
                    {filteredMedicines.map((m) => (
                      <tr key={m.id} className="hover:bg-[#f9fcfc]" data-testid={`customer-row-medicine-${m.id}`}>
                        <td className="px-5 py-4">
                          <b className="block text-sm text-[#244457]">{m.name}</b>
                          <span className="text-[11px] text-slate-400">Batch: {m.batchNumber || '—'}</span>
                        </td>
                        <td className="px-5 py-4 text-xs font-semibold text-[#315366]">{m.category || 'General'}</td>
                        <td className="px-5 py-4 text-xs font-bold text-[#18364a]">{money(m.unitPrice)}</td>
                        <td className="px-5 py-4">
                          {m.quantity > 0 ? (
                            <span className="text-xs font-semibold text-teal-800">{m.quantity} units available</span>
                          ) : (
                            <span className="text-xs font-semibold text-rose-700">Out of Stock</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <StatusPill medicine={m} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-sm">
                No medicines matched your search.
              </div>
            )}
          </QueryState>
        </section>

        {/* Customer Feedback & Inquiry Desk */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Feedback Form */}
          <section className="panel rounded-2xl p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <Star className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-lg font-extrabold text-[#18364a]">Customer Feedback</h3>
                <p className="text-xs text-slate-500">Rate your experience with our medicine availability</p>
              </div>
            </div>

            {feedbackNotice && (
              <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-800">
                {feedbackNotice}
              </div>
            )}

            <form onSubmit={handleFeedback} className="space-y-3">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setRating(v)}
                    className={`rounded-lg p-1.5 transition ${v <= rating ? 'text-amber-500' : 'text-slate-300'}`}
                  >
                    <Star className={`h-6 w-6 ${v <= rating ? 'fill-current' : ''}`} />
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                placeholder="Share your comments or medicine requests…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                required
                className="w-full resize-y rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3.5 py-2.5 text-xs text-[#18364a] outline-none focus:border-teal-500"
              />
              <Button type="submit" disabled={submitFeedback.isPending} className="w-full py-2.5">
                {submitFeedback.isPending ? 'Submitting…' : 'Submit Feedback'}
              </Button>
            </form>
          </section>

          {/* Ask Question / Inquire */}
          <section className="panel rounded-2xl p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <CircleHelp className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-lg font-extrabold text-[#18364a]">Ask a Pharmacist</h3>
                <p className="text-xs text-slate-500">Inquire about medicine dosage, substitutes, or restock</p>
              </div>
            </div>

            {questionNotice && (
              <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-800">
                {questionNotice}
              </div>
            )}

            <form onSubmit={handleQuestion} className="space-y-3">
              <textarea
                rows={3}
                placeholder="Write your medicine question or special prescription request…"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                required
                className="w-full resize-y rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3.5 py-2.5 text-xs text-[#18364a] outline-none focus:border-teal-500"
              />
              <Button type="submit" disabled={submitQuestion.isPending} className="w-full py-2.5">
                {submitQuestion.isPending ? 'Sending…' : 'Send Question to Pharmacy'}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

// ----------------------------------------------------
// Protected Route Wrappers (RBAC)
// ----------------------------------------------------
function AdminProtectedRoute({ children }: { children: ReactNode }) {
  const { isSignedIn, isAdmin, isCustomer, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f2f8f9]">
        <div className="w-72 space-y-3">
          <div className="h-10 animate-pulse rounded-xl bg-[#dcebed]" />
          <div className="h-36 animate-pulse rounded-2xl bg-[#e6eff1]" />
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/sign-in?tab=admin" />;
  }

  // Prevent customer from accessing admin dashboard
  if (isCustomer || !isAdmin) {
    return <Redirect to="/customer/dashboard" />;
  }

  return <AppShell>{children}</AppShell>;
}

function CustomerProtectedRoute({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#f2f8f9]">
        <div className="w-72 space-y-3">
          <div className="h-10 animate-pulse rounded-xl bg-[#dcebed]" />
          <div className="h-36 animate-pulse rounded-2xl bg-[#e6eff1]" />
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/sign-in?tab=customer" />;
  }

  return <>{children}</>;
}

// ----------------------------------------------------
// Admin App Shell & Pages (Unchanged Features)
// ----------------------------------------------------
function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const { logout, user } = useAuth();

  return <div className="app-shell min-h-[100dvh] text-[#18364a]">
    {mobileNav && <button aria-label="Close navigation" onClick={() => setMobileNav(false)} className="fixed inset-0 z-30 bg-[#102b3c]/40 md:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-[#dce8eb] bg-[#f9fcfc] px-4 py-5 transition-transform md:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
      <Link href="/dashboard" className="mb-10 px-2"><Logo /></Link><div className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[.18em] text-slate-400">Workspace</div><nav className="space-y-1">{nav.map(({href,label,icon:Icon})=><Link key={href} href={href} onClick={()=>setMobileNav(false)} className={`nav-link flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-bold ${location === href ? 'bg-[#e5f2f2] text-[#146c75] shadow-[inset_3px_0_0_#168e91]' : 'text-slate-500 hover:bg-white hover:text-[#18364a]'}`} data-testid={`link-nav-${href.slice(1)}`}><Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />{label}{href==='/cart' && <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-teal-700">Cart</span>}</Link>)}</nav>
      <div className="mt-auto rounded-2xl bg-[#e8f2f3] p-4"><div className="mb-3 flex items-center gap-2 text-xs font-bold text-[#315366]"><ShieldCheck className="h-4 w-4 text-teal-700" />Inventory integrity</div><p className="text-[11px] leading-5 text-slate-500">Keep expiry and stock status current for dependable operations.</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full w-[82%] rounded-full bg-[#168e91]" /></div><div className="mt-1.5 flex justify-between text-[9px] font-bold text-slate-400"><span>Workspace health</span><span>Good</span></div></div>
      <button onClick={() => logout()} className="mt-4 flex items-center gap-3 rounded-xl px-3 py-3 text-left text-xs font-bold text-slate-500 hover:bg-white hover:text-rose-700" data-testid="button-sign-out"><LogOut className="h-4 w-4" />Sign out</button>
    </aside>
    <div className="md:pl-[248px]">
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#dce8eb]/90 bg-[#f5fafb]/90 px-5 backdrop-blur-xl sm:px-8">
        <div className="flex items-center gap-3">
          <button className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce8eb] bg-white md:hidden" onClick={()=>setMobileNav(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
          <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex"><span>Workspace</span><ChevronRight className="h-3 w-3" /><span className="font-bold text-[#315366]">{nav.find(n=>n.href===location)?.label || 'MediStock'}</span></div>
          <div className="sm:hidden"><Logo /></div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-right sm:block">
            <b className="block text-xs text-[#315366]">{user?.fullName || 'Administrator'}</b>
            <small className="text-[10px] text-teal-700 font-bold uppercase tracking-wider">Inventory Administrator</small>
          </span>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#d6eeee] text-xs font-extrabold text-[#126a74]">
            {(user?.fullName?.[0] || 'A').toUpperCase()}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 sm:py-9">{children}</main>
    </div>
  </div>;
}

function Dashboard() {
  const summary = useGetDashboardSummary(); const trends = useGetDashboardTrends(); const activities = useListActivities({limit:8});
  const values = summary.data;
  const trendData = trends.data || [];
  const max = Math.max(1, ...trendData.flatMap(p=>[p.stockIn,p.stockOut]));
  return <QueryState loading={summary.isLoading || trends.isLoading || activities.isLoading} error={summary.isError || trends.isError || activities.isError} retry={()=>{summary.refetch();trends.refetch();activities.refetch();}}>
     <PageTitle eyebrow="Operations overview" title="Good day, administrator" sub={`Here's your inventory at a glance · ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}`} right={<Link href="/medicines" className="inline-flex items-center gap-2 rounded-xl bg-[#126a9b] px-4 py-2.5 text-sm font-bold text-white shadow-[0_5px_14px_rgba(18,106,155,.16)]"><PackagePlus className="h-4 w-4" />Add medicine</Link>} />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Medicine types" value={values?.medicineTypes} foot="Distinct products tracked" icon={<Pill />} tint="blue" />
      <StatCard label="Total units" value={values?.totalUnits?.toLocaleString()} foot="Across all active batches" icon={<Boxes />} tint="teal" />
      <StatCard label="Inventory value" value={money(values?.inventoryValue || 0)} foot="At recorded unit prices" icon={<CreditCard />} tint="violet" />
      <StatCard label="Need attention" value={(values?.lowStockCount || 0)+(values?.expiringSoonCount || 0)+(values?.expiredCount || 0)} foot={`${values?.lowStockCount || 0} low · ${values?.expiringSoonCount || 0} expiring · ${values?.expiredCount || 0} expired`} icon={<AlertTriangle />} tint="amber" />
    </section>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
      <section className="panel rise-in rounded-2xl p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-lg font-extrabold tracking-tight">Stock movement</h2><p className="mt-1 text-xs text-slate-500">Monthly units received and dispensed</p></div><div className="flex gap-4 text-[11px] font-semibold text-slate-500"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#168e91]" />Stock in</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-[#c8dfe9]" />Stock out</span></div></div>
      {trendData.length ? <div className="relative h-[230px]"><div className="absolute inset-0 flex flex-col justify-between pb-7">{[100,75,50,25,0].map((x)=><div key={x} className="border-t border-dashed border-[#e7eff1]" />)}</div><div className="relative flex h-full items-end justify-around gap-2 pb-7 pt-2">{trendData.map((point,i)=><div key={`${point.month}-${i}`} className="flex h-full flex-1 flex-col items-center justify-end"><div className="flex h-full w-full max-w-[52px] items-end justify-center gap-1.5"><div title={`In ${point.stockIn}`} className="w-1/2 rounded-t-md bg-[#168e91] transition-all" style={{height:`${Math.max(2,point.stockIn/max*82)}%`}}/><div title={`Out ${point.stockOut}`} className="w-1/2 rounded-t-md bg-[#c8dfe9]" style={{height:`${Math.max(2,point.stockOut/max*82)}%`}}/></div><span className="absolute bottom-0 text-[10px] font-semibold text-slate-400">{point.month}</span></div>)}</div></div> : <EmptyPanel title="No movement data yet" text="Stock movement will appear here as medicines are received or dispensed." />}
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#edf7f7] px-3.5 py-2.5 text-xs text-[#396b71]"><TrendingUp className="h-4 w-4" />Track stock flow to spot shifts before they become shortages.</div></section>
       <section className="panel rise-in delay-1 rounded-2xl p-5 sm:p-6"><div className="mb-5 flex items-start justify-between"><div><h2 className="font-display text-lg font-extrabold tracking-tight">Attention required</h2><p className="mt-1 text-xs text-slate-500">Items that may need your review</p></div><AlertTriangle className="h-5 w-5 text-amber-600" /></div><div className="space-y-3"><AlertRow label="Expired medicines" number={values?.expiredCount || 0} color="rose" note="Remove from available stock" /><AlertRow label="Expiring within 30 days" number={values?.expiringSoonCount || 0} color="amber" note="Review batch dates" /><AlertRow label="Low stock items" number={values?.lowStockCount || 0} color="rose" note="Consider a replenishment" /></div><Link href="/medicines" className="mt-5 inline-flex items-center gap-1 text-xs font-bold text-[#126a9b] hover:gap-2">Review inventory <ChevronRight className="h-4 w-4" /></Link></section>
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]"><section className="panel rounded-2xl p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-lg font-extrabold">Recent activity</h2><p className="mt-1 text-xs text-slate-500">A live trail of inventory changes</p></div><Link href="/reports" className="text-xs font-bold text-[#126a9b]">View reports</Link></div>{activities.data?.length ? <div className="divide-y divide-[#edf2f3]">{activities.data.slice(0,6).map((item)=><div key={item.id} className="flex items-center gap-3 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eaf4f4] text-teal-700"><ActivityIcon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><b className="block truncate text-xs font-bold text-[#315366]">{item.action}</b><span className="block truncate text-[11px] text-slate-500">{item.details || item.medicineName || 'Inventory activity'}</span></div><span className="whitespace-nowrap text-[10px] text-slate-400">{dateLabel(item.createdAt)}</span></div>)}</div> : <EmptyPanel title="Your activity trail starts here" text="Medicine additions and dispensing confirmations will appear here." />}</section>
      <section className="relative overflow-hidden rounded-2xl bg-[#126a9b] p-6 text-white"><div className="absolute -right-8 -top-10 h-44 w-44 rounded-full border-[30px] border-white/10" /><div className="relative"><div className="mb-8 flex items-center justify-between"><span className="rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.15em] text-teal-100">Quick action</span><ShoppingBasket className="h-5 w-5 text-teal-100" /></div><h3 className="font-display text-2xl font-extrabold tracking-tight">Ready to dispense?</h3><p className="mt-2 max-w-sm text-sm leading-6 text-blue-100">Build a medicine basket and confirm a stock deduction in a few clear steps.</p><Link href="/cart" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#126a9b] hover:bg-teal-50">Open dispensing cart <ChevronRight className="h-4 w-4" /></Link></div></section></div>
  </QueryState>;
}

function StatCard({label,value,foot,icon,tint}:{label:string;value?:string|number;foot:string;icon:ReactNode;tint:string}) {
  const colors:Record<string,string>={blue:'bg-[#e4f1f7] text-[#126a9b]',teal:'bg-[#e1f2ef] text-[#167e78]',violet:'bg-[#eee9f6] text-[#7561a8]',amber:'bg-[#fbf0dc] text-[#a76b15]'};
  return <div className="panel rise-in rounded-2xl p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">{label}</span><span className={`grid h-10 w-10 place-items-center rounded-xl ${colors[tint]}`}>{icon}</span></div><div className="mt-4 font-data text-[29px] font-bold tracking-[-.06em] text-[#18364a]">{value === undefined ? '—' : value}</div><div className="mt-1 truncate text-[10px] text-slate-400">{foot}</div></div>;
}

function AlertRow({label,number,color,note}:{label:string;number:number;color:string;note:string}){const c=color==='rose'?'bg-rose-50 text-rose-700':color==='amber'?'bg-amber-50 text-amber-700':'bg-teal-50 text-teal-700';return <div className="flex items-center gap-3 rounded-xl border border-[#edf2f3] p-3"><span className={`grid h-10 w-10 place-items-center rounded-xl font-data text-sm font-bold ${c}`}>{number}</span><div className="flex-1"><b className="block text-xs text-[#315366]">{label}</b><span className="text-[10px] text-slate-400">{note}</span></div><ChevronRight className="h-4 w-4 text-slate-300" /></div>}
function EmptyPanel({title,text}:{title:string;text:string}) { return <div className="grid min-h-[130px] place-items-center rounded-xl border border-dashed border-[#dce8eb] p-5 text-center"><div><CircleHelp className="mx-auto mb-2 h-6 w-6 text-[#8ba4ad]" /><b className="text-sm text-[#315366]">{title}</b><p className="mt-1 text-xs text-slate-500">{text}</p></div></div>; }

function MedicineForm({initial,onClose}:{initial?:Medicine;onClose:()=>void}) {
  const client=useQueryClient(); const create=useCreateMedicine(); const update=useUpdateMedicine();
  const detail=useGetMedicine(initial?.id ?? 0,{query:{enabled:!!initial,queryKey:getGetMedicineQueryKey(initial?.id ?? 0)}});
  const record=detail.data ?? initial;
  const [err,setErr]=useState('');
  const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setErr('');const f=new FormData(e.currentTarget);const payload:MedicineInput={name:String(f.get('name')).trim(),category:String(f.get('category')||'')||null,batchNumber:String(f.get('batchNumber')||'')||null,quantity:Number(f.get('quantity')),unitPrice:Number(f.get('unitPrice')),expiryDate:String(f.get('expiryDate')),supplier:String(f.get('supplier')||'')||null};if(!payload.name||!payload.expiryDate||payload.quantity<0||payload.unitPrice<0){setErr('Enter a medicine name, valid expiry date, and non-negative quantity and price.');return;}const success=()=>{client.invalidateQueries({queryKey:getListMedicinesQueryKey()});if(initial)client.invalidateQueries({queryKey:getGetMedicineQueryKey(initial.id)});client.invalidateQueries({queryKey:getGetDashboardSummaryQueryKey()});client.invalidateQueries({queryKey:getGetDashboardTrendsQueryKey()});client.invalidateQueries({queryKey:getListActivitiesQueryKey()});client.invalidateQueries({queryKey:getGetStockReportQueryKey()});onClose();};if(initial)update.mutate({id:initial.id,data:payload},{onSuccess:success,onError:()=>setErr('Medicine could not be updated. Please try again.')});else create.mutate({data:payload},{onSuccess:success,onError:()=>setErr('Medicine could not be added. Please try again.')});};
  const pending=create.isPending||update.isPending;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102b3c]/45 p-4 backdrop-blur-sm"><div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8"><div className="mb-6 flex items-start justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-700">{initial?'Update record':'New record'}</div><h2 className="mt-1 font-display text-2xl font-extrabold">{initial?'Edit medicine':'Add medicine'}</h2><p className="mt-1 text-sm text-slate-500">Keep the details aligned with the medicine label.</p></div><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label={`Close ${record?.name || 'medicine'} editor`}><X className="h-5 w-5" /></button></div><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">{[['name','Medicine name','text',initial?.name||''],['category','Category','text',initial?.category||''],['batchNumber','Batch number','text',initial?.batchNumber||''],['quantity','Quantity on hand','number',initial?.quantity??''],['unitPrice','Unit price','number',initial?.unitPrice??''],['expiryDate','Expiry date','date',initial?.expiryDate?.slice(0,10)||''],['supplier','Supplier','text',initial?.supplier||'']].map(([name,label,type,value])=><label key={String(name)} className={`block ${name==='name'||name==='supplier'?'sm:col-span-2':''}`}><span className="mb-1.5 block text-xs font-bold text-[#315366]">{label}</span><input name={String(name)} type={type as 'text'|'number'|'date'} step={name==='unitPrice'?'0.01':type==='number'?'1':undefined} min={type==='number'?'0':undefined} required={name==='name'||name==='expiryDate'||name==='quantity'||name==='unitPrice'} defaultValue={String(value)} className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-3.5 py-3 text-sm text-[#18364a] outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" data-testid={`input-medicine-${name}`} /></label>)}{err&&<div className="sm:col-span-2 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{err}</div>}<div className="mt-2 flex justify-end gap-2 sm:col-span-2"><Button variant="quiet" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending?'Saving…':<><Check className="h-4 w-4" />{initial?'Save changes':'Add to inventory'}</>}</Button></div></form></div></div>;
}

function Medicines() {
  const [search,setSearch]=useState(''); const [status,setStatus]=useState('all'); const [editing,setEditing]=useState<Medicine|undefined>(); const [addOpen,setAddOpen]=useState(false); const client=useQueryClient();
  const params=useMemo(()=>({search:search||undefined,status:status as 'all'|'low-stock'|'expiring'|'expired'}),[search,status]);
  const query=useListMedicines(params); const del=useDeleteMedicine();
  const remove=(id:number)=>{if(window.confirm('Remove this medicine from inventory? This action cannot be undone.'))del.mutate({id},{onSuccess:()=>{client.invalidateQueries({queryKey:getListMedicinesQueryKey()});client.invalidateQueries({queryKey:getGetDashboardSummaryQueryKey()});client.invalidateQueries({queryKey:getGetDashboardTrendsQueryKey()});client.invalidateQueries({queryKey:getListActivitiesQueryKey()});client.invalidateQueries({queryKey:getGetStockReportQueryKey()});}});};
  return <><PageTitle eyebrow="Inventory control" title="Medicine stock" sub="Search, review, and maintain every medicine record." right={<Button onClick={()=>{setEditing(undefined);setAddOpen(true);}}><Plus className="h-4 w-4" />Add medicine</Button>} />
    <div className="panel mb-5 flex flex-wrap items-center gap-3 rounded-2xl p-3"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search medicine, batch, supplier…" className="w-full rounded-xl border border-[#e5edef] bg-[#f9fcfc] py-3 pl-10 pr-4 text-sm outline-none focus:border-teal-500" data-testid="input-search-medicines" /></div><select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-xl border border-[#e5edef] bg-[#f9fcfc] px-4 py-3 text-sm font-semibold text-[#315366] outline-none focus:border-teal-500" data-testid="select-medicine-status"><option value="all">All stock</option><option value="low-stock">Low stock</option><option value="expiring">Expiring soon</option><option value="expired">Expired</option></select><span className="px-2 text-xs font-semibold text-slate-400">{query.data?.length ?? 0} records</span></div>
    <QueryState loading={query.isLoading} error={query.isError} retry={()=>query.refetch()}>{query.data?.length ? <div className="panel overflow-hidden rounded-2xl"><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead className="bg-[#f6fafb] text-[10px] uppercase tracking-[.13em] text-slate-400"><tr>{['Medicine / category','Batch / supplier','On hand','Unit price','Expiry','Status',''].map((h,i)=><th key={i} className="px-5 py-4 font-extrabold">{h}</th>)}</tr></thead><tbody className="divide-y divide-[#edf2f3]">{query.data.map(m=><tr key={m.id} className="hover:bg-[#f9fcfc]" data-testid={`row-medicine-${m.id}`}><td className="px-5 py-4"><b className="block text-sm text-[#244457]">{m.name}</b><span className="mt-1 block text-[11px] text-slate-400">{m.category||'Uncategorized'}</span></td><td className="px-5 py-4"><span className="block text-xs font-semibold text-[#315366]">{m.batchNumber||'No batch'}</span><span className="mt-1 block text-[11px] text-slate-400">{m.supplier||'No supplier'}</span></td><td className="px-5 py-4"><span className="font-data text-sm font-bold">{m.quantity}</span><span className="ml-1 text-[10px] text-slate-400">units</span></td><td className="px-5 py-4 text-xs font-semibold">{money(m.unitPrice)}</td><td className="px-5 py-4 text-xs text-slate-500">{dateLabel(m.expiryDate)}</td><td className="px-5 py-4"><StatusPill medicine={m} /></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button onClick={()=>setEditing(m)} title="Edit medicine" className="rounded-lg p-2 text-slate-400 hover:bg-teal-50 hover:text-teal-700" data-testid={`button-edit-${m.id}`}><Pencil className="h-4 w-4" /></button><button disabled={del.isPending} onClick={()=>remove(m.id)} title="Delete medicine" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" data-testid={`button-delete-${m.id}`}><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div></div>:<div className="panel rounded-2xl p-10 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e6f4f3] text-teal-700"><Pill className="h-7 w-7" /></div><h3 className="mt-4 font-display text-lg font-extrabold">{search?'No matching medicines':'Your stock list is ready'}</h3><p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{search?'Try another name, category, batch, or supplier.':'Add your first medicine record to start keeping your inventory in one place.'}</p>{!search&&<Button onClick={()=>setAddOpen(true)} className="mt-5"><Plus className="h-4 w-4" />Add first medicine</Button>}</div>}</QueryState>
    {editing&&<MedicineForm initial={editing} onClose={()=>setEditing(undefined)} />}{addOpen&&<MedicineForm onClose={()=>setAddOpen(false)} />}
  </>;
}

type Basket = Record<number,number>;
function Cart() {
  const [search,setSearch]=useState(''); const [basket,setBasket]=useState<Basket>({}); const [receipt,setReceipt]=useState<any>(null); const client=useQueryClient();
  const medicines=useListMedicines({search:search||undefined,status:'all'});const checkout=useCheckoutCart();
  const rows=medicines.data||[];const selected=rows.filter(m=>basket[m.id]);const total=selected.reduce((sum,m)=>sum+m.unitPrice*(basket[m.id]||0),0);
  const update=(id:number,n:number)=>setBasket(prev=>{const next={...prev};if(n<=0)delete next[id];else next[id]=n;return next;});
  const confirm=()=>{checkout.mutate({data:{items:Object.entries(basket).map(([medicineId,quantity])=>({medicineId:Number(medicineId),quantity}))}},{onSuccess:(result)=>{setReceipt(result);setBasket({});client.invalidateQueries({queryKey:getListMedicinesQueryKey()});client.invalidateQueries({queryKey:getGetDashboardSummaryQueryKey()});client.invalidateQueries({queryKey:getGetDashboardTrendsQueryKey()});client.invalidateQueries({queryKey:getListActivitiesQueryKey()});client.invalidateQueries({queryKey:getGetStockReportQueryKey()});},onError:()=>window.alert('Dispensing could not be confirmed. Check available stock and try again.')});};
  return <><PageTitle eyebrow="Dispensing" title="Dispensing cart" sub="Select available medicines, verify quantities, then confirm stock deduction." />
    {receipt&&<div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-teal-200 bg-teal-50 p-4"><div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-teal-700" /><div><b className="block text-sm text-teal-900">Dispensing confirmed</b><span className="text-xs text-teal-700">{receipt.items?.length||0} line items · {money(receipt.total)} · {dateLabel(receipt.completedAt)}</span></div></div><button onClick={()=>setReceipt(null)} className="text-teal-700"><X className="h-4 w-4" /></button></div>}
     <div className="grid items-start gap-5 xl:grid-cols-[1fr_360px]"><section className="panel rounded-2xl p-5"><div className="relative mb-4"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a medicine to dispense" className="w-full rounded-xl border border-[#e5edef] bg-[#f9fcfc] py-3 pl-10 pr-4 text-sm outline-none focus:border-teal-500" data-testid="input-search-dispense" /></div><QueryState loading={medicines.isLoading} error={medicines.isError} retry={()=>medicines.refetch()}>{rows.length?<div className="divide-y divide-[#edf2f3]">{rows.map(m=><div key={m.id} className="flex flex-wrap items-center gap-3 py-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f3f4] text-teal-700"><Pill className="h-5 w-5" /></div><div className="min-w-[150px] flex-1"><b className="block text-sm text-[#315366]">{m.name}</b><span className="text-[11px] text-slate-400">{m.category||'Medicine'} · {m.quantity} available · {money(m.unitPrice)} each</span></div><StatusPill medicine={m} /><div className="ml-auto flex items-center gap-2"><button onClick={()=>update(m.id,(basket[m.id]||0)-1)} className="grid h-8 w-8 place-items-center rounded-lg border border-[#dce8eb] text-slate-500 hover:bg-slate-50" aria-label={`Decrease ${m.name} quantity`}>−</button><span className="font-data w-7 text-center text-sm font-bold">{basket[m.id]||0}</span><button disabled={(basket[m.id]||0)>=m.quantity||m.quantity<=0||daysUntilExpiry(m.expiryDate)<0} onClick={()=>update(m.id,(basket[m.id]||0)+1)} className="grid h-8 w-8 place-items-center rounded-lg bg-[#e6f4f3] text-teal-800 hover:bg-[#d9eeec] disabled:opacity-40" aria-label={`Add ${m.name} quantity`}><Plus className="h-4 w-4" /></button></div></div>)}</div>:<EmptyPanel title="No medicines available" text="Add medicines to your inventory before dispensing." />}</QueryState></section>
        <aside className="panel sticky top-[92px] rounded-2xl p-5"><div className="flex items-center justify-between"><div><h2 className="font-display text-lg font-extrabold">Dispense summary</h2><p className="mt-1 text-xs text-slate-500">{Object.values(basket).reduce((a,b)=>a+b,0)} units selected</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e6f4f3] text-teal-700"><ShoppingBasket className="h-5 w-5" /></span></div><div className="my-5 border-t border-dashed border-[#dce8eb]" />{selected.length?<div className="space-y-3">{selected.map(m=><div key={m.id} className="flex justify-between gap-3 text-xs"><div className="min-w-0"><b className="block truncate text-[#315366]">{m.name}</b><span className="text-slate-400">{basket[m.id]} × {money(m.unitPrice)}</span></div><b>{money(m.unitPrice*basket[m.id])}</b></div>)}</div>:<div className="rounded-xl bg-[#f6fafb] py-7 text-center"><ShoppingBasket className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-xs text-slate-400">Your dispensing cart is empty</p></div>}<div className="my-5 border-t border-dashed border-[#dce8eb]" /><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-500">Estimated total</span><b className="font-data text-xl text-[#18364a]">{money(total)}</b></div><Button onClick={confirm} disabled={!selected.length||checkout.isPending} className="mt-5 w-full">{checkout.isPending?'Confirming…':<><Check className="h-4 w-4" />Confirm dispensing</>}</Button><p className="mt-3 text-center text-[10px] leading-4 text-slate-400">Confirming deducts these quantities from current stock.</p></aside></div></>;
}

function FeedbackPage() {
  const client=useQueryClient();const feedback=useListFeedback();const faqs=useListFaqs();const submit=useSubmitFeedback();const ask=useSubmitQuestion();
  const [rating,setRating]=useState(5);const [notice,setNotice]=useState('');const [error,setError]=useState('');
  const feedbackSubmit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);const comment=String(f.get('comment')||'').trim();if(!comment){setError('Add a note before sending feedback.');return;}submit.mutate({data:{rating,comment}},{onSuccess:()=>{setNotice('Thank you — your feedback has been recorded.');setError('');form.reset();client.invalidateQueries({queryKey:getListFeedbackQueryKey()});},onError:()=>setError('Feedback could not be sent. Please try again.')});};
  const questionSubmit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget;const f=new FormData(form);const data={name:String(f.get('name')).trim(),email:String(f.get('email')).trim(),question:String(f.get('question')).trim()};if(!data.name||!data.email||!data.question){setError('Complete all fields before sending your question.');return;}ask.mutate({data},{onSuccess:()=>{setNotice('Your question has been sent to the administrator.');setError('');form.reset();},onError:()=>setError('Your question could not be sent. Please try again.')});};
  return <><PageTitle eyebrow="Service desk" title="Feedback & questions" sub="Review feedback and inquiries from users and patients." />
    <div className="grid items-start gap-5 xl:grid-cols-[.9fr_1.1fr]"><div className="space-y-5"><section className="panel rounded-2xl p-6"><div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f3f3] text-teal-700"><Star className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-extrabold">Share internal feedback</h2><p className="text-xs text-slate-500">Log pharmacy shift notes or suggestions.</p></div></div><form onSubmit={feedbackSubmit}><label className="mb-2 block text-xs font-bold text-[#315366]">Rating</label><div className="mb-4 flex gap-1">{[1,2,3,4,5].map(v=><button type="button" key={v} onClick={()=>setRating(v)} className={`rounded-lg p-2 transition ${v<=rating?'text-amber-500':'text-slate-300 hover:text-amber-400'}`} aria-label={`Rate ${v} out of 5`}><Star className={`h-6 w-6 ${v<=rating?'fill-current':''}`} /></button>)}</div><textarea name="comment" rows={4} placeholder="What worked well? What would make the next shift easier?" className="w-full resize-y rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-4 py-3 text-sm outline-none focus:border-teal-500" data-testid="input-feedback-comment" /><Button type="submit" disabled={submit.isPending} className="mt-3 w-full">{submit.isPending?'Sending…':<><MessageSquareText className="h-4 w-4" />Send feedback</>}</Button></form></section>
    <section className="panel rounded-2xl p-6"><div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f3f3] text-teal-700"><CircleHelp className="h-5 w-5" /></span><div><h2 className="font-display text-lg font-extrabold">Submit support inquiry</h2><p className="text-xs text-slate-500">Record a customer inquiry or support request.</p></div></div><form onSubmit={questionSubmit} className="space-y-3"><input name="name" placeholder="Patient/Customer name" required className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-4 py-3 text-sm outline-none focus:border-teal-500" data-testid="input-question-name" /><input name="email" placeholder="Email or contact info" required className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-4 py-3 text-sm outline-none focus:border-teal-500" data-testid="input-question-email" /><textarea name="question" rows={3} placeholder="Inquiry details…" required className="w-full rounded-xl border border-[#dce8eb] bg-[#f9fcfc] px-4 py-3 text-sm outline-none focus:border-teal-500" data-testid="input-question" /><Button type="submit" disabled={ask.isPending} className="w-full">{ask.isPending?'Sending…':'Record inquiry'}</Button></form></section>
    {notice&&<div role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs font-semibold text-teal-800">{notice}</div>}{error&&<div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div>}</div>
    <div className="space-y-5"><section className="panel rounded-2xl p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-lg font-extrabold">Frequently asked</h2><p className="mt-1 text-xs text-slate-500">Operational guidance</p></div><CircleHelp className="h-5 w-5 text-teal-700" /></div>{faqs.isLoading?<div className="h-32 animate-pulse rounded-xl bg-[#e4eff1]" />:faqs.isError?<div className="text-sm text-rose-700">Questions are temporarily unavailable. <button onClick={()=>faqs.refetch()} className="font-bold underline">Retry</button></div>:faqs.data?.length?<div className="divide-y divide-[#edf2f3]">{faqs.data.map(f=><details key={f.id} className="group py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-[#315366]">{f.question}<ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" /></summary><p className="mt-3 pr-5 text-sm leading-6 text-slate-500">{f.answer}</p></details>)}</div>:<EmptyPanel title="No answers published yet" text="Send a question and an administrator can help." />}</section>
    <section className="panel rounded-2xl p-6"><h2 className="font-display text-lg font-extrabold">Recent feedback</h2><p className="mt-1 text-xs text-slate-500">Customer and team notes</p>{feedback.isLoading?<div className="mt-4 h-24 animate-pulse rounded-xl bg-[#e4eff1]" />:feedback.isError?<div className="mt-4 text-sm text-rose-700">Feedback could not be loaded. <button onClick={()=>feedback.refetch()} className="font-bold underline">Retry</button></div>:feedback.data?.length?<div className="mt-4 space-y-3">{feedback.data.slice(0,5).map(f=><article key={f.id} className="rounded-xl bg-[#f7fafb] p-4"><div className="flex items-center justify-between"><div className="flex gap-0.5 text-amber-500">{[1,2,3,4,5].map(v=><Star key={v} className={v <= f.rating ? "h-3.5 w-3.5 fill-current" : "h-3.5 w-3.5 text-slate-200"} />)}</div><time className="text-[10px] text-slate-400">{dateLabel(f.createdAt)}</time></div><p className="mt-2 text-xs leading-5 text-slate-600">{f.comment}</p></article>)}</div>:<EmptyPanel title="No feedback received" text="Feedback will be listed here." />}</section></div></div></>;
}

function Reports() {
  const report=useGetStockReport();const activity=useListActivities({limit:50});
  const exportCsv=()=>{const items=report.data?.items||[];const content=[['Medicine','Category','Batch','Quantity','Unit price','Expiry','Supplier'].join(','),...items.map(m=>[m.name,m.category||'',m.batchNumber||'',m.quantity,m.unitPrice,m.expiryDate,m.supplier||''].map(v=>`"${String(v).replaceAll('"','""')}"`).join(','))].join('\n');const url=URL.createObjectURL(new Blob([content],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=`medistock-stock-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);};
  return <><PageTitle eyebrow="Reporting" title="Stock & activity reports" sub="An exportable snapshot of your current stock and a recent activity trail." right={<Button onClick={exportCsv} disabled={!report.data?.items?.length}><Download className="h-4 w-4" />Export stock CSV</Button>} />
    <QueryState loading={report.isLoading} error={report.isError} retry={()=>report.refetch()}><section className="panel overflow-hidden rounded-2xl"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf2f3] p-5 sm:px-6"><div><h2 className="font-display text-lg font-extrabold">Current stock report</h2><p className="mt-1 text-xs text-slate-500">Generated {dateLabel(report.data?.generatedAt)} · {report.data?.items?.length||0} medicine records</p></div><span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-[10px] font-bold text-teal-800"><CheckCircle2 className="h-3.5 w-3.5" />Live snapshot</span></div>{report.data?.items?.length?<div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left"><thead className="bg-[#f6fafb] text-[10px] uppercase tracking-[.13em] text-slate-400"><tr>{['Medicine','Batch number','Units','Unit price','Expiry','Value'].map(h=><th key={h} className="px-5 py-3.5 font-extrabold">{h}</th>)}</tr></thead><tbody className="divide-y divide-[#edf2f3]">{report.data.items.map(m=><tr key={m.id}><td className="px-5 py-3.5 text-xs font-bold text-[#315366]">{m.name}</td><td className="px-5 py-3.5 text-xs text-slate-500">{m.batchNumber||'—'}</td><td className="px-5 py-3.5 font-data text-xs">{m.quantity}</td><td className="px-5 py-3.5 text-xs">{money(m.unitPrice)}</td><td className="px-5 py-3.5 text-xs text-slate-500">{dateLabel(m.expiryDate)}</td><td className="px-5 py-3.5 text-xs font-bold">{money(m.quantity*m.unitPrice)}</td></tr>)}</tbody></table></div>:<div className="p-8"><EmptyPanel title="No stock records to report" text="Once medicines are added, this report will give you an exportable snapshot." /></div>}</section></QueryState>
    <section className="panel mt-5 rounded-2xl p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-lg font-extrabold">Activity history</h2><p className="mt-1 text-xs text-slate-500">Most recent inventory operations</p></div><button onClick={()=>activity.refetch()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Refresh activity"><RefreshCw className={`h-4 w-4 ${activity.isFetching?'animate-spin':''}`} /></button></div>{activity.isLoading?<div className="h-24 animate-pulse rounded-xl bg-[#e4eff1]" />:activity.isError?<div className="text-sm text-rose-700">Activity could not be loaded. <button onClick={()=>activity.refetch()} className="font-bold underline">Retry</button></div>:activity.data?.length?<div className="divide-y divide-[#edf2f3]">{activity.data.map(a=><div key={a.id} className="flex items-center gap-3 py-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eaf4f4] text-teal-700"><ActivityIcon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><b className="block text-xs text-[#315366]">{a.action}</b><span className="block truncate text-[11px] text-slate-500">{a.details}</span></div><span className="text-[10px] text-slate-400">{dateLabel(a.createdAt)}</span></div>)}</div>:<EmptyPanel title="No activity recorded" text="Inventory activity appears here as the team works." />}</section>
  </>;
}

function NotFound(){return <div className="grid min-h-[100dvh] place-items-center bg-[#f2f8f9] p-6"><div className="text-center"><div className="font-data text-6xl font-bold text-[#126a9b]">404</div><h1 className="mt-3 font-display text-2xl font-extrabold">This page isn't in the stockroom</h1><p className="mt-2 text-sm text-slate-500">The page may have moved or the address may be incorrect.</p><Link href="/" className="mt-5 inline-flex rounded-xl bg-[#126a9b] px-5 py-3 text-sm font-bold text-white">Return to Home</Link></div></div>;}

function RoutedErrorBoundary({children}:{children:ReactNode}) {const [location]=useLocation();return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;}

function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/sign-in" component={SignInPage} />
          <Route path="/sign-up" component={SignUpPage} />

          {/* Customer Portal */}
          <Route path="/customer/dashboard">
            <CustomerProtectedRoute>
              <CustomerDashboard />
            </CustomerProtectedRoute>
          </Route>

          {/* Admin Protected Routes */}
          <Route path="/dashboard">
            <AdminProtectedRoute>
              <Dashboard />
            </AdminProtectedRoute>
          </Route>
          <Route path="/medicines">
            <AdminProtectedRoute>
              <Medicines />
            </AdminProtectedRoute>
          </Route>
          <Route path="/cart">
            <AdminProtectedRoute>
              <Cart />
            </AdminProtectedRoute>
          </Route>
          <Route path="/feedback">
            <AdminProtectedRoute>
              <FeedbackPage />
            </AdminProtectedRoute>
          </Route>
          <Route path="/reports">
            <AdminProtectedRoute>
              <Reports />
            </AdminProtectedRoute>
          </Route>

          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <AuthProvider>
        <WouterRouter base={basePath}>
          <AppRoutes />
        </WouterRouter>
        <Toaster />
      </AuthProvider>
    </TooltipProvider>
  );
}

export default App;
