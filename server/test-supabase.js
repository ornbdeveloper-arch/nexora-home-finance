const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Variáveis do Supabase não encontradas.');
  process.exit(1);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
};

const testState = {
  version: 1,
  categories: [],
  transactions: [],
  budgets: []
};

// grava ou atualiza o registro id = 1
const writeResponse = await fetch(
  `${supabaseUrl}/rest/v1/nexora_state?id=eq.1`,
  {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify({
      id: 1,
      data: testState,
      updated_at: new Date().toISOString()
    })
  }
);

if (!writeResponse.ok) {
  console.error('Erro ao gravar:');
  console.error(writeResponse.status, await writeResponse.text());
  process.exit(1);
}

console.log('Gravação realizada com sucesso.');

// lê novamente
const readResponse = await fetch(
  `${supabaseUrl}/rest/v1/nexora_state?id=eq.1&select=*`,
  {
    headers
  }
);

if (!readResponse.ok) {
  console.error('Erro ao ler:');
  console.error(readResponse.status, await readResponse.text());
  process.exit(1);
}

const data = await readResponse.json();

console.log('Leitura realizada com sucesso.');
console.log(data);