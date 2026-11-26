import AsyncStorage from '@react-native-async-storage/async-storage';

export const SUPABASE_URL = 'https://qqwpcculkdeitwksgvzn.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_95FPv4KmhL2NJhU11xM9-g_fxvtavir';
const SESSION_KEY = 'makhzani-pos:supabase-session:v1';

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string };
}

export interface CloudSnapshot {
  payload: unknown;
  revision: number;
  updated_at: string;
}

async function readSession(): Promise<SupabaseSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as SupabaseSession; } catch { return null; }
}

async function saveSession(session: SupabaseSession | null): Promise<void> {
  if (!session) await AsyncStorage.removeItem(SESSION_KEY);
  else await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function responseError(response: Response): Promise<never> {
  let detail = '';
  try {
    const body = await response.json();
    detail = body.msg || body.message || body.error_description || body.error || '';
  } catch { /* ignore non-JSON response */ }
  throw new Error(detail || `Supabase error (${response.status})`);
}

export async function signIn(email: string, password: string): Promise<SupabaseSession> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!response.ok) return responseError(response);
  const data = await response.json();
  const session: SupabaseSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ?? (Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600)),
    user: data.user,
  };
  await saveSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  const session = await readSession();
  if (session?.access_token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => undefined);
  }
  await saveSession(null);
}

async function validSession(): Promise<SupabaseSession> {
  let session = await readSession();
  if (!session) throw new Error('سجّل الدخول إلى حساب Supabase أولاً.');
  if (session.expires_at && session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) {
    await saveSession(null);
    return responseError(response);
  }
  const data = await response.json();
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ?? (Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600)),
    user: data.user,
  };
  await saveSession(session);
  return session;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = await validSession();
  const headers = new Headers(init.headers);
  headers.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
}

export async function getLinkedStore(): Promise<{ storeId: string; role: string; email?: string }> {
  const session = await validSession();
  const query = `/rest/v1/makhzani_store_members?select=store_id,role&user_id=eq.${encodeURIComponent(session.user.id)}&active=eq.true&limit=1`;
  const response = await authedFetch(query);
  if (!response.ok) return responseError(response);
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows[0]?.store_id) {
    throw new Error('لم يتم العثور على متجر مرتبط بهذا الحساب. تأكد من إنشاء المتجر وربط العضوية.');
  }
  return { storeId: String(rows[0].store_id), role: String(rows[0].role), email: session.user.email };
}

export async function fetchCloudSnapshot(storeId: string): Promise<CloudSnapshot> {
  const response = await authedFetch('/rest/v1/rpc/makhzani_get_snapshot', {
    method: 'POST', body: JSON.stringify({ p_store_id: storeId }),
  });
  if (!response.ok) return responseError(response);
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    payload: row?.payload ?? {},
    revision: Number(row?.revision ?? 0),
    updated_at: String(row?.updated_at ?? ''),
  };
}

export async function saveCloudSnapshot(storeId: string, payload: unknown, expectedRevision: number): Promise<number> {
  const response = await authedFetch('/rest/v1/rpc/makhzani_save_snapshot', {
    method: 'POST',
    body: JSON.stringify({ p_store_id: storeId, p_payload: payload, p_expected_revision: expectedRevision }),
  });
  if (!response.ok) return responseError(response);
  const result = await response.json();
  return Number(result);
}

export async function currentCloudEmail(): Promise<string | null> {
  const session = await readSession();
  return session?.user?.email ?? null;
}
