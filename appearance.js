(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.LifeAppearance=api;
})(typeof window==='object'?window:this,function(){
  'use strict';
  const accents=[['Blue','#2b57c7'],['Forest','#24704f'],['Teal','#167383'],['Rose','#b34463'],['Amber','#996300'],['Graphite','#4e5664']];
  const backgrounds=[['white','White','#ffffff'],['mist','Mist','#f5f6f8'],['rose','Rose','#fff7f8'],['mint','Mint','#f3f8f5'],['sky','Sky','#f3f7fd']];
  const defaults=Object.freeze({accent:'#2b57c7',background:'white'});
  const hex=value=>typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;
  const rgb=value=>[1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
  const mix=(a,b,amount)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-amount)+rgb(b)[i]*amount).toString(16).padStart(2,'0')).join('');
  const luminance=value=>rgb(value).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const foreground=background=>contrast('#ffffff',background)>=contrast('#000000',background)?'#ffffff':'#000000';
  function normalize(value){
    const input=value && typeof value==='object'?value:{};
    return {accent:hex(input.accent) || defaults.accent,background:backgrounds.some(([key])=>key===input.background)?input.background:defaults.background};
  }
  function tokens(value){
    const appearance=normalize(value),accent=appearance.accent;
    let text=accent;
    // Pastel accents remain selectable, but text must also work on white cards
    // and the pale selected-state/background surfaces.
    for(let i=0;i<=100;i++){
      text=mix(accent,'#000000',i/100);
      if(contrast(text,'#ffffff')>=5.5)break;
    }
    const hover=mix(accent,'#000000',.12);
    return {'--action':text,'--action-fill':accent,'--action-on':foreground(accent),'--action-hover':hover,'--action-hover-on':foreground(hover),'--action-soft':mix(accent,'#ffffff',.92),'--action-line':mix(accent,'#ffffff',.72),'--bg':backgrounds.find(([key])=>key===appearance.background)[2]};
  }
  return Object.freeze({accents,backgrounds,defaults,normalize,tokens,contrast});
});
