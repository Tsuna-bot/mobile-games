// Cloud copy of the save through the claude.ai artifact database. Inside the Claude
// app, browser storage is not guaranteed to survive between visits; this private
// per-player copy is. Elsewhere (local server, GitHub Pages) `window.claude` is absent
// and everything here is a no-op.

const CONNECT_TIMEOUT = 5000;
const WRITE_DELAY = 1500;

let root = null; // `data/users/<id>`: the player's private subtree.
let db = null;
const slots = new Map(); // key -> { value, timer, writing }

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

function stampKey(key) {
  return `${key}@`;
}

function localStamp(key) {
  try {
    return Number(localStorage.getItem(stampKey(key))) || 0;
  } catch {
    return 0;
  }
}

/** Mirrors a local write: `value` is the JSON string, or null when the entry was removed. */
function writeLocal(key, value, at) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    localStorage.setItem(stampKey(key), String(at));
  } catch {
    // Storage blocked: the cloud copy still holds it.
  }
}

function docFor(key) {
  return db.doc(`${root}/${key.replace('/', '-')}`);
}

/**
 * Connects to the artifact database and reconciles each key with the local copy:
 * the newer side wins. Call once at boot, before reading the save. Never rejects.
 */
export async function syncFromCloud(keys) {
  try {
    if (!window.claude?.use) return;
    const [database, user] = await withTimeout(Promise.all([window.claude.use('db'), window.claude.use('user')]), CONNECT_TIMEOUT) ?? [];
    const id = await withTimeout(user?.id() ?? Promise.resolve(null), CONNECT_TIMEOUT);
    if (!database || !id) return;
    db = database;
    root = `data/users/${id}`;
    await withTimeout(Promise.all(keys.map(async (key) => {
      const snapshot = await docFor(key).get();
      const remote = snapshot.exists ? snapshot.data() : null;
      const remoteAt = Number(remote?.at) || 0;
      const localAt = localStamp(key);
      if (remoteAt > localAt) {
        writeLocal(key, typeof remote.json === 'string' ? remote.json : null, remoteAt);
      } else if (localAt > remoteAt) {
        let value = null;
        try {
          value = localStorage.getItem(key);
        } catch {
          // Unreadable: upload the removal marker.
        }
        push(key, value, localAt);
        flush(key);
      }
    })), CONNECT_TIMEOUT);
  } catch {
    // The cloud copy is optional: keep playing on local storage.
  }
}

/** Records a local write and schedules its cloud copy (coalesced, one write at a time). */
export function persist(key, value) {
  const at = Date.now();
  writeLocal(key, value, at);
  push(key, value, at);
}

function push(key, value, at) {
  if (!db) return;
  const slot = slots.get(key) ?? { value: undefined, timer: 0, writing: false };
  slots.set(key, slot);
  slot.value = { json: value, at };
  clearTimeout(slot.timer);
  slot.timer = setTimeout(() => flush(key), WRITE_DELAY);
}

/** Sends pending writes now (page hidden or closing). */
export function flushAll() {
  for (const key of slots.keys()) flush(key);
}

async function flush(key) {
  const slot = slots.get(key);
  if (!slot || slot.writing || slot.value === undefined) return;
  clearTimeout(slot.timer);
  const value = slot.value;
  slot.value = undefined;
  slot.writing = true;
  try {
    await docFor(key).set(value);
  } catch {
    // Dropped (offline, view-only, quota): the next change writes again.
  } finally {
    slot.writing = false;
    if (slot.value !== undefined) flush(key);
  }
}
