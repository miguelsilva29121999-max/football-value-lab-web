// Coerência entre odd mínima TEÓRICA e preço observado.
// Nenhuma destas regras confirma arbitragem, valor esperado real ou odds ao vivo.
export function priceReality({minimumOdd,offeredOdd=null,indicativeOdd=null}={}){
 const valid=x=>typeof x==='number'&&Number.isFinite(x)&&x>1.01&&x<=60;
 if(!valid(minimumOdd))return {status:'SEM_ESTIMATIVA',price:null,source:null,shortfall:null,relativeShortfall:null};
 const quote=valid(offeredOdd)?offeredOdd:valid(indicativeOdd)?indicativeOdd:null;
 const source=valid(offeredOdd)?'MANUAL':valid(indicativeOdd)?'INDICATIVA':null;
 if(quote===null)return {status:'SEM_PRECO',price:null,source:null,shortfall:null,relativeShortfall:null};
 const shortfall=Number((minimumOdd-quote).toFixed(2));
 const relativeShortfall=Number((shortfall/quote).toFixed(3));
 // Um desvio grande significa que a linha não é uma aposta viável ao preço observado,
 // mas um snapshot antigo não pode, sozinho, classificar um mercado em tempo real.
 const veryFar=shortfall>=0.15&&relativeShortfall>=0.12;
 return {
  status:veryFar?'PRECO_MUITO_INFERIOR':shortfall>0.009?'ABAIXO_DO_MINIMO':'PRECO_PASSA_MINIMO',
  price:quote,source,shortfall,relativeShortfall,
  gapPct:Number((relativeShortfall*100).toFixed(1)),
  observedBreakEven:Number((1/quote).toFixed(4)),
  evidence:source==='MANUAL'?'Cotação introduzida pelo utilizador; não verificada automaticamente.':'Cotação de snapshot histórico/indicativo; pode já ter mudado.'
 };
}

export function replacementQuoteOptions(markets,options,selectedOptionId,{max=3}={}){
 const chosen=options.find(o=>o.id===selectedOptionId);
 if(!chosen||!Array.isArray(markets))return [];
 const candidates=markets.filter(c=>c.optionId!==selectedOptionId).map(c=>{
  const o=options.find(x=>x.id===c.optionId);
  if(!o)return null;
  const sameFamily=o.market===chosen.market&&o.team===chosen.team;
  const sameSelection=o.selection===chosen.selection;
  // Mercados de contagem: linha mais difícil para a mesma direção de aposta.
  const harder=sameFamily&&sameSelection&&Number.isFinite(o.point)&&Number.isFinite(chosen.point)&&
   (o.selection==='over'?o.point>chosen.point:o.selection==='under'?o.point<chosen.point:false);
  return {...c,related:harder,marketOption:o};
 }).filter(Boolean);
 candidates.sort((a,b)=>Number(b.related)-Number(a.related)||
  Math.abs(a.oddTarget-1.95)-Math.abs(b.oddTarget-1.95)||
  b.pLow-a.pLow);
 return candidates.slice(0,max).map(c=>({
  optionId:c.optionId,name:c.label,minimumOdd:c.oddTarget,
  relationship:c.related?'LINHA_MAIS_EXIGENTE':'OUTRO_MERCADO',
  note:'Verificar a odd REAL. A odd mínima do modelo não é uma cotação disponível.'
 }));
}
