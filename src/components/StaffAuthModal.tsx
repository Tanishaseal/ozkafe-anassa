'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { StaffUser } from '@/lib/types';

interface StaffAuthModalProps {
  isOpen: boolean;
  consoleType: 'admin' | 'kitchen';
  onAuthenticated: (user: StaffUser) => void;
}

export default function StaffAuthModal({
  isOpen,
  consoleType,
  onAuthenticated,
}: StaffAuthModalProps) {
  const isKitchen = consoleType === 'kitchen';
  const subtitle = isKitchen
    ? 'Kitchen Chef & Barista Security Gate'
    : 'Floor Manager & Master Admin Console';

  const [identifier, setIdentifier] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load last used identifier from localStorage if available
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedId = localStorage.getItem(`oz_last_id_${consoleType}`);
      if (savedId) {
        setIdentifier(savedId);
      }
    }
  }, [consoleType]);

  if (!isOpen) return null;

  // ──────────────────────────────────────────
  // LOGIN WITH MASTER PIN (DEFAULT: 1234)
  // ──────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanId = identifier.trim();
    const cleanPin = pinInput.trim();

    if (!cleanId) {
      setError(isKitchen ? 'Please enter your registered Email or Mobile Number.' : 'Please enter your registered Email ID.');
      return;
    }

    if (!isKitchen && (cleanId.toLowerCase() === 'mamonix109@gmail.com' || cleanId === '6289418003')) {
      setError('Access denied: mamonix109@gmail.com is strictly prohibited from accessing the Admin panel.');
      return;
    }

    if (!cleanPin) {
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
          identifier: cleanId,
          pin: cleanPin,
          consoleType,
        }),
      });

      const data = await res.json();
      if (res.ok && data.user) {
        localStorage.setItem(`oz_last_id_${consoleType}`, cleanId);
        // Immediately authenticate and unlock console!
        onAuthenticated(data.user);
      } else {
        setError(data.error || 'Invalid credentials or access unauthorized.');
      }
    } catch {
      setError('Connection failed. Please check network.');
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
          maxWidth: '420px',
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

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 5 }}>
                {isKitchen ? 'Email or Mobile Number' : 'Admin Email ID'}
              </label>
              <input
                type={isKitchen ? 'text' : 'email'}
                required
                placeholder={isKitchen ? 'Enter registered Email or Mobile' : 'Enter registered Admin Email'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="admin-form-input"
                style={{
                  width: '100%',
                  height: 44,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: '1px solid var(--adm-border, #E5DFD7)',
                  background: 'var(--adm-input-bg, #FAF9F6)',
                  fontSize: 13.5,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--adm-text-muted, #73675C)', display: 'block', marginBottom: 5 }}>
                4-Digit Master PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                required
                placeholder="••••"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                className="admin-form-input"
                style={{
                  width: '100%',
                  height: 46,
                  textAlign: 'center',
                  fontSize: 20,
                  letterSpacing: 8,
                  borderRadius: 10,
                  border: '1px solid var(--adm-border, #E5DFD7)',
                  background: 'var(--adm-input-bg, #FAF9F6)',
                }}
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
              {loading ? 'Verifying PIN...' : `Unlock ${isKitchen ? 'Kitchen Display' : 'Floor Admin'}`}
            </button>
          </form>
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
