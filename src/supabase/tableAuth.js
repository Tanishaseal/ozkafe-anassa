// ── Private state ──
let _tableNumber = null;
let _tableKey = null;
let _isVerified = false;
let _validationPromise = null;

/**
 * Kick off table validation from URL params.
 * Calls the Vercel API route so the user's browser doesn't talk directly to Supabase.
 */
export function validateTable() {
  _validationPromise = _performValidation();
  return _validationPromise;
}

async function _performValidation() {
  const params = new URLSearchParams(window.location.search);
  _tableNumber = params.get('table');
  _tableKey = params.get('key');

  if (!_tableNumber || !_tableKey) {
    _isVerified = false;
    return { valid: false, tableNumber: _tableNumber };
  }

  try {
    const res = await fetch(`/api/validate-table?table=${_tableNumber}&key=${_tableKey}`);
    if (!res.ok) throw new Error('Validation failed');
    const data = await res.json();
    _isVerified = !!data.valid;
  } catch (err) {
    console.error('Table validation error:', err);
    _isVerified = false;
  }

  return { valid: _isVerified, tableNumber: _tableNumber };
}

export async function ensureValidated() {
  if (_validationPromise) await _validationPromise;
}

export function getTableNumber() { return _tableNumber; }
export function getTableKey() { return _tableKey; }
export function isTableVerified() { return _isVerified; }
