/* XSPOT
   Invisible watermark prototype.
   Algorithm: 8x8 DCT, differential coefficient embedding, repeated header,
   deterministic block selection. It is intentionally self-contained so the
   project can run on GitHub Pages without a backend.
*/
const $ = s => document.querySelector(s);
const encoder = new TextEncoder(), decoder = new TextDecoder();

const MAGIC = "XSPOT1";
const VERSION = 1;
const KEY = "XSPOT-PUBLIC-V1-7F3A"; // Public prototype key. Not a secret.
const BLOCK = 8;
const STRENGTH = 7.0;
let createImage = null, lastOutput = null;

function uid(){
  const a = new Uint8Array(10); crypto.getRandomValues(a);
  return [...a].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
}
$("#wmId").value = uid();
$("#newId").onclick = ()=>$("#wmId").value=uid();

function setupTabs(){
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); $("#"+b.dataset.tab).classList.add("active");
  });
}
setupTabs();

function setupDrop(label, input, cb){
  const el=$(label), file=$(input);
  ["dragenter","dragover"].forEach(e=>el.addEventListener(e,ev=>{ev.preventDefault();el.classList.add("drag")}));
  ["dragleave","drop"].forEach(e=>el.addEventListener(e,ev=>{ev.preventDefault();el.classList.remove("drag")}));
  el.addEventListener("drop",ev=>{if(ev.dataTransfer.files[0]) cb(ev.dataTransfer.files[0])});
  file.addEventListener("change",()=>{if(file.files[0]) cb(file.files[0])});
}
function loadImage(file){
  return new Promise((resolve,reject)=>{
    if(!file || !file.type.startsWith("image/")) return reject(new Error("Selecciona una imagen válida."));
    const u=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{URL.revokeObjectURL(u);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(u);reject(new Error("No se pudo leer la imagen."))};
    img.src=u;
  });
}
setupDrop("#createDrop","#createFile",async f=>{
  try{
    createImage=await loadImage(f);
    $("#createImg").src=createImage.src;
    $("#createDrop").classList.add("hidden"); $("#createPreview").classList.remove("hidden");
    $("#embedBtn").disabled=false; $("#createStatus").textContent=`Imagen cargada · ${createImage.naturalWidth} × ${createImage.naturalHeight}px`;
  }catch(e){alert(e.message)}
});
$("#removeCreate").onclick=()=>{
  createImage=null; $("#createPreview").classList.add("hidden"); $("#createDrop").classList.remove("hidden");
  $("#embedBtn").disabled=true; $("#createStatus").textContent="Listo para comenzar.";
};

function hashString(s){
  let h=2166136261>>>0;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0;
}
function rng(seed){
  let x=seed>>>0;
  return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296};
}
function shuffle(a, seed){
  const r=rng(seed);
  for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
function dct8(v){
  const out=new Float64Array(64), c=n=>n===0?1/Math.sqrt(2):1;
  for(let u=0;u<8;u++) for(let vv=0;vv<8;vv++){
    let sum=0;
    for(let x=0;x<8;x++) for(let y=0;y<8;y++)
      sum+=v[x*8+y]*Math.cos((2*x+1)*u*Math.PI/16)*Math.cos((2*y+1)*vv*Math.PI/16);
    out[u*8+vv]=.25*c(u)*c(vv)*sum;
  }
  return out;
}
function idct8(v){
  const out=new Float64Array(64), c=n=>n===0?1/Math.sqrt(2):1;
  for(let x=0;x<8;x++) for(let y=0;y<8;y++){
    let sum=0;
    for(let u=0;u<8;u++) for(let vv=0;vv<8;vv++)
      sum+=c(u)*c(vv)*v[u*8+vv]*Math.cos((2*x+1)*u*Math.PI/16)*Math.cos((2*y+1)*vv*Math.PI/16);
    out[x*8+y]=.25*sum;
  }
  return out;
}
function luminance(r,g,b){return .299*r+.587*g+.114*b}
function getBits(bytes){
  const a=[]; for(const b of bytes) for(let i=7;i>=0;i--) a.push((b>>i)&1); return a;
}
function bitsToBytes(bits){
  const out=new Uint8Array(Math.floor(bits.length/8));
  for(let i=0;i<out.length;i++){let n=0;for(let j=0;j<8;j++)n=(n<<1)|bits[i*8+j];out[i]=n}
  return out;
}
function makePayload(){
  const obj={
    v:VERSION,
    brand:$("#wmBrand").value.trim()||"Sin nombre",
    owner:$("#wmOwner").value.trim()||"Sin propietario",
    id:$("#wmId").value.trim()||uid(),
    note:$("#wmNote").value.trim()||"",
    created:new Date().toISOString()
  };
  const json=JSON.stringify(obj), raw=encoder.encode(json);
  if(raw.length>180) throw new Error("Los datos son demasiado largos.");
  // [magic 6 bytes][version 1][length uint16][json][crc32]
  const base=new Uint8Array(6+1+2+raw.length+4);
  base.set(encoder.encode(MAGIC),0); base[6]=VERSION;
  base[7]=(raw.length>>8)&255;base[8]=raw.length&255;base.set(raw,9);
  const c=crc32(base.slice(0,9+raw.length));
  base[9+raw.length]=(c>>>24)&255;base[10+raw.length]=(c>>>16)&255;base[11+raw.length]=(c>>>8)&255;base[12+raw.length]=c&255;
  return base;
}
function crc32(data){
  let c=0xffffffff;
  for(const b of data){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}
  return (c^0xffffffff)>>>0;
}
function validPayload(bytes){
  if(bytes.length<13) return null;
  const magic=decoder.decode(bytes.slice(0,6)); if(magic!==MAGIC||bytes[6]!==VERSION)return null;
  const len=(bytes[7]<<8)|bytes[8]; if(len<1||13+len-1>bytes.length)return null;
  const end=9+len, c=((bytes[end]<<24)|(bytes[end+1]<<16)|(bytes[end+2]<<8)|bytes[end+3])>>>0;
  if(crc32(bytes.slice(0,end))!==c)return null;
  try{return JSON.parse(decoder.decode(bytes.slice(9,end)))}catch{return null}
}
function blockPositions(w,h){
  const nx=Math.floor(w/8), ny=Math.floor(h/8), arr=[];
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)arr.push([x*8,y*8]);
  return shuffle(arr,hashString(KEY));
}
function embedBits(ctx,w,h,bits){
  const data=ctx.getImageData(0,0,w,h), p=data.data, pos=blockPositions(w,h);
  const need=bits.length*3;
  if(pos.length<need) throw new Error(`La imagen es demasiado pequeña. Se necesitan al menos ${need} bloques 8×8.`);
  for(let i=0;i<bits.length;i++){
    // Repeat each bit 3 times for a little redundancy.
    for(let rep=0;rep<3;rep++){
      const [bx,by]=pos[i*3+rep], vals=new Float64Array(64);
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){const q=((by+y)*w+(bx+x))*4;vals[y*8+x]=luminance(p[q],p[q+1],p[q+2])-128}
      const d=dct8(vals), a=9, b=10, bit=bits[i];
      let aa=d[a], bb=d[b], diff=Math.abs(aa)-Math.abs(bb);
      const target=bit?STRENGTH:-STRENGTH;
      if((bit && diff<target)||(!bit && diff>-target)){
        const delta=(target-diff)/2;
        aa+=Math.sign(aa||1)*delta; bb-=Math.sign(bb||1)*delta; d[a]=aa;d[b]=bb;
      }
      const rec=idct8(d);
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){
        const q=((by+y)*w+(bx+x))*4, lum=rec[y*8+x]+128, old=luminance(p[q],p[q+1],p[q+2]), k=lum-old;
        p[q]=Math.max(0,Math.min(255,p[q]+k));p[q+1]=Math.max(0,Math.min(255,p[q+1]+k));p[q+2]=Math.max(0,Math.min(255,p[q+2]+k));
      }
    }
  }
  ctx.putImageData(data,0,0);
}
function extractBits(ctx,w,h,n){
  const data=ctx.getImageData(0,0,w,h), p=data.data, pos=blockPositions(w,h), bits=[];
  if(pos.length<n*3)return null;
  for(let i=0;i<n;i++){
    let score=0;
    for(let rep=0;rep<3;rep++){
      const [bx,by]=pos[i*3+rep], vals=new Float64Array(64);
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){const q=((by+y)*w+(bx+x))*4;vals[y*8+x]=luminance(p[q],p[q+1],p[q+2])-128}
      const d=dct8(vals); score += Math.abs(d[9])-Math.abs(d[10]);
    }
    bits.push(score>=0?1:0);
  }
  return bits;
}
function bitsForHeader(){
  return getBits(encoder.encode(MAGIC)).concat([0,0,0,0,0,0,0,1]); // magic + version byte
}
async function embed(){
  if(!createImage)return;
  try{
    $("#embedBtn").disabled=true; $("#createStatus").textContent="Codificando marca invisible…";
    await new Promise(r=>setTimeout(r,30));
    const payload=makePayload(), bits=getBits(payload);
    const c=document.createElement("canvas"), max=2200, scale=Math.min(1,max/createImage.naturalWidth,max/createImage.naturalHeight);
    c.width=Math.max(8,Math.floor(createImage.naturalWidth*scale));c.height=Math.max(8,Math.floor(createImage.naturalHeight*scale));
    const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(createImage,0,0,c.width,c.height);
    // Resize can make small images easier to process, but output is the resized image.
    embedBits(ctx,c.width,c.height,bits);
    lastOutput=c; $("#resultCanvas").replaceWith(c); c.id="resultCanvas";
    $("#resultId").textContent=$("#wmId").value; $("#result").classList.remove("hidden");
    $("#createStatus").textContent="Marca insertada correctamente.";
    $("#downloadBtn").onclick=()=>{
      c.toBlob(blob=>{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`XSPOT-${$("#wmId").value}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)},"image/png");
    };
  }catch(e){alert(e.message);$("#createStatus").textContent="No se pudo procesar la imagen."}
  finally{$("#embedBtn").disabled=false}
}
$("#embedBtn").onclick=embed;

async function detectFile(file){
  try{
    $("#detectResult").classList.add("hidden");$("#noMark").classList.add("hidden");$("#detectProgress").classList.remove("hidden");
    const img=await loadImage(file), c=document.createElement("canvas"), scale=Math.min(1,2200/img.naturalWidth,2200/img.naturalHeight);
    c.width=Math.max(8,Math.floor(img.naturalWidth*scale));c.height=Math.max(8,Math.floor(img.naturalHeight*scale));
    const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);
    await new Promise(r=>setTimeout(r,40));
    // Read enough bits for the fixed header and the max supported payload.
    const maxBytes=13+180, bits=extractBits(ctx,c.width,c.height,maxBytes*8);
    if(!bits)throw new Error("small");
    const bytes=bitsToBytes(bits), payload=validPayload(bytes);
    $("#detectProgress").classList.add("hidden");
    if(payload){
      $("#dBrand").textContent=payload.brand||"—";$("#dOwner").textContent=payload.owner||"—";$("#dId").textContent=payload.id||"—";
      $("#dNote").textContent=payload.note||"—";$("#dDate").textContent=payload.created?new Date(payload.created).toLocaleString("es-MX"):"—";
      $("#detectResult").classList.remove("hidden");
    }else $("#noMark").classList.remove("hidden");
  }catch(e){$("#detectProgress").classList.add("hidden");$("#noMark").classList.remove("hidden")}
}
setupDrop("#detectDrop","#detectFile",detectFile);
