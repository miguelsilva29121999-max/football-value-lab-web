import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LEAGUES,POLICY,allMarketOptions} from './lib/model.mjs';
import {loadLeague,scanLeagues,analyzeFixture,oddsSports} from './lib/providers.mjs';
import {scanStatFirst,checkStatManual,QUOTE_PROFILES} from './lib/statfirst.mjs';
import {scanMarketLab,evaluateMultipleRequest,SEARCH_MODES} from './lib/marketlab.mjs';
import {createMatchContext, buildManualOdd, askGeminiAI} from './lib/ai-assistant.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
let env={...process.env};
try{for(const line of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
 if(m){env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}}}catch{}
const PORT=Number(env.PORT)||3000,key=env.ODDS_API_KEY||'',geminiKey=env.GEMINI_API_KEY||'',aiModel=env.GEMINI_MODEL||'gemini-2.5-flash';
const accessCode=env.SITE_ACCESS_CODE||'';
const vercelEnv=Boolean(env.VERCEL);
function secureCodeMatch(input){
 const a=Buffer.from(typeof input==='string'?input:''); const b=Buffer.from(accessCode);
 return a.length===b.length&&timingSafeEqual(a,b);
}
const mime={'/':'text/html; charset=utf-8','/index.html':'text/html; charset=utf-8','/style.css':'text/css; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/favicon.svg':'image/svg+xml','/ai':'text/html; charset=utf-8','/assistant.html':'text/html; charset=utf-8','/assistant.css':'text/css; charset=utf-8','/assistant.js':'text/javascript; charset=utf-8'};
const send=(res,code,value)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
async function readJson(req){if(req.body!==undefined){const json=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(json.length>18000)throw Error('Pedido demasiado grande.');return typeof req.body==='string'?JSON.parse(req.body):req.body;}let raw='';for await(const part of req){raw+=part;if(raw.length>18000)throw Error('Pedido demasiado grande.');}try{return JSON.parse(raw);}catch{throw Error('Pedido JSON inválido.');}}
export function manualOffer(request){if(!request)return null;
 const option=allMarketOptions().find(x=>x.id===String(request.optionId));const price=Number(String(request.odd||'').replace(',','.'));
 if(!option)throw Error('Mercado manual inválido.');if(!Number.isFinite(price)||price<=1.01||price>60)throw Error('Odd manual inválida.');
 return {...option,price};}
let aiBusy=false;
export async function handleRequest(req,res){
 const url=new URL(req.url||'/',`http://localhost:${PORT}`);
 try{
  // Em Vercel, o acesso privado e obrigatório. O código nunca chega ao HTML.
  if(vercelEnv&&(!accessCode||accessCode.length<12))return send(res,503,{error:'Configura SITE_ACCESS_CODE (mínimo 12 caracteres) nas variáveis de ambiente da Vercel.',code:'ACCESS_NOT_CONFIGURED'});
  if(accessCode&&!secureCodeMatch(req.headers['x-fvl-access-code']))return send(res,401,{error:'Código de acesso do site necessário ou incorreto.',code:'ACCESS_REQUIRED'});

  if(req.method==='GET'&&url.pathname==='/api/ai/status')return send(res,200,{configured:!!geminiKey,model:aiModel,hasLiveFeed:false,canSearchWeb:true,provider:'Gemini (plano gratuito com limites)',explanation:'A IA analisa estatísticas históricas e pode consultar notícias na web; não existe feed desportivo ao vivo.'});
  if(req.method==='POST'&&url.pathname==='/api/ai/preview'){
   const body=await readJson(req);
   const match=await createMatchContext({league:String(body.league||''),fixtureId:String(body.fixtureId||'')});
   return send(res,200,{packet:match.packet});
  }
  if(req.method==='POST'&&url.pathname==='/api/ai/validate'){
   const body=await readJson(req);
   const match=await createMatchContext({league:String(body.league||''),fixtureId:String(body.fixtureId||'')});
   const manual=buildManualOdd(match,String(body.optionId||''),body.odd);
   if(!manual)return send(res,400,{error:'Seleciona mercado e introduz uma odd decimal.'});
   return send(res,200,{manual,context:match.packet.fixture});
  }
  if(req.method==='POST'&&url.pathname==='/api/ai/chat'){
   if(!geminiKey)return send(res,409,{error:'Gemini ainda não configurado. Adiciona GEMINI_API_KEY nas variáveis de ambiente da Vercel.'});
   if(aiBusy)return send(res,429,{error:'Já existe uma análise IA em curso. Aguarda o resultado antes de pedir outra.'});
   const body=await readJson(req);
   const match=await createMatchContext({league:String(body.league||''),fixtureId:String(body.fixtureId||'')});
   const manual=body.optionId&&String(body.odd||'').trim()?buildManualOdd(match,String(body.optionId),body.odd):null;
   const history=Array.isArray(body.history)?body.history.slice(-6):[];
   aiBusy=true;
   try{const result=await askGeminiAI({packet:match.packet,manual,question:body.question,history,searchWeb:body.searchWeb!==false,apiKey:geminiKey,model:aiModel});return send(res,200,{...result,context:match.packet.fixture,manual});}
   finally{aiBusy=false;}
  }
  if(req.method==='GET'&&url.pathname==='/api/status')return send(res,200,{configured:!!key,leagues:LEAGUES,policy:POLICY,markets:allMarketOptions(),dataSource:'Football-Data + OpenFootball quando disponível',oddsSource:'The Odds API / ficheiro indicativo / manual',date:new Date().toISOString()});
  if(req.method==='GET'&&url.pathname==='/api/fixtures'){
   const league=url.searchParams.get('league')||'E0';const data=await loadLeague(league);
   return send(res,200,{league,fixtures:data.fixtures,historySize:data.historicalGames,sources:data.source,issues:data.issues,snapshotModified:data.snapshot?.modified||null});
  }
  if(req.method==='GET'&&url.pathname==='/api/odds-status'){
   if(!key)return send(res,200,{configured:false,message:'Sem chave. Preços de ficheiro são só indicativos; podes comparar odds atuais manualmente.'});
   try{const all=await oddsSports(key);return send(res,200,{configured:true,message:'Acesso ao catálogo de odds confirmado.',available:Object.fromEntries(Object.entries(LEAGUES).map(([k,v])=>[k,all.some(s=>s.key===v.sport)]))});}
   catch(e){return send(res,200,{configured:true,message:'Erro a verificar chave: '+e.message});}
  }
  if(req.method==='GET'&&url.pathname==='/api/market-lab'){
   const requested=(url.searchParams.get('leagues')||'E0,P1,SP1,D1,I1,F1').split(',').filter(Boolean);
   const leagues=[...new Set(requested)],mode=url.searchParams.get('mode')||'balanced';
   if(!leagues.length||leagues.length>12||leagues.some(k=>!LEAGUES[k]))throw Error('Seleciona entre uma e doze ligas válidas.');
   if(!SEARCH_MODES[mode])throw Error('Perfil inválido.');
   return send(res,200,await scanMarketLab(leagues,{mode}));
  }
  if(req.method==='POST'&&url.pathname==='/api/multiple-evaluate'){
   return send(res,200,await evaluateMultipleRequest(await readJson(req)));
  }
  if(req.method==='GET'&&url.pathname==='/api/stats-radar'){
   const requested=(url.searchParams.get('leagues')||'E0,P1,SP1,D1,I1,F1').split(',').filter(Boolean);
   const list=[...new Set(requested)];
   if(!list.length||list.length>12||list.some(x=>!LEAGUES[x]))throw Error('Seleciona entre uma e doze ligas válidas.');
   const profile=url.searchParams.get('profile')||'balanced';if(!Object.hasOwn(QUOTE_PROFILES,profile))throw Error('Perfil de procura inválido.');
   return send(res,200,await scanStatFirst(list,{profile}));
  }
  if(req.method==='POST'&&url.pathname==='/api/stats-validate'){
   const body=await readJson(req);
   return send(res,200,await checkStatManual(body));
  }
  if(req.method==='GET'&&url.pathname==='/api/radar'){
   const requested=(url.searchParams.get('leagues')||'E0,P1,SP1,D1,I1,F1').split(',').filter(Boolean);
   const list=[...new Set(requested)],advanced=url.searchParams.get('advanced')==='true',mode=url.searchParams.get('mode')==='conservative'?'conservative':'balanced';
   if(list.length>(advanced?3:12)||!list.length||list.some(x=>!LEAGUES[x]))throw Error(advanced?'Mercados avançados: seleciona no máximo 3 ligas.':'Seleciona entre uma e doze ligas válidas.');
   const deepGames=Number(url.searchParams.get('deepGames')||4);
   if(![2,4,6].includes(deepGames))throw Error('Profundidade inválida.');
   return send(res,200,await scanLeagues(list,key,{advanced,mode,deepGames}));
  }
  if(req.method==='POST'&&url.pathname==='/api/analyze'){
   const body=await readJson(req),league=String(body?.league||''),f=body?.fixture||{};
   if(!LEAGUES[league]||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(f.date||'')||!f.home||!f.away||String(f.home).length>100||String(f.away).length>100)throw Error('Jogo inválido.');
   const offer=manualOffer(body.manual);return send(res,200,await analyzeFixture(league,f,{manualOffers:offer?[offer]:[],oddsKey:key,extended:body.extended===true&&!offer,mode:body.mode==='conservative'?'conservative':'balanced'}));
  }
  const staticFiles={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/favicon.svg':'favicon.svg','/ai':'assistant.html','/assistant.html':'assistant.html','/assistant.js':'assistant.js','/assistant.css':'assistant.css'};
  if(req.method==='GET'&&Object.hasOwn(staticFiles,url.pathname)){res.writeHead(200,{'content-type':mime[url.pathname], 'cache-control':'no-cache','x-content-type-options':'nosniff'});
   fs.createReadStream(path.join(root,'public',staticFiles[url.pathname])).pipe(res);return;}
  return send(res,404,{error:'Rota não encontrada.'});
 }catch(e){console.error('[FVL]',url.pathname,e.message);const user=/inválid|Seleciona|inválido|não foi encontrado|demasiado|ja passou|ja comecou|mesmo jogo|reembolso|múltipla|Odd total|Odd individual|jogos diferentes/.test(e.message);return send(res,user?400:502,{error:e.message});}
}
const server=http.createServer(handleRequest);
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))server.listen(PORT,'127.0.0.1',()=>console.log(`Football Value Lab v5.1 + Gemini grátis em http://localhost:${PORT} | odds: ${key?'configuradas':'sem chave'}`));
export {server};
