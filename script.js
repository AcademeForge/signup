'use strict';

/* ── PASSWORD TOGGLE ────────────────────────────────── */
function togglePw(){
  const inp = document.getElementById('createPassword');
  const eye = document.getElementById('pwEye');
  if(!inp || !eye) return;
  if(inp.type==='password'){ inp.type='text'; eye.textContent='🙈'; }
  else { inp.type='password'; eye.textContent='👁'; }
}

/* ── MESSAGE HELPERS ────────────────────────────────── */
const ICONS={ok:'✓',err:'✕',info:'ℹ'};

// Messages for the initial sign-up form (name/phone/email/password step)
function showMsg(type,text){
  const b=document.getElementById('authMsg');
  if(b) b.className='msg '+type;
  const msgIco=document.getElementById('msgIco');
  if(msgIco) msgIco.textContent=ICONS[type]||'';
  const msgTxt=document.getElementById('msgTxt');
  if(msgTxt) msgTxt.textContent=text||'';
}
function clearMsg(){
  const b=document.getElementById('authMsg');
  if(b) b.className='msg hidden';
  const msgTxt=document.getElementById('msgTxt');
  if(msgTxt) msgTxt.textContent='';
}

// Messages for the OTP verification step (separate form/element in the DOM)
function showOtpMsg(type,text){
  const b=document.getElementById('otpMsg');
  if(b) b.className='msg '+type;
  const otpMsgTxt=document.getElementById('otpMsgTxt');
  if(otpMsgTxt) otpMsgTxt.textContent=text||'';
}
function clearOtpMsg(){
  const b=document.getElementById('otpMsg');
  if(b) b.className='msg hidden';
  const otpMsgTxt=document.getElementById('otpMsgTxt');
  if(otpMsgTxt) otpMsgTxt.textContent='';
}

/* ── SUPABASE ───────────────────────────────────────── */
const STUDENT_URL="https://afooyyydhlwngzssgqih.supabase.co";
const STUDENT_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmb295eXlkaGx3bmd6c3NncWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NDQxMjgsImV4cCI6MjA5NDIyMDEyOH0.KG0XO0oP_2MpewHoIwTtbrKg5FkyOYRUtVzLH1MSJiE";
const cleanPhone = v => String(v||'').trim().replace(/\D/g,'');
let _sb=null;
function getSb(){
  if(_sb) return _sb;
  if(typeof window.supabase === 'undefined' || !window.supabase.createClient){
    throw new Error('Supabase client library failed to load. Check your network connection and that the @supabase/supabase-js <script> tag loads before script.js.');
  }
  _sb = window.supabase.createClient(STUDENT_URL, STUDENT_KEY);
  return _sb;
}
async function edgeCall(fn,payload){
  try{
    if(!navigator.onLine) return {ok:false,message:'No internet connection.'};
    const sb=getSb();
    const{data,error}=await sb.functions.invoke(fn,{body:payload||{}});
    if(error) return {ok:false,message:error.message||'Request failed.'};
    return data||{ok:false,message:'Empty response.'};
  }catch(e){
    return {ok:false,message:e.message||'Request failed.'};
  }
}

let _pendingCreate=null;

/* ── STEP 1: SEND OTP ───────────────────────────────── */
async function sendCreateOtp(){
  clearMsg();
  const name     = (document.getElementById('createName').value||'').trim();
  const mobile   = cleanPhone(document.getElementById('createPhone').value||'');
  const email    = (document.getElementById('createEmail').value||'').trim().toLowerCase();
  const password = (document.getElementById('createPassword').value||'').trim();
  const cbTerms  = document.getElementById('cbTerms').checked;
  const cbAge    = document.getElementById('cbAge').checked;

  if(!name||name.length<3)     { showMsg('err','Enter your full name (at least 3 characters).'); return; }
  if(!mobile||mobile.length<10){ showMsg('err','Enter a valid 10-digit phone number.'); return; }
  if(!email||!email.includes('@')){ showMsg('err','Enter a valid email address.'); return; }
  if(!password||password.length<6){ showMsg('err','Password must be at least 6 characters.'); return; }
  if(!cbTerms||!cbAge){ showMsg('err','Please agree to the Terms of Service, Privacy Policy, and confirm your age.'); return; }

  const btn=document.getElementById('btnSendOtp');
  btn.disabled=true; btn.textContent='Checking…';
  showMsg('info','Checking account availability…');

  const check=await edgeCall('student-check-existing-af',{mobile,email});
  if(!check||!check.ok){ showMsg('err',check?.message||'Could not verify availability.'); btn.disabled=false; btn.textContent='Sign Up'; return; }
  if(check.mobile_exists||check.student_id_exists){ showMsg('err','This phone number is already registered.'); btn.disabled=false; btn.textContent='Sign Up'; return; }
  if(check.email_exists){ showMsg('err','This email address is already registered.'); btn.disabled=false; btn.textContent='Sign Up'; return; }

  _pendingCreate={student_id:mobile,name,mobile,email,password,status:'active',email_verified:false};

  showMsg('info','Sending verification code to your email…');
  const otpRes=await edgeCall('student-send-otp-af',{email,mobile,purpose:'create'});
  if(!otpRes||!otpRes.ok){ showMsg('err','Could not send code: '+(otpRes?.message||'Server error.')); btn.disabled=false; btn.textContent='Sign Up'; return; }

  // Show OTP area, hide the sign-up form's submit button, lock fields
  document.getElementById('createOtpArea').classList.remove('hidden');
  document.getElementById('otpEmailDisplay').textContent=email;
  btn.classList.add('hidden');
  ['createName','createPhone','createEmail','createPassword'].forEach(id=>document.getElementById(id).disabled=true);
  document.getElementById('cbTerms').disabled=true;
  document.getElementById('cbAge').disabled=true;
  showMsg('ok','Verification code sent. Check your email and enter it below.');
  clearOtpMsg();
}

/* ── RESEND ─────────────────────────────────────────── */
async function resendOtp(){
  if(!_pendingCreate){ showOtpMsg('err','Please restart sign up — session expired.'); return; }
  clearOtpMsg();
  showOtpMsg('info','Resending code…');
  const res=await edgeCall('student-send-otp-af',{email:_pendingCreate.email,mobile:_pendingCreate.mobile,purpose:'create'});
  if(res?.ok) showOtpMsg('ok','A new code has been sent to your email.');
  else showOtpMsg('err',res?.message||'Could not resend code.');
}

/* ── STEP 2: VERIFY OTP & CREATE ────────────────────── */
async function verifyCreateOtp(){
  clearOtpMsg();
  const otp=(document.getElementById('createOtp').value||'').trim();
  if(!_pendingCreate){ showOtpMsg('err','Your session expired — please restart sign up.'); return; }
  if(!otp||otp.length<6){ showOtpMsg('err','Enter the 6-digit verification code.'); return; }

  const btn=document.getElementById('btnVerifyOtp');
  btn.disabled=true; btn.textContent='Creating account…';
  showOtpMsg('info','Verifying and creating your AcademeForge Account…');

  const res=await edgeCall('student-create-af',Object.assign({},_pendingCreate,{otp,purpose:'create'}));
  if(!res||!res.ok){
    showOtpMsg('err',res?.message||'Incorrect code or account creation failed.');
    btn.disabled=false; btn.textContent='Verify & Create Account';
    return;
  }

  // Success
  document.getElementById('boxCreate').classList.add('hidden');
  document.getElementById('createOtpArea').classList.add('hidden');
  document.getElementById('boxSuccess').classList.remove('hidden');
  const eco = document.getElementById('ecoMobileSection');
  if (eco) eco.classList.add('hidden');
  _pendingCreate=null;
}
