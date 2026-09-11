import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

// Servidor isolado em porta livre; não toca nos dados pessoais em data/.
test('API: cadastrar, editar, persistir, restaurar e rejeitar dados inválidos', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nexora-test-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server/server.js'], { env:{...process.env, PORT:'0', DATA_DIR:directory}, stdio:['ignore','pipe','pipe'] });
    const output = await new Promise((resolve, reject) => { child.stdout.once('data', chunk => resolve(chunk.toString())); child.once('error',reject); child.once('exit',code => reject(new Error('Servidor saiu: '+code))); });
    return output.match(/http:\/\/[^\s]+/)[0];
  }
  async function stop() { const closed = once(child, 'exit'); child.kill(); await closed; }
  try {
    let base = await start();
    const api = async (path, method='GET', body, headers={}) => {
      const result = await fetch(base + '/api' + path, { method,headers:{'Content-Type':'application/json',...headers},body:body === undefined ? undefined : JSON.stringify(body) });
      return { status:result.status,data:await result.json() };
    };
    assert.equal((await api('/state')).data.transactions.length,0);
    const row = {description:'Café e pão',amount:1250,type:'expense',status:'pending',date:'2026-09-11',category:'alimentacao',notes:'Teste isolado'};
    let result = await api('/transactions','POST',row); assert.equal(result.status,200); const id = result.data.transactions[0].id;
    result = await api('/transactions/'+id,'PUT',{...row,amount:1550,status:'paid'}); assert.equal(result.data.transactions[0].amount,1550);
    assert.equal((await api('/transactions','POST',{...row,date:'2026-13-01'})).status,400);
    assert.equal((await api('/transactions','POST',row,{Origin:'https://outro-site.example'})).status,400);
    assert.equal((await api('/budgets','PUT',{month:'2026-09',category:'alimentacao',amount:100000})).status,200);
    assert.equal((await api('/categories','POST',{name:'Pets',color:'#112233'})).status,200);
    const backup = (await api('/backup')).data;
    assert.equal((await api('/restore','POST',{...backup,transactions:[{...backup.transactions[0],category:'missing'}]})).status,400);
    assert.equal((await api('/state')).data.transactions.length,1);
    await stop(); base = await start();
    assert.equal((await api('/state')).data.transactions[0].description,'Café e pão');
    assert.equal((await api('/transactions/'+id,'DELETE',{})).data.transactions.length,0);
    assert.equal((await api('/restore','POST',backup)).data.transactions.length,1);
    assert.equal(JSON.parse(await readFile(join(directory,'finance.json'),'utf8')).transactions[0].amount,1550);
    assert.equal(JSON.parse(await readFile(join(directory,'finance.json.previous'),'utf8')).transactions.length,0);
  } finally { if (child && child.exitCode === null) await stop(); await rm(directory,{recursive:true,force:true}); }
});
