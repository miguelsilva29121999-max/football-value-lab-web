import test from 'node:test';
import assert from 'node:assert/strict';
import {poissonUnder,countUnder,scoreOffer,estimateMatch,probabilityFor,POLICY,policyForMode} from '../lib/model.mjs';
import {evaluateOffers,diversifyPicks} from '../lib/providers.mjs';
import {server} from '../server.mjs';
function approx(a,b,tol=1e-9){assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`)}
function games(){
 const teams=['Home','Away','C','D','E','F','G','H'];const arr=[];
 for(let i=0;i<400;i++){
  const home=teams[i%8],away=teams[(i+3)%8];
  const date=new Date(Date.UTC(2025,9,1+i%380)).toISOString().slice(0,10);
  arr.push({date,home,away,hg:i%3,ag:(i+1)%3,hhg:i%2,hag:(i+1)%2,hc:3+i%9,ac:3+i%7,hy:1+i%4,ay:2+i%4,hs:8+i%14,as:9+i%11,hst:2+i%6,ast:3+i%6});
 }
 return arr;
}
const model=estimateMatch(games(),'Home','Away','2026-10-25');
test('Binomial negativa coincide com Poisson sem sobredispersao',()=>approx(countUnder(6.8,7.5,1),poissonUnder(6.8,7.5)));
test('Maior dispersao produz mais zeros em contagens',()=>assert.ok(countUnder(4.5,.5,2)>countUnder(4.5,.5,1)));
test('Distribuicao tem probabilidades entre 0 e 1',()=>{for(const d of [1,1.2,1.8,3.2])for(const line of [0.5,2.5,10.5,19.5]){const x=countUnder(10,line,d);assert.ok(x>=0&&x<=1);}});
test('Estimativa inclui metricas de qualidade e dispersao',()=>{assert.ok(model.ready,JSON.stringify(model.reasons));assert.ok(model.quality.dataScore>=0&&model.quality.dataScore<=1);assert.ok(model.rates.corners.dispersion>=1);assert.ok(model.rates.goals.effectiveSamples.home>0);});
test('Cenarios flutuam e incluem a probabilidade central',()=>{const p=probabilityFor(model,'totals','over',2.5);assert.equal(p.scenarios.length,9);assert.ok(p.low<=p.win&&p.high>=p.win);assert.ok(p.high-p.low>.02);});
test('Probabilidade robusta tem cenario pior do que estimativa pontual',()=>{const p=probabilityFor(model,'btts','yes');const x=scoreOffer(p,2.1);assert.ok(x.evSafe<=x.ev);assert.ok(x.pConservative<=p.win);});
test('Resultado com odds 1.85 pode ser rejeitado se intervalo pior desfavoravel',()=>{const p={win:.73,push:0,scenarios:[{win:.50,push:0},{win:.73,push:0},{win:.82,push:0}]};const v=scoreOffer(p,1.85);assert.equal(v.status,'REJEITAR');assert.ok(v.ev>0&&v.evSafe<0);});
test('Empate anula tem retorno correto no pior cenario',()=>{const p={win:.55,push:.24,scenarios:[{win:.42,push:.3},{win:.55,push:.24}]};const v=scoreOffer(p,1.8);approx(v.evSafe,.42*1.8+.3-1);});
test('Sem probabilidade valida nem preço valido nao cria candidato',()=>{assert.equal(scoreOffer({win:0,push:0},1.9).status,'REJEITAR');assert.equal(scoreOffer({win:.7,push:0},NaN).status,'REJEITAR');});
test('Odd manual favoravel requer verificacao em vez de sinal aprovado',()=>{const est={ready:true,prob:{},quality:{dataScore:.88},rates:{goals:{ready:true,home:1.8,away:1.4,uncertainty:.12,dispersion:1}}};const x=evaluateOffers(est,[{market:'totals',selection:'over',point:.5,price:3.1,sourceType:'manual',bookmaker:'Manual'}]);assert.equal(x.length,1);assert.equal(x[0].status,'CONFIRMAR');});
test('Odds de ficheiro nao passam a sinal aprovado',()=>{const est={ready:true,prob:{},quality:{dataScore:.88},rates:{goals:{ready:true,home:1.8,away:1.4,uncertainty:.12,dispersion:1}}};const x=evaluateOffers(est,[{market:'totals',selection:'over',point:.5,price:3.1,sourceType:'snapshot',bookmaker:'CSV'}]);assert.equal(x[0].status,'INDICATIVA');});
test('Odd de API sem timestamp nao entra como candidato',()=>{const est={ready:true,prob:{},quality:{dataScore:.88},rates:{goals:{ready:true,home:1.8,away:1.4,uncertainty:.12,dispersion:1}}};const x=evaluateOffers(est,[{market:'totals',selection:'over',point:.5,price:3.1,sourceType:'api',bookmaker:'API'}]);assert.equal(x[0].status,'REJEITAR');});
test('Amostra fraca bloqueia candidatura mesmo com odd elevada',()=>{const est={ready:true,prob:{},quality:{dataScore:.2},rates:{goals:{ready:true,home:1.8,away:1.4,uncertainty:.12,dispersion:1}}};const x=evaluateOffers(est,[{market:'totals',selection:'over',point:.5,price:3.1,sourceType:'api',bookmaker:'API',lastUpdate:new Date().toISOString()}]);assert.equal(x[0].status,'REJEITAR');});
test('Comparacao mantem melhor odd e regista alternativa',()=>{const est={ready:true,prob:{},quality:{dataScore:.88},rates:{goals:{ready:true,home:1.8,away:1.4,uncertainty:.12,dispersion:1}}};const offers=[{market:'totals',selection:'over',point:.5,price:1.9,sourceType:'api',bookmaker:'Casa 1',lastUpdate:new Date().toISOString()},{market:'totals',selection:'over',point:.5,price:2.1,sourceType:'api',bookmaker:'Casa 2',lastUpdate:new Date().toISOString()}];const x=evaluateOffers(est,offers);assert.equal(x.length,1);assert.equal(x[0].odd,2.1);assert.equal(x[0].otherBookmakers[0].name,'Casa 1');});
test('Evita 2 linhas semelhantes do mesmo mercado num jogo',()=>{const x=diversifyPicks([{market:'totals',evSafe:.2},{market:'totals',evSafe:.12},{market:'btts',evSafe:.1}],2);assert.deepEqual(x.map(p=>p.market),['totals','btts']);});
test('Servidor HTTP devolve versao e catalogo',async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{const port=server.address().port;const r=await fetch(`http://127.0.0.1:${port}/api/status`);assert.equal(r.status,200);const data=await r.json();assert.equal(Object.keys(data.leagues).length,22);assert.equal(data.policy.halfLifeDays,100);assert.ok(Array.isArray(data.markets));}finally{await new Promise(ok=>server.close(ok));}
});

test('Modo equilibrado pode sinalizar uma estimativa de EV central promissor sem prometer robustez',()=>{
 const p={win:.70,push:0,scenarios:[{win:.57,push:0},{win:.70,push:0},{win:.75,push:0}]};
 assert.equal(scoreOffer(p,1.75,policyForMode('conservative')).status,'REJEITAR');
 const result=scoreOffer(p,1.75,policyForMode('balanced'));
 assert.equal(result.status,'POTENCIAL');assert.ok(result.ev>0);assert.ok(result.evSafe<result.ev);
});
test('Modo equilibrado manda observar odds interessantes mas demasiadamente incertas',()=>{
 const p={win:.65,push:0,scenarios:[{win:.43,push:0},{win:.65,push:0}]};
 const result=scoreOffer(p,1.83,policyForMode('balanced'));
 assert.equal(result.status,'OBSERVAR');assert.ok(result.ev>0);assert.ok(result.evSafe<0);
});
test('Odds irrelevantes continuam rejeitadas mesmo no modo equilibrado',()=>{
 const p={win:.92,push:0,scenarios:[{win:.80,push:0},{win:.92,push:0}]};
 assert.equal(scoreOffer(p,1.10,policyForMode('balanced')).status,'REJEITAR');
});
test('Sem odds verificadas não há sinais API; preço CSV permanece indicativo em ambos os modos',()=>{
 const est={ready:true,quality:{dataScore:.84},rates:{goals:{ready:true,home:1.7,away:1.25,uncertainty:.13,dispersion:1}}};
 const sample={market:'totals',selection:'over',point:0.5,price:2.75,bookmaker:'Fonte externa'};
 for(const mode of ['balanced','conservative']){
  const x=evaluateOffers(est,[{...sample,sourceType:'snapshot'}],mode);
  assert.ok(x.every(x=>x.status!=='POTENCIAL'&&x.status!=='OBSERVAR'));
 }
});
