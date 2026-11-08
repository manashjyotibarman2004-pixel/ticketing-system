import {supabase,$,sha256Hex} from "./client.js";
const token=new URLSearchParams(location.search).get("token");
if(!token){$("result").textContent="Invalid QR: missing token."}else{const {data,error}=await supabase.rpc("verify_ticket",{p_token_hash:await sha256Hex(token)});if(error||!data){$("result").innerHTML='<h2 class="bad">INVALID</h2><p>No matching ticket found.</p>'}else{$("result").innerHTML=`<h2 class="${data.status==="valid"?"ok":"bad"}">${data.status.toUpperCase()}</h2><p>Serial: <b>${data.serial}</b></p><p>${esc(data.event_name)}</p><p>${esc(data.message)}</p>`}}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
