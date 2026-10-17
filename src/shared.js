/* Helpers shared by the build (Node) and the browser script. */
(function(root){
"use strict";
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const md = s => esc(s).replace(/\*(.+?)\*/g,"<em>$1</em>");
const arDigits = (n, lang) => lang==="ar" ? String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]) : String(n);
const waLink = (number, text) => "https://wa.me/" + String(number).replace(/\D/g,"") + "?text=" + encodeURIComponent(text);
const prettyPhone = number => { const d = String(number).replace(/\D/g,""); return "+" + d.replace(/^(\d{2})(\d{3})(\d{3})(\d+)$/,"$1 $2 $3 $4"); };
const IC = {
  wheel:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 14.5V21M9.6 11.2 3.4 9.5M14.4 11.2l6.2-1.7"/>',
  plane:'<path d="M2.5 13.5 21 7.5l-1-2-7.5 2.2L7 3H5l3 5.5-4 1.2-2-1.5H1l1.5 5.3z"/><path d="M3 20h18"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  pyramid:'<path d="M12 3 2 20h20z"/><path d="M12 3l3 17"/>',
  route:'<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/>',
  pin:'<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  car:'<path d="M3 16v-4l2.5-5h13L21 12v4z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M3 12h18"/>',
  shield:'<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  swap:'<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  chat:'<path d="M20.5 11.6a8.5 8.5 0 0 1-12.7 7.4L3 20.5l1.6-4.6A8.5 8.5 0 1 1 20.5 11.6z"/><path d="M8.7 8.6c.3 2.6 2.2 5 4.9 6.1l1.3-1.2 2 1-.4 1.7c-4 .3-8.3-3.8-8.5-7.9l1.6-.6 1.1 1.9z"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
  bag:'<rect x="5" y="7" width="14" height="13" rx="2"/><path d="M9 7V4h6v3"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  text:'<path d="M4 6h16M4 12h10M4 18h13"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>',
  back:'<path d="M15 6l-6 6 6 6"/>',
  museum:'<path d="M3 9 12 4l9 5"/><path d="M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18"/>',
  mosque:'<path d="M7 20v-6a5 5 0 0 1 10 0v6"/><path d="M12 9V6"/><path d="M3 20V10l1-2.5L5 10v10M19 20V10l1-2.5 1 2.5v10M2 20h20"/>',
  tree:'<path d="M12 21v-6"/><path d="M12 3a5 5 0 0 0-5 5 4 4 0 0 0 1 7h8a4 4 0 0 0 1-7 5 5 0 0 0-5-5z"/>',
  lamp:'<path d="M12 2v2M9 4h6M8 8l1-4h6l1 4M7 8h10l-1.5 9h-7z"/><path d="M10 20h4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  check:'<path d="m5 12 5 5 9-10"/>',
  bed:'<path d="M3 18V7M3 13h18v5M21 18v-3a3 3 0 0 0-3-3h-7v1"/><circle cx="7" cy="10.5" r="1.8"/>',
  fork:'<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M16 21V3c2.5 1 3.5 4 3.5 7s-1.5 4-3.5 4"/>',
  wave:'<path d="M2 15c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4-2 2 2 4 2"/><path d="M2 19c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><circle cx="17" cy="6" r="3"/>',
  music:'<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'
};
const ic = n => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[n]+'</svg>';

let gid = 0;
function scene(kind){
  const ar = false; // night palette everywhere
  const P = ar
    ? {s1:"#F4E6CF",s2:"#E7B68A",sun:"#FFF6E6",far:"#C99A6B",py1:"#D7AE7C",py2:"#B98654",sand:"#E4C79E",sand2:"#D3AE7E",sea1:"#58A9A3",sea2:"#1E6A66",ink:"#0F3F3D",lt:"#FBF8F2",star:0}
    : {s1:"#0A1019",s2:"#2C3A52",sun:"#E8D6AE",far:"#2A3546",py1:"#8C7553",py2:"#4F4231",sand:"#2E271E",sand2:"#221D16",sea1:"#1F4560",sea2:"#0E2233",ink:"#05080C",lt:"#E8D6AE",star:1};
  const id = "sc"+(++gid);
  let defs = '<defs><linearGradient id="'+id+'a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+P.s1+'"/><stop offset="1" stop-color="'+P.s2+'"/></linearGradient>'
           + '<linearGradient id="'+id+'b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+P.sea1+'"/><stop offset="1" stop-color="'+P.sea2+'"/></linearGradient></defs>';
  let g = '<rect width="400" height="240" fill="url(#'+id+'a)"/>';
  if(P.star){ [[30,30],[80,58],[140,22],[210,44],[260,18],[330,40],[370,70],[110,90],[45,110]].forEach(([x,y],i)=>{ g += '<circle cx="'+x+'" cy="'+y+'" r="'+(i%3?0.9:1.4)+'" fill="#E8DFC9" opacity=".8"/>'; }); }
  const sun = (x,y,r) => '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+P.sun+'" opacity="'+(P.star?.9:1)+'"/>';
  const pyr = (x,top,w,y) => '<polygon points="'+(x-w)+','+y+' '+x+','+top+' '+(x+w)+','+y+'" fill="'+P.py1+'"/><polygon points="'+x+','+top+' '+(x+w)+','+y+' '+(x+w*0.25)+','+y+'" fill="'+P.py2+'"/>';
  if(kind==="giza"){
    g += sun(318,72,20) + pyr(120,88,95,196) + pyr(262,112,74,196) + pyr(352,150,40,196)
       + '<rect y="194" width="400" height="46" fill="'+P.sand+'"/><path d="M0 214 Q120 204 200 216 T400 210 V240 H0z" fill="'+P.sand2+'"/>';
  } else if(kind==="museum"){
    g += sun(70,60,16) + pyr(300,120,60,190) + pyr(370,140,40,190)
       + '<polygon points="20,200 210,96 300,200" fill="'+P.py1+'"/><polygon points="210,96 300,200 236,200" fill="'+P.py2+'"/>';
    for(let i=0;i<7;i++){ const x=60+i*26; g += '<line x1="'+x+'" y1="'+(200-(x-20)*0.55)+'" x2="'+x+'" y2="200" stroke="'+P.ink+'" stroke-opacity=".18" stroke-width="2"/>'; }
    g += '<rect y="198" width="400" height="42" fill="'+P.sand+'"/>';
  } else if(kind==="oldcairo"){
    g += sun(300,64,18);
    const col = P.far;
    g += '<rect y="168" width="400" height="72" fill="'+col+'"/>';
    [[60,120,10],[130,96,8],[262,106,9],[340,124,8]].forEach(([x,top,w])=>{ g += '<rect x="'+(x-w/2)+'" y="'+top+'" width="'+w+'" height="'+(170-top)+'" fill="'+col+'"/><polygon points="'+(x-w/2)+','+top+' '+x+','+(top-16)+' '+(x+w/2)+','+top+'" fill="'+col+'"/><rect x="'+(x-w/2-3)+'" y="'+(top+22)+'" width="'+(w+6)+'" height="4" fill="'+col+'"/>'; });
    [[100,150,34],[200,140,48],[300,156,30]].forEach(([x,y,r])=>{ g += '<path d="M'+(x-r)+' '+(y+10)+' A'+r+' '+r+' 0 0 1 '+(x+r)+' '+(y+10)+' V170 H'+(x-r)+'z" fill="'+col+'"/>'; });
    g += '<rect y="200" width="400" height="40" fill="'+P.sand2+'"/>';
  } else if(kind==="alex"){
    g += sun(330,60,18) + '<rect y="150" width="400" height="90" fill="url(#'+id+'b)"/>';
    g += '<path d="M40 150 V112 H64 V100 H80 V112 H118 V96 H150 V112 H178 V150z" fill="'+P.ink+'" opacity=".85"/><rect x="128" y="84" width="12" height="14" fill="'+P.ink+'" opacity=".85"/>';
    g += '<path d="M0 152 H200 L190 160 H0z" fill="'+P.far+'"/>';
    for(let i=0;i<5;i++){ g += '<path d="M'+(200+i*36)+' '+(172+i*12)+' q10 -5 20 0 t20 0" stroke="'+P.lt+'" stroke-opacity=".5" fill="none" stroke-width="1.5"/>'; }
  } else if(kind==="sahel"){
    g += sun(80,64,18) + '<rect y="132" width="400" height="108" fill="url(#'+id+'b)"/>';
    g += '<rect y="132" width="400" height="10" fill="'+P.sea1+'" opacity=".6"/>';
    g += '<path d="M0 196 Q140 176 260 192 T400 186 V240 H0z" fill="'+(P.star?"#5E5444":"#F2E6D2")+'"/>';
    g += '<line x1="300" y1="150" x2="300" y2="196" stroke="'+P.ink+'" stroke-width="2"/><path d="M262 154 Q300 122 338 154z" fill="'+(P.star?"#B48C55":"#B5633A")+'"/>';
  } else if(kind==="fayoum"){
    g += sun(300,60,16) + '<path d="M0 150 Q80 110 170 140 T400 128 V240 H0z" fill="'+P.py1+'"/>';
    g += '<ellipse cx="160" cy="196" rx="160" ry="22" fill="url(#'+id+'b)"/>';
    g += '<path d="M248 150 h16 v34 h-16z" fill="'+P.sea1+'" opacity=".8"/>';
    g += '<path d="M0 214 Q200 198 400 220 V240 H0z" fill="'+P.sand2+'"/>';
  } else { /* road */
    g += sun(200,96,22) + '<path d="M0 150 Q90 120 170 146 Q260 120 400 144 V240 H0z" fill="'+P.py1+'"/>';
    g += '<path d="M0 170 Q120 150 230 172 T400 166 V240 H0z" fill="'+P.sand2+'"/>';
    g += '<polygon points="150,240 250,240 206,150 194,150" fill="'+P.ink+'" opacity=".75"/>';
    for(let i=0;i<5;i++){ const y=160+i*17; g += '<rect x="'+(199-i*0.6)+'" y="'+y+'" width="'+(2+i*0.7)+'" height="'+(6+i*2)+'" fill="'+P.lt+'" opacity=".8"/>'; }
  }
  return '<svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">'+defs+g+'</svg>';
}

function carSvg(k){
  const D = {sedan:{w:118,h:20,c:[34,96,16]}, suv:{w:122,h:28,c:[28,104,20]}, minivan:{w:128,h:30,c:[16,118,24]}, van:{w:150,h:36,c:[8,148,28]}}[k];
  const x0 = 6, base = 56, bodyTop = base - D.h;
  const cab = D.c, cabTop = bodyTop - cab[2];
  return '<svg viewBox="0 0 170 70" fill="currentColor" aria-hidden="true">'
    + '<rect x="'+x0+'" y="'+bodyTop+'" width="'+D.w+'" height="'+D.h+'" rx="7"/>'
    + '<path d="M'+(x0+cab[0])+' '+(bodyTop+1)+' L'+(x0+cab[0]+8)+' '+cabTop+' H'+(x0+cab[1]-6)+' L'+(x0+cab[1]+6)+' '+(bodyTop+1)+'z"/>'
    + '<rect x="'+(x0+cab[0]+10)+'" y="'+(cabTop+4)+'" width="'+(cab[1]-cab[0]-18)+'" height="'+(cab[2]-6)+'" rx="2" fill="var(--bg)" opacity=".55"/>'
    + '<circle cx="'+(x0+24)+'" cy="'+base+'" r="9" fill="var(--bg)"/><circle cx="'+(x0+24)+'" cy="'+base+'" r="7"/>'
    + '<circle cx="'+(x0+D.w-24)+'" cy="'+base+'" r="9" fill="var(--bg)"/><circle cx="'+(x0+D.w-24)+'" cy="'+base+'" r="7"/>'
    + '<rect x="0" y="'+(base+9)+'" width="170" height="1.2" opacity=".25"/></svg>';
}

function skyline(){
  return '<svg class="sky" viewBox="0 0 300 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><g fill="currentColor">'
    +'<rect x="8" y="70" width="18" height="50"/><rect x="30" y="56" width="14" height="64"/><rect x="48" y="78" width="22" height="42"/>'
    +'<rect x="92" y="34" width="5" height="86"/><path d="M86 40h17l-3-8h-11z"/><rect x="74" y="74" width="12" height="46"/>'
    +'<rect x="112" y="62" width="20" height="58"/><rect x="136" y="48" width="12" height="72"/><path d="M152 120v-30a16 16 0 0 1 32 0v30z"/>'
    +'<rect x="190" y="40" width="4" height="80"/><path d="M188 42l4-10 4 10z"/><rect x="200" y="66" width="24" height="54"/><rect x="228" y="52" width="16" height="68"/>'
    +'<rect x="248" y="76" width="20" height="44"/><rect x="272" y="60" width="22" height="60"/></g></svg>';
}
/* Cairo Voyage mark: an open C in currentColor around a road (gold) with a dashed centre line */
const rMark = () => '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><path d="M76 24 A36 36 0 1 0 76 76" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round"/><path class="leg" d="M38 80 H62 L52 34 H48z"/><path class="cut" d="M50 42 V76" fill="none" stroke-width="2.4" stroke-dasharray="4 4"/></svg>';
const Shared = {rMark, esc, md, arDigits, waLink, prettyPhone, IC, ic, scene, carSvg, skyline};
if (typeof module !== "undefined" && module.exports) module.exports = Shared; else root.Shared = Shared;
})(typeof window !== "undefined" ? window : this);
