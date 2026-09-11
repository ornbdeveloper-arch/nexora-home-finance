import { emptyState, validateBackup } from './domain.js';

const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !secretKey) {
  throw new Error(
    'SUPABASE_URL e SUPABASE_SECRET_KEY precisam estar configuradas.'
  );
}

const endpoint = `${supabaseUrl}/rest/v1/nexora_state`;

const headers = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json'
};

async function loadState() {
  const response = await fetch(
    `${endpoint}?id=eq.1&select=data`,
    {
      headers
    }
  );

  if (!response.ok) {
    throw new Error(
      `Não foi possível carregar os dados do Supabase: ${response.status} ${await response.text()}`
    );
  }

  const rows = await response.json();

  if (rows.length === 0) {
    const initialState = emptyState();

    await persistState(initialState);

    return initialState;
  }

  return validateBackup(rows[0].data);
}

async function persistState(next) {
  const validated = validateBackup(next);

  const response = await fetch(
    `${endpoint}?on_conflict=id`,
    {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: 1,
        data: validated,
        updated_at: new Date().toISOString()
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Não foi possível salvar os dados no Supabase: ${response.status} ${await response.text()}`
    );
  }

  return validated;
}

let state = await loadState();

export function readState() {
  return structuredClone(state);
}

export async function saveState(next) {
  const validated = await persistState(next);

  state = validated;

  return readState();
}