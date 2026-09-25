import { supabase } from './client.js';

// ── Private state ──
let _tableNumber = null;
let _tableKey = null;
let _isVerified = false;
let _validationPromise = null;

/**
 * Kick off table validation from URL params.
 * Called once on page load. Non-blocking — the result is consumed 
 * later at checkout time via ensureValidated().
 */
export function validateTable() {
  _validationPromise = _performValidation();
  return _validationPromise;
}

async function _performValidation() {
  const params = new URLSearchParams(window.location.search);
  _tableNumber = params.get('table');
  _tableKey = params.get('key');

  // No params → browsing mode (no ordering)
  if (!_tableNumber || !_tableKey) {
    _isVerified = false;
    return { valid: false, tableNumber: _tableNumber };
  }

  try {
    const { data } = await supabase
      .from('tables')
      .select('id')
      .eq('table_number', parseInt(_tableNumber))
      .eq('secret', _tableKey)
      .maybeSingle();

    _isVerified = !!data;
  } catch {
    // If REST call fails, deny ordering.
    // The RLS policy will block invalid inserts at DB level regardless.
    _isVerified = false;
  }

  return { valid: _isVerified, tableNumber: _tableNumber };
}

/**
 * Await the validation promise. Call this before checking isTableVerified()
 * to guarantee the async check has finished.
 */
export async function ensureValidated() {
  if (_validationPromise) await _validationPromise;
}

/** The table number from URL (or null) */
export function getTableNumber() { return _tableNumber; }

/** The secret key from URL (or null) */
export function getTableKey() { return _tableKey; }

/** Whether the table + key pair matched a record in the `tables` table */
export function isTableVerified() { return _isVerified; }
