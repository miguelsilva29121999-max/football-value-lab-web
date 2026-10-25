import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
// IDs essenciais utilizados em init; renderizados no HTML estático antes da ligação aos dados.
const required=['mode','min-prob','topdate','notification','league','fixture','league-count','market-count','api-state','connection-short','league-chips','selected-count','scan','analyze','reload','default-leagues','all-leagues','no-leagues','radar-screen','match-screen','radar-panel','analysis-panel','extended','radar-extended','deep-games','depth-cost'];
test('Todos os elementos da inicialização existem no HTML',()=>{
 for (const id of required) assert.match(html,new RegExp(`id=["']${id}["']`),`Elemento ausente: ${id}`);
});
test('O seletor de modo tem valores aceites pelo servidor',()=>{
 assert.match(html, /<select[^>]*id="mode"/);
 assert.match(html, /value="balanced"/);
 assert.match(html, /value="conservative"/);
 assert.match(js,/modeSelect\.onchange=/);
});

test('Profundidade de análise oferece 2, 4 e 6 jogos e apresenta aviso de quota',()=>{
 assert.match(html,/id="deep-games"/);
 for(const count of ['2','4','6']) assert.match(html,new RegExp(`value="${count}"`));
 assert.match(js,/window\.confirm\(/);
 assert.match(js,/deepGames=/);
});
