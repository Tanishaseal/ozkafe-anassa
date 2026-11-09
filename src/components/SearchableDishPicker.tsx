'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MenuItem } from '@/lib/types';

export interface SearchableDishPickerProps {
  items: MenuItem[];
  selectedId: string;
  onSelect: (item: MenuItem) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchableDishPicker({
  items,
  selectedId,
  onSelect,
  placeholder = '🔍 Search or select dish...',
  className = '',
}: SearchableDishPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedItem = useMemo(() => {
    return items.find((it) => it.id === selectedId) || null;
  }, [items, selectedId]);

  // Filtered dishes
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const matchName = it.name.toLowerCase().includes(q);
      const matchCat = (it.category || '').toLowerCase().includes(q);
      const matchSub = (it.subheading || '').toLowerCase().includes(q);
      return matchName || matchCat || matchSub;
    });
  }, [items, query]);

  // Click outside to close
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      // Focus search input on open
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const handleSelect = (item: MenuItem) => {
    onSelect(item);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div
      ref={containerRef}
      className={`searchable-dish-picker-root ${className}`}
      style={{ position: 'relative', width: '100%' }}
    >
      {/* TRIGGER BUTTON (SHOWS CURRENT SELECTION) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          minHeight: 38,
          padding: '6px 12px',
          borderRadius: 8,
          border: isOpen ? '1.5px solid #8E402A' : '1px solid #D6D3D1',
          background: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: 'pointer',
          textAlign: 'left',
          boxShadow: isOpen ? '0 0 0 3px rgba(142, 64, 42, 0.12)' : '0 1px 2px rgba(0,0,0,0.04)',
          transition: 'all 0.15s ease',
        }}
      >
        {selectedItem ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: '#1A1410',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {selectedItem.name}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#78716C',
                background: '#F5F5F4',
                padding: '2px 6px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
              }}
            >
              {selectedItem.category}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: '#8E402A',
                marginLeft: 'auto',
                whiteSpace: 'nowrap',
              }}
            >
              ₹{selectedItem.price}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 12.5, color: '#A8A29E', fontWeight: 500 }}>
            {placeholder}
          </span>
        )}

        <span
          style={{
            fontSize: 10,
            color: '#78716C',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
            marginLeft: 4,
          }}
        >
          ▼
        </span>
      </button>

      {/* SEARCH & DROPDOWN POPOVER */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 1000,
            background: '#FFFFFF',
            borderRadius: 10,
            border: '1px solid #D6D3D1',
            boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
            overflow: 'hidden',
            animation: 'fadeInScale 0.15s ease-out',
          }}
        >
          {/* SEARCH INPUT */}
          <div
            style={{
              padding: '8px 10px',
              borderBottom: '1px solid #E7E5E4',
              background: '#FAF8F5',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, color: '#78716C' }}>🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter by name or category..."
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 12.5,
                fontWeight: 600,
                color: '#1A1410',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                style={{
                  background: '#E7E5E4',
                  border: 'none',
                  borderRadius: '50%',
                  width: 18,
                  height: 18,
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#44403C',
                  fontWeight: 800,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* DISHES LIST */}
          <div
            style={{
              maxHeight: 220,
              overflowY: 'auto',
              padding: '4px 0',
            }}
          >
            {filteredItems.length === 0 ? (
              <div
                style={{
                  padding: '16px 12px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#78716C',
                }}
              >
                No dishes matching &ldquo;{query}&rdquo;
              </div>
            ) : (
              filteredItems.map((m) => {
                const isSelected = m.id === selectedId;
                return (
                  <div
                    key={m.id}
                    onClick={() => handleSelect(m)}
                    style={{
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      cursor: 'pointer',
                      background: isSelected ? '#FFF7ED' : 'transparent',
                      borderLeft: isSelected ? '3px solid #8E402A' : '3px solid transparent',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#FAF8F5';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: isSelected ? 800 : 600,
                          color: isSelected ? '#8E402A' : '#1A1410',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {m.name}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#78716C', marginTop: 1 }}>
                        {m.category}
                        {m.subheading ? ` · ${m.subheading}` : ''}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#8E402A' }}>
                        ₹{m.price}
                      </div>
                      {typeof m.stock === 'number' && (
                        <div
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            color: m.stock <= 0 ? '#DC2626' : m.stock <= 3 ? '#D97706' : '#15803D',
                          }}
                        >
                          {m.stock <= 0 ? 'Sold Out' : `${m.stock} left`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

