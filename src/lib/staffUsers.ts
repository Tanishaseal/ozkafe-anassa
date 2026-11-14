import { StaffUser, StaffRole } from './types';
import { supabaseServer, isSupabaseConfigured } from './supabaseServer';
import { addAuditLog } from './store';
import nodemailer from 'nodemailer';
import { randomInt, createHash } from 'crypto';
import { assertStorageConfigured } from './supabaseServer';

// ── STRICT WHITELISTS OF AUTHORIZED IDENTIFIERS ──
// For Admin: ONLY tanishaseal20@gmail.com — mamonix109@gmail.com is STRICTLY PROHIBITED.
export const ALLOWED_ADMIN_EMAILS = [
  'tanishaseal20@gmail.com',
] as const;

// For Kitchen: mamonix109@gmail.com (6289418003) & tanishaseal20@gmail.com (8902159596)
export const ALLOWED_KITCHEN_IDENTIFIERS = [
  'mamonix109@gmail.com',
  '6289418003',
  'tanishaseal20@gmail.com',
  '8902159596',
] as const;

// Allowed Staff in the entire system: ONLY tanishaseal20@gmail.com and mamonix109@gmail.com
export const ALLOWED_STAFF_EMAILS = [
  'tanishaseal20@gmail.com',
  'mamonix109@gmail.com',
] as const;

// ── CLEAN BASELINE AUTHORIZED USERS ──
export const INITIAL_STAFF_USERS: StaffUser[] = [
  {
    id: 'user_tanisha',
    email: 'tanishaseal20@gmail.com',
    phone: '8902159596',
    name: 'Tanisha Seal',
    roles: ['admin', 'kitchen'], // Master owner access for Admin & Kitchen
    badge: 'Super Admin & Founder',
    masterPin: '1234',
    hasCustomPin: false,
    avatarInitials: 'TS',
    avatarColor: '#5C381E',
    preferences: {
      theme: 'light',
      soundEnabled: true,
    },
  },
  {
    id: 'user_mamoni',
    email: 'mamonix109@gmail.com',
    phone: '6289418003',
    name: 'Mamoni',
    roles: ['kitchen'], // Kitchen only — STRICTLY prohibited from Admin
    badge: 'Kitchen Lead',
    masterPin: '1234',
    hasCustomPin: false,
    avatarInitials: 'M',
    avatarColor: '#15803D',
    preferences: {
      theme: 'light',
      soundEnabled: true,
    },
  },
];

// In-memory cache for fast access & zero-latency lookups
const globalStore = globalThis as unknown as {
  __anassa_staff_users?: StaffUser[];
  __anassa_otp_cache?: Map<string, { code: string; exp: number; attempts: number }>;
};

if (!globalStore.__anassa_staff_users) {
  globalStore.__anassa_staff_users = [...INITIAL_STAFF_USERS];
}

if (!globalStore.__anassa_otp_cache) {
  globalStore.__anassa_otp_cache = new Map();
}

/**
 * Clean & normalize email or phone number for comparison
 */
export function normalizeIdentifier(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 10 && !trimmed.includes('@')) {
    return digitsOnly.slice(-10);
  }
  return trimmed.toLowerCase();
}

/**
 * Mask destination for privacy display (e.g. t***l20@gmail.com or ******9596)
 */
export function maskDestination(identifier: string): string {
  if (identifier.includes('@')) {
    const [local, domain] = identifier.split('@');
    if (local.length <= 3) return `${local[0]}***@${domain}`;
    return `${local[0]}***${local.slice(-2)}@${domain}`;
  }
  const digits = identifier.replace(/\D/g, '');
  if (digits.length >= 10) {
    return `******${digits.slice(-4)}`;
  }
  return identifier;
}

/**
 * Retrieve all registered staff users from Supabase or memory
 * Strictly filters out any foreign or legacy user records
 */
export async function getStaffUsers(): Promise<StaffUser[]> {
  assertStorageConfigured();
  if (isSupabaseConfigured && supabaseServer) {
    try {
      const { data, error } = await supabaseServer
        .from('cafe_settings')
        .select('value')
        .eq('key', 'staff_users_config')
        .maybeSingle().throwOnError();

      if (!error && data?.value && Array.isArray(data.value) && data.value.length > 0) {
        const allowedEmails = ['tanishaseal20@gmail.com', 'mamonix109@gmail.com'];
        const dbUsers: StaffUser[] = data.value
          .filter((u: StaffUser) => allowedEmails.includes(u.email?.toLowerCase().trim()))
          .map((u: StaffUser) => {
            // STRICT GUARANTEE: mamonix109@gmail.com is strictly prohibited from having the admin role
            if (u.email?.toLowerCase().trim() === 'mamonix109@gmail.com') {
              return { ...u, roles: ['kitchen'] as StaffRole[] };
            }
            return u;
          });

        const merged: StaffUser[] = [...INITIAL_STAFF_USERS];
        for (const u of dbUsers) {
          const idx = merged.findIndex((m) => m.email.toLowerCase() === u.email.toLowerCase());
          if (idx >= 0) {
            merged[idx] = { ...merged[idx], ...u };
          }
        }
        globalStore.__anassa_staff_users = merged;
        return merged;
      }
    } catch (err) {
      throw err;
    }
  }

  return globalStore.__anassa_staff_users || INITIAL_STAFF_USERS;
}

/**
 * Completely wipe any custom saved user profiles and reset to clean baseline
 */
export async function clearAllStaffUserData(): Promise<StaffUser[]> {
  const freshUsers: StaffUser[] = INITIAL_STAFF_USERS.map((u) => ({
    ...u,
    masterPin: '1234',
    hasCustomPin: false,
    name: u.name,
    phone: u.phone,
    avatarColor: u.avatarColor,
    preferences: {
      theme: 'light',
      soundEnabled: true,
    },
  }));

  globalStore.__anassa_staff_users = freshUsers;
  globalStore.__anassa_otp_cache?.clear();

  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('cafe_settings').upsert({
        key: 'staff_users_config',
        value: freshUsers,
        updated_at: new Date().toISOString(),
      }).throwOnError();
    } catch (err) {
      throw err;
    }
  }

  await addAuditLog({
    actor: 'admin',
    action: 'SETTINGS_RESET',
    details: 'All user entries reset to fresh baseline. Only tanishaseal20@gmail.com has Admin access; mamonix109@gmail.com is prohibited from Admin.',
  });

  return freshUsers;
}

/**
 * Save staff users list to Supabase & memory
 */
export async function saveStaffUsers(users: StaffUser[]): Promise<void> {
  // Filter out any unauthorized entries before saving
  const allowedEmails = ['tanishaseal20@gmail.com', 'mamonix109@gmail.com'];
  const sanitized = users
    .filter((u) => allowedEmails.includes(u.email?.toLowerCase().trim()))
    .map((u) => {
      // STRICT GUARANTEE: mamonix109@gmail.com is strictly prohibited from having the admin role
      if (u.email?.toLowerCase().trim() === 'mamonix109@gmail.com') {
        return { ...u, roles: ['kitchen'] as StaffRole[] };
      }
      return u;
    });

  assertStorageConfigured();

  if (isSupabaseConfigured && supabaseServer) {
    try {
      await supabaseServer.from('cafe_settings').upsert({
        key: 'staff_users_config',
        value: sanitized,
        updated_at: new Date().toISOString(),
      }).throwOnError();
    } catch (err) {
      throw err;
    }
  }
  globalStore.__anassa_staff_users = sanitized;
}

// Updates only become visible locally after the durable write succeeds.
/**
 * Find user by email or phone
 */
export async function findStaffUserByIdentifier(rawId: string): Promise<StaffUser | null> {
  const norm = normalizeIdentifier(rawId);
  if (!norm) return null;

  const users = await getStaffUsers();
  for (const u of users) {
    const userEmailNorm = normalizeIdentifier(u.email);
    const userPhoneNorm = u.phone ? normalizeIdentifier(u.phone) : '';

    if (userEmailNorm === norm) return u;
    if (userPhoneNorm && userPhoneNorm === norm) return u;
  }
  return null;
}

/**
 * Strict check if a user has access to a specific console role:
 * For Admin: ONLY tanishaseal20@gmail.com!
 * mamonix109@gmail.com is STRICTLY PROHIBITED from accessing Admin!
 */
export function isUserAuthorizedForRole(user: StaffUser, role: StaffRole): boolean {
  const emailNorm = user.email.toLowerCase().trim();

  // mamonix109@gmail.com is STRICTLY prohibited from the admin panel
  if (role === 'admin') {
    if (emailNorm === 'mamonix109@gmail.com') return false;
    return ALLOWED_ADMIN_EMAILS.some(email => email === emailNorm);
  }

  if (role === 'kitchen') {
    const phoneNorm = user.phone ? normalizeIdentifier(user.phone) : '';
    return (
      ALLOWED_KITCHEN_IDENTIFIERS.some(identifier => identifier === emailNorm) ||
      Boolean(phoneNorm && ALLOWED_KITCHEN_IDENTIFIERS.some(identifier => identifier === phoneNorm))
    );
  }

  return false;
}

/**
 * Update a user's 4-digit Master PIN
 */
export async function updateStaffMasterPin(userId: string, newPin: string): Promise<boolean> {
  const cleanPin = newPin.trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    throw new Error('PIN must be exactly 4 numeric digits.');
  }

  const users = structuredClone(await getStaffUsers());
  const target = users.find((u) => u.id === userId);
  if (!target) return false;

  target.masterPin = cleanPin;
  target.hasCustomPin = true;
  await saveStaffUsers(users);

  await addAuditLog({
    actor: target.roles.includes('admin') ? 'admin' : 'kitchen',
    action: 'SETTINGS_UPDATED',
    details: `Master PIN updated for staff "${target.name}" (${target.email})`,
  });

  return true;
}

/**
 * Update staff user profile & preferences
 */
export async function updateStaffProfile(userId: string, updates: Partial<StaffUser>): Promise<StaffUser | null> {
  const users = await getStaffUsers();
  const target = users.find((u) => u.id === userId);
  if (!target) return null;

  if (updates.name && updates.name.trim()) {
    target.name = updates.name.trim();
    // Auto-update initials
    const parts = target.name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      target.avatarInitials = `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    } else if (parts.length === 1) {
      target.avatarInitials = parts[0].slice(0, 2).toUpperCase();
    }
  }
  if (updates.phone !== undefined) target.phone = updates.phone.trim();
  if (updates.avatarColor) target.avatarColor = updates.avatarColor;
  if (updates.preferences) {
    target.preferences = {
      ...target.preferences,
      ...updates.preferences,
    };
  }

  await saveStaffUsers(users);
  return target;
}

/**
 * Send an OTP to user's registered email or phone
 */
export async function generateAndSendOtp(
  user: StaffUser,
  identifier: string,
  consoleType: 'admin' | 'kitchen'
): Promise<{ success: boolean; previewOtp?: string; destinationType: 'email' | 'phone'; destinationMasked: string; message: string }> {
  if (consoleType === 'admin' && user.email?.toLowerCase().trim() === 'mamonix109@gmail.com') {
    throw new Error('Access denied: mamonix109@gmail.com is strictly prohibited from accessing the Admin panel.');
  }

  // 6-digit cryptographic random OTP
  const otpCode = randomInt(100000, 1000000).toString();
  const exp = Date.now() + 10 * 60 * 1000; // 10 minutes

  // Store in cache
  globalStore.__anassa_otp_cache?.set(user.id + ':' + consoleType, {
    code: otpCode,
    exp,
    attempts: 0,
  });

  const isEmail = true; // This application has an email transport; no SMS transport is configured.
  const destination = isEmail ? user.email : user.phone || user.email;
  const destinationType = isEmail ? 'email' : 'phone';
  const destinationMasked = maskDestination(destination);


  if (supabaseServer) {
    await supabaseServer.from('cafe_settings').upsert({ key: 'otp:' + user.id + ':' + consoleType,
      value: { hash: createHash('sha256').update(otpCode).digest('hex'), exp, attempts: 0 }, updated_at: new Date().toISOString() }).throwOnError();
  }
  const previewAllowed = !process.env.VERCEL && process.env.ANASSA_TEST_OTP === '1';
  // Attempt to send real email if SMTP is configured
  let emailDispatched = false;
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASS;

  if (smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT || 465),
        secure: Number(process.env.SMTP_PORT || 465) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: `"OZKAFE Anassa Security" <${smtpUser}>`,
        to: user.email,
        subject: `[OZKAFE Anassa] ${otpCode} is your ${consoleType.toUpperCase()} Security Code`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #E5DFD7; border-radius: 12px; background: #FFF;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #3A2312; margin: 0; font-size: 22px;">OZKAFE • Anassa</h2>
              <p style="color: #73675C; font-size: 13px; margin: 4px 0 0 0;">Floor Management & Kitchen KDS Console</p>
            </div>
            <div style="background: #F8F6F2; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
              <p style="margin: 0 0 10px 0; color: #4A3F35; font-size: 14px;">Hello <strong>${user.name}</strong>,</p>
              <p style="margin: 0 0 16px 0; color: #73675C; font-size: 13px;">Use this one-time security code to verify your identity and enter the ${consoleType.toUpperCase()} console:</p>
              <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #5C381E; background: #FFF; padding: 12px 24px; border-radius: 8px; border: 2px dashed #C25E38; display: inline-block;">
                ${otpCode}
              </div>
              <p style="margin: 16px 0 0 0; color: #9C8F82; font-size: 12px;">This code expires in 10 minutes. Do not share it with anyone.</p>
            </div>
            <p style="color: #9C8F82; font-size: 11px; text-align: center; margin: 0;">OZKAFE Anassa Security Guard • 100% Pure Veg • EM Bypass, Kolkata</p>
          </div>
        `,
      });
      emailDispatched = true;
    } catch (mailErr) {
      console.warn('[OZKAFE AUTH] SMTP dispatch warning:', mailErr);
    }
  }

  if (!emailDispatched && !previewAllowed) throw new Error('Unable to deliver the security code. Configure SMTP or use your staff PIN.');
  await addAuditLog({
    actor: consoleType,
    action: 'AUTH_ADMIN_SUCCESS',
    details: `Security OTP generated for ${user.name} (${destinationMasked}) - ${emailDispatched ? 'Dispatched via SMTP' : 'Instant ready'}`,
  });

  return {
    success: true,
    destinationType,
    destinationMasked,
    previewOtp: previewAllowed ? otpCode : undefined,
    message: emailDispatched
      ? `A 6-digit security code has been sent to ${destinationMasked}.`
      : `Security code sent to ${destinationMasked}! (Ready to verify: ${otpCode})`,
  };
}

/**
 * Verify OTP entered by staff user
 */
export async function verifyStaffOtp(userId: string, inputOtp: string, role: 'admin' | 'kitchen'): Promise<{ valid: boolean; reason?: string }> {
  if (supabaseServer) {
    const { data, error } = await supabaseServer.rpc('verify_staff_otp', { challenge_key: 'otp:' + userId + ':' + role, input_hash: createHash('sha256').update(String(inputOtp)).digest('hex') });
    if (error) throw error;
    return data ? { valid: true } : { valid: false, reason: 'Invalid or expired security code.' };
  }
  userId = userId + ':' + role;
  const cached = globalStore.__anassa_otp_cache?.get(userId);
  if (!cached) {
    return { valid: false, reason: 'OTP has expired or was not requested. Please request a new code.' };
  }

  if (Date.now() > cached.exp) {
    globalStore.__anassa_otp_cache?.delete(userId);
    return { valid: false, reason: 'OTP has expired. Please request a new code.' };
  }

  if (cached.attempts >= 5) {
    globalStore.__anassa_otp_cache?.delete(userId);
    return { valid: false, reason: 'Too many incorrect attempts. Please request a new code.' };
  }

  cached.attempts += 1;

  if (cached.code.trim() !== inputOtp.trim()) {
    return { valid: false, reason: 'Incorrect security OTP code. Please try again.' };
  }

  globalStore.__anassa_otp_cache?.delete(userId);
  return { valid: true };
}
