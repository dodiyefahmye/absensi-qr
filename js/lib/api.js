// Semua akses ke Supabase dikumpulkan di sini.
import { loadSupabase } from './vendor.js';

export let sb = null;
export const state = { session: null, user: null, profile: null };

export function isConfigured() {
  const c = window.APP_CONFIG || {};
  return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY);
}

export async function initSupabase() {
  const { createClient } = await loadSupabase();
  const c = window.APP_CONFIG;
  sb = createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  const { data } = await sb.auth.getSession();
  setSession(data.session);
  return sb;
}

export function setSession(session) {
  state.session = session || null;
  state.user = session?.user || null;
}

function check({ data, error, count }) {
  if (error) throw error;
  return count !== undefined && data === null ? count : data;
}

const PAGE = 1000;
async function fetchAll(build) {
  let from = 0, out = [];
  for (;;) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export const redirectUrl = () => location.origin + location.pathname;

/* ---------------- Auth ---------------- */
export const auth = {
  signIn: (email, password) => sb.auth.signInWithPassword({ email, password }).then(check),
  signUp: (email, password, full_name) =>
    sb.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: redirectUrl() } }).then(check),
  magicLink: (email) => sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl() } }).then(check),
  resetPassword: (email) => sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() }).then(check),
  updatePassword: (password) => sb.auth.updateUser({ password }).then(check),
  signOut: () => sb.auth.signOut(),
};

export async function getProfile() {
  if (!state.user) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
  state.profile = data;
  return data;
}
export const updateProfile = (patch) => sb.from('profiles').update(patch).eq('id', state.user.id).then(check);

/* ---------------- Events ---------------- */
export async function listMyEvents() {
  const rows = check(await sb.from('event_members').select('role, events(*)').eq('user_id', state.user.id));
  return rows.filter((r) => r.events).map((r) => ({ ...r.events, my_role: r.role }))
    .sort((a, b) => String(b.event_date || b.created_at).localeCompare(String(a.event_date || a.created_at)));
}

export const getEvent = async (id) => check(await sb.from('events').select('*').eq('id', id).single());

export async function myRole(eventId) {
  const { data } = await sb.from('event_members').select('role').eq('event_id', eventId).eq('user_id', state.user.id).maybeSingle();
  return data?.role || null;
}

export const createEvent = async (row) => check(await sb.from('events').insert({ ...row, owner_id: state.user.id }).select().single());
export const updateEvent = async (id, patch) => check(await sb.from('events').update(patch).eq('id', id).select().single());
export const deleteEvent = async (id) => check(await sb.from('events').delete().eq('id', id));

export async function eventCounts(eventId) {
  const [p, a] = await Promise.all([
    sb.from('participants').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    sb.from('attendances').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
  ]);
  return { participants: p.count || 0, attendances: a.count || 0 };
}

/* ---------------- Participants ---------------- */
export const listParticipants = (eventId) =>
  fetchAll(() => sb.from('participants').select('*').eq('event_id', eventId).order('name', { ascending: true }));

export async function saveParticipant(row) {
  if (row.id) {
    const { id, ...patch } = row;
    return check(await sb.from('participants').update(patch).eq('id', id).select().single());
  }
  return check(await sb.from('participants').insert(row).select().single());
}
export async function insertParticipants(rows, onProgress) {
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    out.push(...check(await sb.from('participants').insert(chunk).select()));
    onProgress && onProgress(Math.min(i + 500, rows.length), rows.length);
  }
  return out;
}
export async function setSelfCheckin(ids, value) {
  for (let i = 0; i < ids.length; i += 200) {
    check(await sb.from('participants').update({ self_checkin: value }).in('id', ids.slice(i, i + 200)));
  }
}
export const deleteParticipant = async (id) => check(await sb.from('participants').delete().eq('id', id));
export const deleteAllParticipants = async (eventId) => check(await sb.from('participants').delete().eq('event_id', eventId));
export const regenerateTokens = async (eventId) => check(await sb.rpc('regenerate_participant_tokens', { p_event_id: eventId }));

/* ---------------- Attendances ---------------- */
export const listAttendances = (eventId) =>
  fetchAll(() => sb.from('attendances').select('*, scanner:profiles(full_name)').eq('event_id', eventId).order('checked_in_at', { ascending: false }));

export const deleteAttendance = async (id) => check(await sb.from('attendances').delete().eq('id', id));

export async function checkIn({ eventId, token = null, participantId = null, deviceLabel = null, clientId = null, checkedAt = null }) {
  return check(await sb.rpc('check_in', {
    p_event_id: eventId, p_qr_token: token, p_participant_id: participantId,
    p_device_label: deviceLabel, p_client_id: clientId, p_checked_at: checkedAt,
  }));
}

/* ---------------- Members ---------------- */
export const listMembers = async (eventId) =>
  check(await sb.from('event_members').select('event_id, user_id, role, created_at, profile:profiles(full_name, email)').eq('event_id', eventId).order('created_at'));
export const updateMemberRole = async (eventId, userId, role) =>
  check(await sb.from('event_members').update({ role }).eq('event_id', eventId).eq('user_id', userId));
export const removeMember = async (eventId, userId) =>
  check(await sb.from('event_members').delete().eq('event_id', eventId).eq('user_id', userId));
export const joinEvent = async (code) => check(await sb.rpc('join_event', { p_code: code }));
export const regenerateInvite = async (eventId) => check(await sb.rpc('regenerate_invite_code', { p_event_id: eventId }));

/* ---------------- Public ---------------- */
export const getEventCode = async (eventId) => check(await sb.rpc('get_event_code', { p_event_id: eventId }));
export const getPublicEvent = async (token) => check(await sb.rpc('get_public_event', { p_token: token }));
export const submitPublic = async (token, code, data, deviceId) =>
  check(await sb.rpc('submit_public_attendance', { p_token: token, p_code: code || null, p_data: data, p_device_id: deviceId }));
export const getTicket = async (token) => check(await sb.rpc('get_ticket', { p_qr_token: token }));
export const selfCheckIn = async (ticket, eventToken, code, deviceId) =>
  check(await sb.rpc('self_check_in', { p_ticket: ticket, p_event_token: eventToken || null, p_code: code || null, p_device_id: deviceId || null }));

/* ---------------- Templates ---------------- */
export const listTemplates = async () => check(await sb.from('event_templates').select('*').order('created_at', { ascending: false }));
export const createTemplate = async (row) => check(await sb.from('event_templates').insert({ ...row, owner_id: state.user.id }).select().single());
export const deleteTemplate = async (id) => check(await sb.from('event_templates').delete().eq('id', id));

/* ---------------- Storage ---------------- */
export async function uploadAsset(folder, file, prefix = 'img') {
  const ext = (file.name?.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${folder}/${prefix}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('event-assets').upload(path, file, { upsert: true, contentType: file.type || 'image/png', cacheControl: '31536000' });
  if (error) throw error;
  return sb.storage.from('event-assets').getPublicUrl(path).data.publicUrl;
}

/* ---------------- Realtime ---------------- */
/**
 * Berlangganan perubahan data acara. handlers: { attendance(evt, row, old), participant(evt, row, old), event(row), status(s) }
 * Mengembalikan fungsi untuk berhenti berlangganan.
 */
export function subscribeEvent(eventId, handlers = {}) {
  const ch = sb.channel('event-' + eventId + '-' + Math.random().toString(36).slice(2, 8));
  const filter = `event_id=eq.${eventId}`;
  const relay = (key) => (payload) => {
    const row = payload.new && Object.keys(payload.new).length ? payload.new : null;
    const old = payload.old && Object.keys(payload.old).length ? payload.old : null;
    if (payload.eventType === 'DELETE' && old?.event_id && old.event_id !== eventId) return;
    handlers[key] && handlers[key](payload.eventType, row, old);
  };
  if (handlers.attendance) {
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendances', filter }, relay('attendance'));
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'attendances', filter }, relay('attendance'));
    ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'attendances' }, relay('attendance'));
  }
  if (handlers.participant) {
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter }, relay('participant'));
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'participants', filter }, relay('participant'));
    ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'participants' }, relay('participant'));
  }
  if (handlers.event) {
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` }, (p) => handlers.event(p.new));
  }
  ch.subscribe((status) => handlers.status && handlers.status(status));
  return () => { try { sb.removeChannel(ch); } catch (e) { /* abaikan */ } };
}
