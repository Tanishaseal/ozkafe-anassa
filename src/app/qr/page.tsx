'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import Image from 'next/image';
import Link from 'next/link';
import { TableSession } from '@/lib/types';

export default function QRGeneratorPage() {
  const [tables, setTables] = useState<TableSession[]>([]);
  const [baseUrl, setBaseUrl] = useState('');
  const [numTablesInput, setNumTablesInput] = useState(1);
  const [includeTakeaway, setIncludeTakeaway] = useState(true);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
    const isAuthed = localStorage.getItem('anassa_admin_authed') === 'true';
    if (isAuthed) {
      setIsUnlocked(true);
    }
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      const res = await fetch('/api/tables');
      if (res.ok) {
        const data: TableSession[] = await res.json();
        setTables(data);
        const dineInTables = data.filter((t) => t.tableNumber > 0);
        if (dineInTables.length > 0) {
          setNumTablesInput(dineInTables.length);
        }
        if (data.some((t) => Boolean(t.secretKey))) {
          setIsUnlocked(true);
        }
      }
    } catch (err) {
      console.error('Fetch tables error:', err);
    }
  };

  const handleUnlockPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (res.ok) {
        setIsUnlocked(true);
        localStorage.setItem('anassa_admin_authed', 'true');
        setPinInput('');
        fetchTables();
      } else {
        setPinError('Invalid Admin PIN');
      }
    } catch {
      setPinError('Unlock error');
    }
  };

  const handleGenerateTables = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numTables: numTablesInput }),
      });
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables);
      } else if (res.status === 401) {
        alert('Please unlock with Admin PIN first to configure tables.');
      }
    } catch {
      alert('Failed to generate tables');
    } finally {
      setLoading(false);
    }
  };

  // Generate QR Canvas/Images whenever tables or baseUrl changes
  useEffect(() => {
    if (!baseUrl || tables.length === 0) return;

    const generateQRs = async () => {
      const map: Record<string, string> = {};
      for (const tbl of tables) {
        const param = tbl.tableNumber === 0 ? 'Takeaway' : tbl.tableNumber;
        const keyParam = tbl.secretKey ? `&key=${encodeURIComponent(tbl.secretKey)}` : '';
        const targetUrl = `${baseUrl}/?table=${param}${keyParam}`;
        try {
          const url = await QRCode.toDataURL(targetUrl, {
            width: 260,
            margin: 1,
            color: {
              dark: '#1A1410',
              light: '#FFFFFF',
            },
          });
          map[tbl.tableNumber] = url;
        } catch (err) {
          console.error('QR creation error for table', tbl.tableNumber, err);
        }
      }
      setQrDataUrls(map);
    };

    generateQRs();
  }, [tables, baseUrl]);

  const displayTables = tables.filter((t) => {
    if (t.tableNumber === 0) return includeTakeaway;
    return true;
  });

  return (
    <div className="qr-page-container">
      {/* ── CONTROLS CARD ── */}
      <div className="qr-controls-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Image
            src="/images/ozkafe_logo.jpeg"
            alt="OZKAFE"
            width={44}
            height={44}
            style={{ borderRadius: '50%', border: '2px solid #A66B33', flexShrink: 0 }}
          />
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', margin: 0 }}>
              QR Code Automation Center
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: '#685E54' }}>
              Default Table 1 QR & Static Takeaway / In-Flat Resident Code
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {!isUnlocked ? (
            <form onSubmit={handleUnlockPin} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="password"
                placeholder="Admin PIN"
                className="admin-input"
                style={{ width: 120, padding: '7px 10px', fontSize: 13 }}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
              />
              <button
                type="submit"
                className="btn-solid"
                style={{ height: 36, padding: '0 12px', fontSize: 12 }}
              >
                🔓 Unlock Full Keys
              </button>
              {pinError && <span style={{ color: '#DC2626', fontSize: 11 }}>{pinError}</span>}
            </form>
          ) : (
            <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 700 }}>
              ✓ Staff Mode Unlocked
            </span>
          )}

          <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Base:</span>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="admin-input"
              style={{ width: 180, padding: '6px 10px', fontSize: 12 }}
            />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Dine Tables:</span>
            <input
              type="number"
              min={1}
              max={100}
              value={numTablesInput}
              onChange={(e) => setNumTablesInput(parseInt(e.target.value) || 1)}
              className="admin-input"
              style={{ width: 55, padding: '6px 8px', fontSize: 13, textAlign: 'center' }}
            />
          </label>

          {isUnlocked && (
            <button
              className="btn-solid"
              style={{ height: 36, padding: '0 14px', fontSize: 12 }}
              onClick={handleGenerateTables}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Update Tables'}
            </button>
          )}

          <button
            className="btn-outline"
            style={{ height: 36, padding: '0 14px', fontSize: 12, background: '#16A34A', color: '#FFF', borderColor: '#16A34A' }}
            onClick={() => window.print()}
          >
            🖨️ Print All Cards
          </button>
        </div>
      </div>

      {/* ── PRINTABLE QR GRID ── */}
      <div className="qr-grid">
        {displayTables.map((tbl) => {
          const qrUrl = qrDataUrls[tbl.tableNumber];
          const isTakeaway = tbl.tableNumber === 0;
          const param = isTakeaway ? 'Takeaway' : tbl.tableNumber;
          const keyParam = tbl.secretKey ? `&key=${encodeURIComponent(tbl.secretKey)}` : '';
          const directLink = `${baseUrl}/?table=${param}${keyParam}`;

          return (
            <div
              key={tbl.tableNumber}
              className={`qr-card-item ${isTakeaway ? 'qr-card-takeaway' : ''}`}
              style={isTakeaway ? { borderColor: '#A66B33', background: '#FFFCF7' } : undefined}
            >
              <Image
                src="/images/ozkafe_logo.jpeg"
                alt="OZKAFE"
                width={48}
                height={48}
                className="qr-brand-logo"
              />

              <div style={{
                fontSize: 10,
                fontWeight: 800,
                color: isTakeaway ? '#A66B33' : '#685E54',
                textTransform: 'uppercase',
                letterSpacing: 1.2,
                marginBottom: 2
              }}>
                {isTakeaway ? '🥡 STATIC TAKEAWAY & IN-FLAT' : '🍽️ DINE-IN SERVICE'}
              </div>

              <h2 className="qr-table-heading" style={{ fontSize: isTakeaway ? '1.3rem' : '1.5rem' }}>
                {isTakeaway ? 'Takeaway & Flat Delivery' : `Table ${tbl.tableNumber}`}
              </h2>
              <div className="qr-table-sub">
                {isTakeaway ? 'Permanent Static QR · Anassa Flats' : 'Anassa · Beside JW Marriott'}
              </div>

              <div className="qr-canvas-box">
                {qrUrl ? (
                  <Image
                    src={qrUrl}
                    alt={`QR Code ${isTakeaway ? 'Takeaway' : `Table ${tbl.tableNumber}`}`}
                    width={220}
                    height={220}
                  />
                ) : (
                  <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#888' }}>
                    Generating QR...
                  </div>
                )}
              </div>

              <div className="qr-scan-instruction">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
                <span>{isTakeaway ? 'Order from Flat or Counter' : 'Scan camera to view menu & order'}</span>
              </div>

              {isTakeaway ? (
                <div style={{
                  marginTop: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#7C4A1E',
                  background: '#FDF2E9',
                  border: '1px solid #F8D7B8',
                  padding: '4px 10px',
                  borderRadius: 999,
                  textAlign: 'center',
                }}>
                  📍 Geofenced for Anassa Residents
                </div>
              ) : (
                <div className="qr-veg-banner">
                  🌱 100% Pure Vegetarian Café
                </div>
              )}

              <div style={{ marginTop: 10, fontSize: 11, color: '#8C7F73' }}>
                <Link href={directLink} target="_blank" style={{ color: '#A66B33', textDecoration: 'none', fontWeight: 600 }}>
                  Open Direct Link ↗
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
