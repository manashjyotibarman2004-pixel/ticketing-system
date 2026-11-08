import {supabase,$,esc,sha256Hex,randomToken} from "./client.js";
import {EVENT_NAME,TICKET_PREFIX,TICKET_PRICE,PUBLIC_BASE_URL} from "./app-config.js";
import {jsPDF} from "https://esm.sh/jspdf@2.5.2";
import QRCode from "https://esm.sh/qrcode@1.5.4";
let inventory=[],selected=new Set(),lastIssued=[];
function msg(id,t,cls=""){ $(id).textContent=t;$(id).className=cls }
async function isAdmin(){const {data:{user}}=await supabase.auth.getUser();if(!user)return false;const {data,error}=await supabase.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();return !!data&&!error}
async function load(){if(!await isAdmin()){await supabase.auth.signOut();throw new Error("This account is not authorised as the administrator.")}const {data,error}=await supabase.from("ticket_inventory").select("serial,status").order("serial");if(error)throw error;inventory=data;render()}
function render(){const counts={available:0,issued:0,redeemed:0,cancelled:0};inventory.forEach(x=>counts[x.status]++);$("stats").innerHTML=Object.entries(counts).map(([k,v])=>`<div class="stat">${k}<b>${v}</b></div>`).join("");const st=$("statusFilter").value,term=$("searchSerial").value.trim();const rows=inventory.filter(x=>(st==="all"||x.status===st)&&(!term||String(x.serial).includes(term)));$("grid").innerHTML=rows.map(x=>`<button class="tile ${x.status} ${selected.has(x.serial)?"selected":""}" data-n="${x.serial}" ${x.status!=="available"?"disabled":""}>${x.serial}</button>`).join("");$("grid").querySelectorAll("[data-n]").forEach(b=>b.onclick=()=>{const n=Number(b.dataset.n);selected.has(n)?selected.delete(n):selected.add(n);render()});$("selectedCount").textContent=`${selected.size} selected`}
$("statusFilter").onchange=render;$("searchSerial").oninput=render;$("refresh").onclick=()=>load().catch(e=>alert(e.message));
$("loginForm").onsubmit=async e=>{e.preventDefault();const {error}=await supabase.auth.signInWithPassword({email:$("loginEmail").value,password:$("loginPassword").value});if(error)msg("loginMsg",error.message,"bad");else start()};
async function start(){try{$("loginCard").hidden=true;$("adminArea").hidden=false;await load();await loadRegister()}catch(e){msg("loginMsg",e.message,"bad");$("loginCard").hidden=false;$("adminArea").hidden=true}}
supabase.auth.onAuthStateChange((_event,session)=>{if(session)start()});
$("logout").onclick=()=>supabase.auth.signOut();
async function makePdf(ticket,buyer={}){
  // ZEST 6.0 digital ticket: detachable buyer stub + event ticket.
  const doc=new jsPDF({unit:"mm",format:[160,70],orientation:"landscape"});
  const W=160,H=70, navy=[18,27,43], ink=[24,24,24], gold=[246,198,35], teal=[53,220,218];
  doc.setFillColor(255,255,255);doc.rect(0,0,W,H,"F");
  // Outer frame and subtle patterned ticket border.
  doc.setDrawColor(...ink);doc.setLineWidth(.55);doc.roundedRect(2.5,2.5,W-5,H-5,3,3,"S");
  doc.setLineWidth(.18);for(let x=4;x<W-4;x+=2.2){doc.line(x,3.2,Math.min(x+1.2,W-3.2),3.2);doc.line(x,H-3.2,Math.min(x+1.2,W-3.2),H-3.2)}
  // Perforation between the buyer stub and the main ticket.
  doc.setDrawColor(100);doc.setLineDashPattern([1.2,1.2],0);doc.setLineWidth(.35);doc.line(43,5,43,H-5);doc.setLineDashPattern([],0);
  // Buyer stub.
  doc.setTextColor(...ink);doc.setFont("helvetica","bold");doc.setFontSize(8.5);doc.text("BUYER STUB",7,11);
  doc.setFont("helvetica","normal");doc.setFontSize(7.5);
  doc.text("Name:",7,21);doc.setDrawColor(150);doc.line(7,23,37,23);if(buyer.name)doc.text(String(buyer.name).slice(0,25),7,22.5);
  doc.text("Address:",7,32);doc.line(7,34,37,34);
  doc.text("Phone:",7,43);doc.line(7,45,37,45);if(buyer.phone)doc.text(String(buyer.phone).slice(0,22),7,44.5);
  doc.setFont("helvetica","bold");doc.setFontSize(7);doc.text("SL No.",7,57);
  doc.setFontSize(9);doc.text(String(ticket.serial).replace(/^.*?(\d+)$/,"$1"),24,57);
  // Main event ticket.
  doc.setTextColor(...navy);doc.setFont("helvetica","bold");doc.setFontSize(9);
  doc.text("LAKHIMPUR COLLEGE OF VETERINARY SCIENCE",101.5,11,{align:"center"});
  // Simple college-seal treatment; replaceable with official logo artwork later.
  doc.setDrawColor(35,75,130);doc.setLineWidth(.45);doc.circle(148,11,5.2,"S");doc.circle(148,11,3.8,"S");
  doc.setTextColor(35,75,130);doc.setFontSize(5.2);doc.text("LCVSc",148,12.8,{align:"center"});
  doc.setTextColor(...ink);doc.setFont("helvetica","bold");doc.setFontSize(7.5);doc.text(`Ticket price - Rs ${TICKET_PRICE}/-`,49,20);
  // Event wordmark.
  doc.setTextColor(0,0,0);doc.setFont("helvetica","bold");doc.setFontSize(23);doc.text("ZEST 6.0",96,36,{align:"center"});
  doc.setTextColor(...teal);doc.setFontSize(21);doc.text("ZEST 6.0",96,35.5,{align:"center"});
  doc.setFillColor(...gold);doc.setDrawColor(220,170,15);doc.roundedRect(77,39,38,7,1.5,1.5,"FD");
  doc.setTextColor(20,20,20);doc.setFontSize(8);doc.text("30+ PRIZES",96,44,{align:"center"});
  // Serial and verification QR.
  doc.setFont("helvetica","bold");doc.setFontSize(7.5);doc.text("SL No.",49,59);
  doc.setFontSize(11);doc.text(String(ticket.serial).replace(/^.*?(\d+)$/,"$1"),63,59);
  const verifyUrl=`${PUBLIC_BASE_URL}verify.html?token=${ticket.token}`;
  const qr=await QRCode.toDataURL(verifyUrl,{width:260,margin:1,errorCorrectionLevel:"H"});
  doc.addImage(qr,"PNG",128,25,23,23);
  doc.setFont("helvetica","normal");doc.setFontSize(5.5);doc.text("SCAN TO VERIFY",139.5,50,{align:"center"});
  doc.setFont("helvetica","bold");doc.setFontSize(7);doc.text("Date- 10/11/26",148,61,{align:"right"});
  doc.setFont("helvetica","normal");doc.setFontSize(5.2);doc.setTextColor(90);doc.text("Keep this ticket safe • QR scan verifies authenticity",96,66,{align:"center"});
  return doc.output("blob");
}
async function shareOrDownload(file,blob){const f=new File([blob],file,{type:"application/pdf"});if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:file,text:"Ticket PDF"});return "Shared"}catch(e){if(e.name==="AbortError")return "Share cancelled"}}const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);return "Downloaded"}
$("issueForm").onsubmit=async e=>{e.preventDefault();if(!selected.size)return msg("issueMsg","Select available serial numbers first.","bad");const serials=[...selected].sort((a,b)=>a-b),tokens=serials.map(()=>randomToken()),hashes=await Promise.all(tokens.map(sha256Hex));$("issueBtn").disabled=true;try{const {data,error}=await supabase.rpc("issue_tickets",{p_name:$("buyerName").value.trim(),p_contact:$("buyerEmail").value.trim(),p_phone:$("buyerPhone").value.trim(),p_serials:serials,p_token_hashes:hashes,p_payment_method:$("paymentMethod").value,p_amount:Number($("amount").value||0),p_payment_note:$("paymentNote").value.trim()});if(error)throw error;lastIssued=serials.map((n,i)=>({serial:TICKET_PREFIX+n,token:tokens[i]}));$("issuedFiles").innerHTML="<h3>Generated individual tickets</h3>";for(const t of lastIssued){const blob=await makePdf(t,{name:$("buyerName").value.trim(),phone:$("buyerPhone").value.trim()}),filename=`${t.serial}.pdf`;const url=URL.createObjectURL(blob);const row=document.createElement("div");row.className="file-row";row.innerHTML=`<b>${esc(filename)}</b><span><a href="${url}" download="${esc(filename)}">Download</a> <button type="button">Share</button></span>`;row.querySelector("button").onclick=async()=>{const status=await shareOrDownload(filename,blob);msg("issueMsg",status+" "+filename,"ok")};$("issuedFiles").append(row)}msg("issueMsg",`Issued ${serials.length} ticket(s). PDFs are ready. Download each or use Share to send through WhatsApp.`,"ok");selected.clear();e.target.reset();await load();await loadRegister()}catch(err){msg("issueMsg",err.message+" — refresh the grid and check the selected serials.","bad");await load().catch(()=>{})}finally{$("issueBtn").disabled=false}};
async function loadRegister(){const {data,error}=await supabase.from("tickets").select("serial,buyer_name,buyer_contact,payment_method,payment_note,status,issued_at").order("serial");if(error)throw error;const rows=data||[];$("register").innerHTML=`<p>${rows.length} tickets issued</p><div style="overflow:auto"><table><tr><th>Serial</th><th>Buyer</th><th>Payment</th><th>Status</th></tr>${rows.map(x=>`<tr><td>${x.serial}</td><td>${esc(x.buyer_name)}</td><td>${esc(x.payment_method)}</td><td>${esc(x.status)}</td></tr>`).join("")}</table></div>`;$("export").onclick=()=>{const cols=["serial","buyer_name","buyer_contact","payment_method","payment_note","status","issued_at"];const csv=[cols.join(","),...rows.map(r=>cols.map(k=>JSON.stringify(r[k]??"")).join(","))].join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="ticket-register.csv";a.click()}}
$("redeemBtn").onclick=async()=>{const token=$("redeemToken").value.trim();if(!token)return;const {error}=await supabase.rpc("redeem_ticket",{p_token_hash:await sha256Hex(token)});msg("redeemMsg",error?error.message:"Ticket redeemed successfully.",error?"bad":"ok");if(!error){$("redeemToken").value="";await load();await loadRegister()}};
supabase.auth.getSession().then(({data})=>{if(data.session)start()});
