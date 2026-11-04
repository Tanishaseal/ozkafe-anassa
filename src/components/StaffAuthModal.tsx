'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { StaffUser } from '@/lib/types';

interface StaffAuthModalProps {
  isOpen: boolean;
  consoleType: 'admin' | 'kitchen';
  onAuthenticated: (user: StaffUser) => void;
}

type AuthMode = 'pin' | 'otp_request' | 'otp_verify' | 'pin_setup';

export default function StaffAuthModal({
  isOpen,
  consoleType,
  onAuthenticated,
}: StaffAuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('pin');

  // Input states
  const [identifier, setIdentifier] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [newMasterPin, setNewMasterPin] = useState('');
  const [confirmMasterPin, setConfirmMasterPin] = useState('');

  // Flow states
  const [currentUserId, setCurrentUserId] = useState('');
  const [activeUser, setActiveUser] = useState<StaffUser | null>(null);
  const [maskedDestination, setMaskedDestination] = useState('');
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  const isKitchen = consoleType === 'kitchen';
  const title = isKitchen ? 'Kitchen Display & KDS' : 'Floor Manager & Master Admin';
  const subtitle = isKitchen
    ? 'Kitchen Chef & Barista Security Gate'
    : 'Floor Manager & Master Admin Console';

  // Load last used identifier from localStorage & cleanse any unauthorized IDs
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedId = localStorage.getItem(`oz_last_id_${consoleType}`) || localStorage.getItem('oz_last_id');
      if (savedId) {
        if (!isKitchen) {
          const norm = savedId.trim().toLowerCase();
          if (norm === 'sonmarinventure@gmail.com' || norm === 'tanishaseal20@gmail.com') {
            setIdentifier(norm);
          } else {
            localStorage.removeItem(`oz_last_id_${consoleType}`);
            localStorage.removeItem('oz_last_id');
            localStorage.removeItem('anassa_admin_session');
          }
        } else {
          setIdentifier(savedId);
        }
      }
    }
  }, [consoleType, isKitchen]);

  if (!isOpen) return null;

  // ──────────────────────────────────────────
  // 1. SUBMIT 4-DIGIT PIN DIRECT UNLOCK
  // ──────────────────────────────────────────
  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessNotice('');

    if (!identifier.trim()) {
      setError(
        isKitchen
          ? 'Please enter your authorized Email or Phone (mamonix109@gmail.com, 6289418003, or tanishaseal20@gmail.com)'
          : 'Please enter your authorized Admin Email (sonmarinventure@gmail.com or tanishaseal20@gmail.com)'
      );
      return;
    }

    if (!isKitchen) {
      const norm = identifier.trim().toLowerCase();
      if (norm !== 'sonmarinventure@gmail.com' && norm !== 'tanishaseal20@gmail.com') {
        setError('Access Denied: Only sonmarinventure@gmail.com and tanishaseal20@gmail.com are permitted to enter Floor Admin.');
        return;
      }
    }

    if (!pinInput.trim()) {
      setError('Please enter your 4-digit Master PIN.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login_with_pin',
          identifier: identifier.trim(),
          pin: pinInput.trim(),
          consoleType,
        }),
      });

      const data = await res.json();
      if (res.ok && data.user) {
        localStorage.setItem(`oz_last_id_${consoleType}`, identifier.trim());
        localStorage.setItem('oz_last_id', identifier.trim());

        if (data.requiresPinSetup) {
          setCurrentUserId(data.user.id);
          setActiveUser(data.user);
          setMode('pin_setup');
          setSuccessNotice('First-time login: Please create your personalized 4-digit Master PIN.');
        } else {
          onAuthenticated(data.user);
        }
      } else {
        setError(data.error || 'Invalid identifier or Master PIN.');
      }
    } catch {
      setError('Connection failed. Please check network.');
    } finally {
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────
  // 2. REQUEST OTP FOR FIRST-TIME OR RESET
  // ──────────────────────────────────────────
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessNotice('');
    setPreviewOtp(null);

    if (!identifier.trim()) {
      setError(
        isKitchen
          ? 'Enter valid Kitchen ID (mamonix109@gmail.com, 6289418003, or tanishaseal20@gmail.com)'
          : 'Enter valid Admin Email (sonmarinventure@gmail.com or tanishaseal20@gmail.com)'
      );
      return;
    }

    if (!isKitchen) {
      const norm = identifier.trim().toLowerCase();
      if (norm !== 'sonmarinventure@gmail.com' && norm !== 'tanishaseal20@gmail.com') {
        setError('Access Denied: Only sonmarinventure@gmail.com and tanishaseal20@gmail.com are permitted to enter Floor Admin.');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_otp',
          identifier: identifier.trim(),
          consoleType,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setCurrentUserId(data.userId);
        setMaskedDestination(data.destinationMasked);
        if (data.previewOtp) setPreviewOtp(data.previewOtp);
        setSuccessNotice(data.message || `Security OTP sent to ${data.destinationMasked}!`);
        setMode('otp_verify');
      } else {
        setError(data.error || 'Failed to generate OTP.');
      }
    } catch {
      setError('Network error requesting OTP.');
    } finally {
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────
  // 3. VERIFY OTP CODE
  // ──────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessNotice('');

    if (!otpInput.trim() || otpInput.trim().length !== 6) {
      setError('Please enter the 6-digit OTP code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_otp',
          userId: currentUserId,
          otp: otpInput.trim(),
          consoleType,
        }),
      });

      const data = await res.json();
      if (res.ok && data.user) {
        localStorage.setItem(`oz_last_id_${consoleType}`, identifier.trim());
        localStorage.setItem('oz_last_id', identifier.trim());
        setActiveUser(data.user);

        // Always encourage setting or updating 4-digit PIN after OTP verification
        setCurrentUserId(data.user.id);
        setMode('pin_setup');
        setSuccessNotice('Security code verified! Please set your 4-digit Master PIN for instant future logins.');
      } else {
        setError(data.error || 'Invalid or expired OTP code.');
      }
    } catch {
      setError('Network error verifying OTP.');
    } finally {
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────
  // 4. SET 4-DIGIT MASTER PIN
  // ──────────────────────────────────────────
  const handleSetMasterPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessNotice('');

    const cleanPin = newMasterPin.trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      setError('Master PIN must be exactly 4 numeric digits.');
      return;
    }

    if (cleanPin !== confirmMasterPin.trim()) {
      setError('New PIN and Confirm PIN do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_master_pin',
          userId: currentUserId,
          newPin: cleanPin,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        if (activeUser) {
          const updatedUser: StaffUser = {
            ...activeUser,
            masterPin: cleanPin,
            hasCustomPin: true,
          };
          onAuthenticated(updatedUser);
        } else {
          // Re-login with the newly created PIN
          const loginRes = await fetch('/api/auth/otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'login_with_pin',
              identifier: identifier.trim(),
              pin: cleanPin,
              consoleType,
            }),
          });
          const loginData = await loginRes.json();
          if (loginRes.ok && loginData.user) {
            onAuthenticated(loginData.user);
          }
        }
      } else {
        setError(data.error || 'Failed to save Master PIN.');
      }
    } catch {
      setError('Network error saving PIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(26, 20, 16, 0.72)',
        backdropFilter: 'blur(6px)',
        padding: '16px',
      }}
    >
      <div
        className="auth-modal-card"
        style={{
          width: '100%',
          maxWidth: '430px',
          background: 'var(--adm-surface, #FFFFFF)',
          borderRadius: 20,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.28)',
          border: '1px solid var(--adm-border, #E5DFD7)',
          overflow: 'hidden',
          animation: 'fadeInScale 0.22s ease-out',
        }}
      >
        {/* BRAND HEADER */}
        <div
          style={{
            padding: '28px 24px 20px 24px',
            textAlign: 'center',
            background: 'var(--adm-surface-elevated, #FAF8F5)',
            borderBottom: '1px solid var(--adm-border, #E5DFD7)',
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              margin: '0 auto 12px auto',
              borderRadius: '50%',
              background: '#FFF',
              border: '2px solid #E5DFD7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}
          >
            <Image
              src="/images/ozkafe_logo.jpeg"
              alt="OZKAFE"
              width={54}
              height={54}
              style={{ objectFit: 'contain', borderRadius: 12 }}
              priority
            />
          </div>

          <h2 style={{ margin: '0 0 4px 0', fontSize: 21, fontWeight: 800, color: '#1A1410', letterSpacing: -0.2 }}>
            OZKAFE · Anassa
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--adm-text-muted, #73675C)', fontWeight: 600 }}>
            {subtitle}
          </p>
        </div>

        {/* BODY */}
        <div style={{ padding: '24px 26px' }}>
          {/* NOTIFICATION MESSAGES */}
          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                color: '#DC2626',
                fontSize: 12.5,
                fontWeight: 600,
                lineHeight: 1.45,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {successNotice && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                background: '#F0FDF4',
                border: '1px solid #86EFAC',
                color: '#15803D',
                fontSize: 12.5,
                fontWeight: 600,
                lineHeight: 1.45,
              }}
            >
              ✓ {successNotice}
            </div>
          )}

          {/* PREVIEW OTP HELPER (Guarantees instant verification even before external email/sms setup) */}
          {previewOtp && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 14px',
                borderRadius: 8,
                background: '#FFFBEB',
                border: '1px dashed #D97706',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 11.5, color: '#92400E', fontWeight: 700, textTransform: 'uppercase' }}>
                Instant Security Code (No Email Delay)
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 6, color: '#B45309', margin: '4px 0' }}>
                {previewOtp}
              </div>
              <div style={{ fontSize: 11, color: '#78350F' }}>
                Enter this 6-digit code below to verify immediately.
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* VIEW 1: DIRECT 4-DIGIT PIN LOGIN (RETURNING USERS)            */}
          {/* ───────────────────────────────────────────────────────────── */}
          {mode === 'pin' && (
            <form onSubmit={handlePinLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 5 }}>
                  {isKitchen ? 'Authorized Email or Phone' : 'Admin Email (sonmarinventure@gmail.com or tanishaseal20@gmail.com)'}
                </label>
                <input
                  type={isKitchen ? 'text' : 'email'}
                  required
                  placeholder={isKitchen ? 'mamonix109@gmail.com / 6289418003' : 'sonmarinventure@gmail.com or tanishaseal20@gmail.com'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="admin-form-input"
                  style={{ width: '100%', height: 44, padding: '0 14px', borderRadius: 10, border: '1px solid var(--adm-border, #E5DFD7)', background: 'var(--adm-input-bg, #FAF9F6)', fontSize: 13.5 }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--adm-text-muted, #73675C)' }}>
                    4-Digit Master PIN
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setSuccessNotice('');
                      setMode('otp_request');
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#C25E38', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}
                  >
                    First time or forgot PIN?
                  </button>
                </div>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  className="admin-form-input"
                  style={{ width: '100%', height: 46, textAlign: 'center', fontSize: 20, letterSpacing: 8, borderRadius: 10, border: '1px solid var(--adm-border, #E5DFD7)', background: 'var(--adm-input-bg, #FAF9F6)' }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 6,
                  height: 48,
                  borderRadius: 12,
                  background: isKitchen ? '#15803D' : '#5C381E',
                  color: '#FFF',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                  transition: 'opacity 0.2s',
                }}
              >
                {loading ? 'Verifying PIN...' : `Unlock ${isKitchen ? 'Kitchen KDS' : 'Floor Admin'}`}
              </button>

              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setSuccessNotice('');
                    setMode('otp_request');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--adm-text-muted, #73675C)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Sign in with Email / Phone OTP
                </button>
              </div>
            </form>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* VIEW 2: REQUEST OTP CODE                                      */}
          {/* ───────────────────────────────────────────────────────────── */}
          {mode === 'otp_request' && (
            <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 5 }}>
                  {isKitchen ? 'Kitchen ID (Email or Phone)' : 'Admin Email (sonmarinventure@gmail.com or tanishaseal20@gmail.com)'}
                </label>
                <input
                  type={isKitchen ? 'text' : 'email'}
                  required
                  placeholder={isKitchen ? 'mamonix109@gmail.com / 6289418003' : 'sonmarinventure@gmail.com or tanishaseal20@gmail.com'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="admin-form-input"
                  style={{ width: '100%', height: 44, padding: '0 14px', borderRadius: 10, border: '1px solid var(--adm-border, #E5DFD7)', background: 'var(--adm-input-bg, #FAF9F6)', fontSize: 13.5 }}
                />
                <div style={{ fontSize: 11, color: 'var(--adm-text-muted, #73675C)', marginTop: 4 }}>
                  {isKitchen
                    ? 'Permitted: mamonix109@gmail.com, 6289418003, or tanishaseal20@gmail.com'
                    : 'Permitted: ONLY sonmarinventure@gmail.com or tanishaseal20@gmail.com'}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 6,
                  height: 48,
                  borderRadius: 12,
                  background: isKitchen ? '#15803D' : '#5C381E',
                  color: '#FFF',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: 14.5,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                }}
              >
                {loading ? 'Sending OTP Code...' : 'Send Security OTP Code'}
              </button>

              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setSuccessNotice('');
                    setMode('pin');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--adm-text-muted, #73675C)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  ← Back to 4-Digit Master PIN Login
                </button>
              </div>
            </form>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* VIEW 3: VERIFY 6-DIGIT OTP                                   */}
          {/* ───────────────────────────────────────────────────────────── */}
          {mode === 'otp_verify' && (
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 5 }}>
                  Enter 6-Digit OTP Sent to {maskedDestination || 'your device'}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  placeholder="••••••"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                  className="admin-form-input"
                  style={{ width: '100%', height: 48, textAlign: 'center', fontSize: 24, letterSpacing: 8, borderRadius: 10, border: '1px solid var(--adm-border, #E5DFD7)', background: 'var(--adm-input-bg, #FAF9F6)' }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 6,
                  height: 48,
                  borderRadius: 12,
                  background: isKitchen ? '#15803D' : '#5C381E',
                  color: '#FFF',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: 14.5,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                }}
              >
                {loading ? 'Verifying OTP...' : 'Verify OTP Code'}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <button
                  type="button"
                  onClick={handleRequestOtp}
                  disabled={loading}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#C25E38',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Resend OTP Code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setSuccessNotice('');
                    setMode('pin');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--adm-text-muted, #73675C)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* ───────────────────────────────────────────────────────────── */}
          {/* VIEW 4: CREATE 4-DIGIT MASTER PIN                             */}
          {/* ───────────────────────────────────────────────────────────── */}
          {mode === 'pin_setup' && (
            <form onSubmit={handleSetMasterPin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: 'var(--adm-surface-elevated, #FAF8F5)',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid var(--adm-border, #E5DFD7)',
                  fontSize: 12,
                  color: 'var(--adm-text-muted, #73675C)',
                  lineHeight: 1.4,
                }}
              >
                🎉 <strong>Set your 4-digit Master PIN.</strong> Once saved, you can log in directly anytime without needing OTP again!
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 5 }}>
                  Choose 4-Digit Master PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={newMasterPin}
                  onChange={(e) => setNewMasterPin(e.target.value.replace(/\D/g, ''))}
                  className="admin-form-input"
                  style={{ width: '100%', height: 46, textAlign: 'center', fontSize: 20, letterSpacing: 8, borderRadius: 10, border: '1px solid var(--adm-border, #E5DFD7)', background: 'var(--adm-input-bg, #FAF9F6)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 5 }}>
                  Confirm 4-Digit PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={confirmMasterPin}
                  onChange={(e) => setConfirmMasterPin(e.target.value.replace(/\D/g, ''))}
                  className="admin-form-input"
                  style={{ width: '100%', height: 46, textAlign: 'center', fontSize: 20, letterSpacing: 8, borderRadius: 10, border: '1px solid var(--adm-border, #E5DFD7)', background: 'var(--adm-input-bg, #FAF9F6)' }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 6,
                  height: 48,
                  borderRadius: 12,
                  background: isKitchen ? '#15803D' : '#5C381E',
                  color: '#FFF',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: 14.5,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                }}
              >
                {loading ? 'Saving Master PIN...' : 'Save PIN & Enter Console'}
              </button>
            </form>
          )}
        </div>

        {/* FOOTER */}
        <div
          style={{
            padding: '12px 24px',
            background: 'var(--adm-surface-elevated, #FAF8F5)',
            borderTop: '1px solid var(--adm-border, #E5DFD7)',
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--adm-text-muted, #73675C)',
          }}
        >
          Security Guard · 100% Pure Veg · EM Bypass, Kolkata
        </div>
      </div>
    </div>
  );
}
