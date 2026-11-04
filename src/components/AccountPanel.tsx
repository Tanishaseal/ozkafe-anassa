'use client';

import React, { useState, useEffect } from 'react';
import { StaffUser } from '@/lib/types';
import Link from 'next/link';

interface AccountPanelProps {
  isOpen: boolean;
  onClose: () => void;
  user: StaffUser | null;
  currentConsole: 'admin' | 'kitchen';
  onUpdateUser: (updated: StaffUser) => void;
  onLogout: () => void;
}

export default function AccountPanel({
  isOpen,
  onClose,
  user,
  currentConsole,
  onUpdateUser,
  onLogout,
}: AccountPanelProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences'>('profile');

  // Edit Profile States
  const [nameInput, setNameInput] = useState(user?.name || '');
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  // Security / PIN States
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [pinMessage, setPinMessage] = useState('');
  const [pinError, setPinError] = useState('');

  // Sync inputs when user prop updates
  useEffect(() => {
    if (user) {
      setNameInput(user.name || '');
      setPhoneInput(user.phone || '');
    }
  }, [user]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  const isSuperAdmin = user.roles.includes('admin') && user.roles.includes('kitchen');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileMessage('');

    if (!nameInput.trim()) {
      setProfileError('Name cannot be empty.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInput.trim(),
          phone: phoneInput.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.user) {
        setProfileMessage('Profile updated successfully!');
        onUpdateUser(data.user);
        setTimeout(() => setProfileMessage(''), 3000);
      } else {
        setProfileError(data.error || 'Failed to update profile.');
      }
    } catch {
      setProfileError('Network error updating profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinMessage('');

    const cleanNewPin = newPin.trim();
    if (!/^\d{4}$/.test(cleanNewPin)) {
      setPinError('New PIN must be exactly 4 numeric digits.');
      return;
    }

    if (cleanNewPin !== confirmPin.trim()) {
      setPinError('New PIN and Confirm PIN do not match.');
      return;
    }

    setIsSavingPin(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPin: currentPin.trim(),
          newPin: cleanNewPin,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setPinMessage('4-digit Master PIN changed successfully!');
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        if (data.user) onUpdateUser(data.user);
        setTimeout(() => setPinMessage(''), 4000);
      } else {
        setPinError(data.error || 'Failed to update PIN.');
      }
    } catch {
      setPinError('Network error updating PIN.');
    } finally {
      setIsSavingPin(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(26, 20, 16, 0.45)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="account-panel-drawer"
        style={{
          width: '100%',
          maxWidth: '420px',
          height: '100%',
          background: 'var(--adm-surface, #FFFFFF)',
          boxShadow: '-6px 0 24px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          animation: 'slideInRight 0.22s ease-out',
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: '20px 22px',
            borderBottom: '1px solid var(--adm-border, #E5DFD7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--adm-surface-elevated, #FAF8F5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: user.avatarColor || '#5C381E',
                color: '#FFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: 16,
                letterSpacing: 0.5,
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              }}
            >
              {user.avatarInitials || 'OZ'}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--adm-text-main, #1A1410)' }}>
                {user.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: isSuperAdmin ? '#C25E38' : 'var(--adm-text-muted, #73675C)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {isSuperAdmin && <span>👑</span>}
                {user.badge || 'Staff Member'}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Account Panel"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              borderRadius: 6,
              color: 'var(--adm-text-muted, #73675C)',
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* QUICK CONSOLE SWITCHER (FOR MULTI-ROLE / TANISHA SEAL) */}
        {isSuperAdmin && (
          <div
            style={{
              padding: '12px 20px',
              background: 'rgba(194, 94, 56, 0.08)',
              borderBottom: '1px solid rgba(194, 94, 56, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#C25E38', textTransform: 'uppercase' }}>
                Master Access Enabled
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--adm-text-secondary, #4A3F35)' }}>
                Currently in: <strong>{currentConsole === 'admin' ? 'Floor Admin' : 'Kitchen KDS'}</strong>
              </div>
            </div>

            {currentConsole === 'admin' ? (
              <Link
                href="/kitchen"
                style={{
                  background: '#15803D',
                  color: '#FFF',
                  textDecoration: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '7px 12px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                Go to Kitchen 👨‍🍳
              </Link>
            ) : (
              <Link
                href="/admin"
                style={{
                  background: '#5C381E',
                  color: '#FFF',
                  textDecoration: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '7px 12px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                Go to Admin ⚙️
              </Link>
            )}
          </div>
        )}

        {/* TAB NAVIGATION */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--adm-border, #E5DFD7)',
            padding: '0 16px',
            gap: 8,
            background: 'var(--adm-surface, #FFFFFF)',
          }}
        >
          <button
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '12px 14px',
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              fontWeight: activeTab === 'profile' ? 700 : 500,
              color: activeTab === 'profile' ? 'var(--adm-coffee, #5C381E)' : 'var(--adm-text-muted, #73675C)',
              borderBottom: activeTab === 'profile' ? '2px solid var(--adm-coffee, #5C381E)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            My Profile
          </button>
          <button
            onClick={() => setActiveTab('security')}
            style={{
              padding: '12px 14px',
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              fontWeight: activeTab === 'security' ? 700 : 500,
              color: activeTab === 'security' ? 'var(--adm-coffee, #5C381E)' : 'var(--adm-text-muted, #73675C)',
              borderBottom: activeTab === 'security' ? '2px solid var(--adm-coffee, #5C381E)' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            4-Digit Master PIN
          </button>
        </div>

        {/* BODY CONTENT */}
        <div style={{ flex: 1, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* TAB 1: PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 6 }}>
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="admin-form-input"
                  style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 8, border: '1px solid var(--adm-border, #E5DFD7)', background: 'var(--adm-input-bg, #FAF9F6)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 6 }}>
                  Verified Email ID
                </label>
                <input
                  type="email"
                  disabled
                  value={user.email}
                  style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 8, border: '1px solid var(--adm-border, #E5DFD7)', background: '#F2ECE3', color: '#73675C', cursor: 'not-allowed' }}
                />
                <span style={{ fontSize: 11, color: '#16A34A', marginTop: 4, display: 'block' }}>
                  ✓ Verified authorized management account
                </span>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 6 }}>
                  Mobile Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="Enter mobile number"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="admin-form-input"
                  style={{ width: '100%', height: 42, padding: '0 12px', borderRadius: 8, border: '1px solid var(--adm-border, #E5DFD7)', background: 'var(--adm-input-bg, #FAF9F6)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 6 }}>
                  Access Roles
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {user.roles.map((r) => (
                    <span
                      key={r}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 20,
                        fontSize: 11.5,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background: r === 'admin' ? 'rgba(92, 56, 30, 0.12)' : 'rgba(22, 163, 74, 0.12)',
                        color: r === 'admin' ? '#5C381E' : '#15803D',
                      }}
                    >
                      {r === 'admin' ? 'Floor Admin' : 'Kitchen KDS'}
                    </span>
                  ))}
                </div>
              </div>

              {profileError && (
                <div style={{ color: '#DC2626', fontSize: 12.5, fontWeight: 600 }}>
                  {profileError}
                </div>
              )}

              {profileMessage && (
                <div style={{ color: '#16A34A', fontSize: 12.5, fontWeight: 600 }}>
                  {profileMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingProfile}
                style={{
                  marginTop: 6,
                  height: 42,
                  background: 'var(--adm-coffee, #5C381E)',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13.5,
                  cursor: isSavingProfile ? 'not-allowed' : 'pointer',
                }}
              >
                {isSavingProfile ? 'Saving Changes...' : 'Save Profile Details'}
              </button>
            </form>
          )}

          {/* TAB 2: SECURITY & PIN */}
          {activeTab === 'security' && (
            <form onSubmit={handleSavePin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: 'var(--adm-surface-elevated, #FAF8F5)',
                  padding: 14,
                  borderRadius: 8,
                  border: '1px solid var(--adm-border, #E5DFD7)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--adm-text-main, #1A1410)', marginBottom: 4 }}>
                  🔒 4-Digit Master PIN Login
                </div>
                <div style={{ fontSize: 12, color: 'var(--adm-text-muted, #73675C)', lineHeight: 1.45 }}>
                  Once saved, you can log into any device instantly using just your Email / Phone and this 4-digit PIN, without waiting for OTP!
                </div>
              </div>

              {user.hasCustomPin && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 6 }}>
                    Current 4-Digit Master PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    required
                    placeholder="Enter current PIN"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                    className="admin-form-input"
                    style={{ width: '100%', height: 42, padding: '0 12px', textAlign: 'center', letterSpacing: 4, fontSize: 16, borderRadius: 8, border: '1px solid var(--adm-border, #E5DFD7)', background: 'var(--adm-input-bg, #FAF9F6)' }}
                  />
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 6 }}>
                  New 4-Digit Master PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  inputMode="numeric"
                  required
                  placeholder="e.g. 5821"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  className="admin-form-input"
                  style={{ width: '100%', height: 42, padding: '0 12px', textAlign: 'center', letterSpacing: 4, fontSize: 16, borderRadius: 8, border: '1px solid var(--adm-border, #E5DFD7)', background: 'var(--adm-input-bg, #FAF9F6)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 6 }}>
                  Confirm New 4-Digit PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  inputMode="numeric"
                  required
                  placeholder="Confirm 4 digits"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  className="admin-form-input"
                  style={{ width: '100%', height: 42, padding: '0 12px', textAlign: 'center', letterSpacing: 4, fontSize: 16, borderRadius: 8, border: '1px solid var(--adm-border, #E5DFD7)', background: 'var(--adm-input-bg, #FAF9F6)' }}
                />
              </div>

              {pinError && (
                <div style={{ color: '#DC2626', fontSize: 12.5, fontWeight: 600 }}>
                  {pinError}
                </div>
              )}

              {pinMessage && (
                <div style={{ color: '#16A34A', fontSize: 12.5, fontWeight: 600 }}>
                  {pinMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingPin}
                style={{
                  marginTop: 6,
                  height: 42,
                  background: 'var(--adm-coffee, #5C381E)',
                  color: '#FFF',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13.5,
                  cursor: isSavingPin ? 'not-allowed' : 'pointer',
                }}
              >
                {isSavingPin ? 'Saving Master PIN...' : 'Save 4-Digit Master PIN'}
              </button>
            </form>
          )}

          {/* LOGOUT BUTTON */}
          <div style={{ marginTop: 'auto', paddingTop: 20, borderTop: '1px solid var(--adm-border, #E5DFD7)' }}>
            <button
              onClick={onLogout}
              style={{
                width: '100%',
                height: 42,
                background: 'transparent',
                color: '#DC2626',
                border: '1px solid #DC2626',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13.5,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              🔒 Lock Console & Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

