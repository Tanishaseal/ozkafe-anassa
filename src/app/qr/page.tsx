'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import Image from 'next/image';
import Link from 'next/link';

export default function QRGeneratorPage() {
  const [baseUrl, setBaseUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (!baseUrl) return;

    const generateSingleQR = async () => {
      let cleanUrl = baseUrl.trim();
      if (!cleanUrl) return;
      if (!/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = 'https://' + cleanUrl;
      }

      try {
        const url = await QRCode.toDataURL(cleanUrl, {
          width: 280,
          margin: 1,
          color: {
            dark: '#1A1410',
            light: '#FFFFFF',
          },
          errorCorrectionLevel: 'H',
        });
        setQrDataUrl(url);
      } catch (err) {
        console.error('QR creation error:', err);
      }
    };

    generateSingleQR();
  }, [baseUrl]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = 'OZKAFE_Anassa_Order_QR.png';
    link.href = qrDataUrl;
    link.click();
  };

  const directLink = baseUrl ? (baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`) : '#';
  const displayHost = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

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
              Customer Ordering QR Scanner
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: '#685E54' }}>
              Single permanent QR code for customers (Dine-In, Takeaway & In-Flat Delivery)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Website Link:</span>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="admin-input"
              style={{ width: 220, padding: '7px 10px', fontSize: 13 }}
              placeholder="https://..."
            />
          </label>

          <button
            type="button"
            className="btn-solid"
            style={{ height: 38, padding: '0 14px', fontSize: 13, background: '#1A1410' }}
            onClick={handleDownload}
            disabled={!qrDataUrl}
          >
            📥 Save PNG
          </button>

          <button
            type="button"
            className="btn-outline"
            style={{ height: 38, padding: '0 16px', fontSize: 13, background: '#16A34A', color: '#FFF', borderColor: '#16A34A', fontWeight: 700 }}
            onClick={() => window.print()}
          >
            🖨️ Print Standee Card
          </button>
        </div>
      </div>

      {/* ── SINGLE PRINTABLE QR CARD ── */}
      <div className="qr-grid-single">
        <div className="qr-card-item qr-card-single">
          <Image
            src="/images/ozkafe_logo.jpeg"
            alt="OZKAFE"
            width={56}
            height={56}
            className="qr-brand-logo"
            style={{ borderRadius: '50%', border: '2px solid #A66B33', marginBottom: 10 }}
          />

          <div style={{
            fontSize: 11,
            fontWeight: 800,
            color: '#7C4A1E',
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            marginBottom: 4
          }}>
            ☕ SCAN TO ORDER FOOD
          </div>

          <h2 className="qr-table-heading" style={{ fontSize: '1.75rem', marginBottom: 2 }}>
            OZKAFE
          </h2>
          <div className="qr-table-sub" style={{ marginBottom: 8 }}>
            At Anassa · Beside JW Marriott
          </div>

          <div style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: '#4A3F35',
            background: '#FDF9F4',
            border: '1px solid #E8DFD3',
            padding: '4px 14px',
            borderRadius: 999,
            marginBottom: 16
          }}>
            Dine-In · Counter Takeaway · Flat Delivery
          </div>

          <div className="qr-canvas-box" style={{ padding: 14, borderRadius: 18, border: '1.5px solid #EDE6DC', boxShadow: '0 6px 20px rgba(0,0,0,0.05)', marginBottom: 16 }}>
            {qrDataUrl ? (
              <Image
                src={qrDataUrl}
                alt="OZKAFE Customer Ordering QR Code"
                width={260}
                height={260}
                style={{ display: 'block', borderRadius: 8 }}
                priority
              />
            ) : (
              <div style={{ width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#888' }}>
                Generating QR...
              </div>
            )}
          </div>

          <div className="qr-scan-instruction" style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
              <line x1="12" y1="18" x2="12.01" y2="18"></line>
            </svg>
            <span>Scan with camera to view menu & order</span>
          </div>

          <div className="qr-veg-banner" style={{ marginBottom: 12, padding: '5px 14px', fontSize: 11.5 }}>
            🌱 100% Pure Vegetarian Café
          </div>

          <div style={{ marginTop: 4, fontSize: 12, color: '#8C7F73' }}>
            <Link href={directLink} target="_blank" style={{ color: '#A66B33', textDecoration: 'none', fontWeight: 600 }}>
              {displayHost ? `Visit: ${displayHost} ↗` : 'Open Direct Link ↗'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
