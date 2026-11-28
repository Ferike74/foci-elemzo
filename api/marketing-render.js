const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
process.env.FONTCONFIG_PATH=path.join(__dirname,'../fonts');
const sharp=require('sharp');
const run=promisify(execFile);
const DB='https://gyozibfurwsbdutwmgrl.supabase.co';
const BUCKET='reklam-manager-media';
const normalize=s=>String(s||'').normalize('NFKC').toLocaleLowerCase('hu').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function wrap(s,width){const out=[];let line='';for(const word of String(s).split(/\s+/)){if((line+' '+word).trim().length>width&&line){out.push(line);line=word;}else line=(line+' '+word).trim();}if(line)out.push(line);return out;}
function sceneSvg(scene,index){
 const lines=wrap(scene.title,23);const sub=wrap(scene.body,35);
 if(lines.length>5||sub.length>4)throw Error('VIDEO_COPY_TOO_LONG');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#031327"/><stop offset=".6" stop-color="#071228"/><stop offset="1" stop-color="#230c33"/></linearGradient><linearGradient id="n"><stop stop-color="#00ecff"/><stop offset="1" stop-color="#ff37d1"/></linearGradient></defs><rect width="720" height="1280" fill="url(#bg)"/><path d="M-80 420 Q360 -50 800 420 M-70 460 Q360 20 790 460 M-80 500 Q360 90 800 500" stroke="#00edff" opacity=".35" stroke-width="7" fill="none"/><path d="M-100 410 Q360 750 820 410" stroke="#ff37d1" opacity=".4" stroke-width="10" fill="none"/><path d="M90 980 L630 980 L690 1140 L30 1140 Z M360 980 V1140 M255 1040 H465 V1110 H255Z" stroke="#00edff" stroke-width="3" opacity=".25" fill="none"/><rect x="25" y="25" width="670" height="1230" rx="26" stroke="url(#n)" stroke-width="3" fill="none"/><text x="48" y="100" fill="#00edff" font-family="DejaVu Sans" font-size="31" font-weight="bold">FOCIELEMZÉSEK.COM</text><text x="48" y="145" fill="#c7d7ed" font-family="DejaVu Sans" font-size="16">REKLÁM · MI-VEL LÉTREHOZOTT HANG ÉS KÉP</text><text x="48" y="555" fill="white" font-family="DejaVu Sans" font-weight="bold" font-size="43">${lines.map((l,i)=>`<tspan x="48" dy="${i?60:0}">${esc(l)}</tspan>`).join('')}</text><text x="50" y="${615+lines.length*60}" fill="#d7e6f8" font-family="DejaVu Sans" font-size="25">${sub.map((l,i)=>`<tspan x="50" dy="${i?38:0}">${esc(l)}</tspan>`).join('')}</text><text x="48" y="1200" fill="#c4d2e8" font-family="DejaVu Sans" font-size="16">Az előrejelzés becslés, nem garantált eredmény.</text><text x="655" y="1200" fill="#00edff" text-anchor="end" font-family="DejaVu Sans" font-size="18">${index+1}/3</text></svg>`;
}
async function renderVideo(plan,audio,work,ffmpeg){
 if(!plan||!Array.isArray(plan.scenes)||plan.scenes.length!==3||plan.duration_max!==30)throw Error('INVALID_VIDEO_PLAN');
 const audioPath=path.join(work,'voice.mp3');await fs.writeFile(audioPath,audio);
 const decoded=await run(ffmpeg,['-hide_banner','-i',audioPath,'-f','null','-'],{timeout:20000,maxBuffer:2e6});
 const durations=[...decoded.stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)].map(m=>+m[1]*3600+ +m[2]*60+ +m[3]);
 const voiceDuration=durations.at(-1);
 if(!Number.isFinite(voiceDuration)||voiceDuration<5||voiceDuration>29.2)throw Error('VOICE_DURATION_REQUIRES_REVIEW');
 const duration=Math.min(30,Math.max(24,Math.ceil(voiceDuration+.6)));
 const images=[];
 for(let i=0;i<3;i++){const file=path.join(work,'scene'+i+'.png');await sharp(Buffer.from(sceneSvg(plan.scenes[i],i))).png().toFile(file);images.push(file);}
 const input=[];for(const image of images)input.push('-loop','1','-t',String(duration/3),'-i',image);
 const sentences=String(plan.narration).match(/[^.!?]+[.!?]?/g)||[];
 const clock=t=>{const n=Math.round(t*100);return Math.floor(n/360000)+':'+String(Math.floor(n/6000)%60).padStart(2,'0')+':'+String(Math.floor(n/100)%60).padStart(2,'0')+'.'+String(n%100).padStart(2,'0');};
 const weights=sentences.map(s=>s.trim().split(/\s+/).length),total=weights.reduce((a,b)=>a+b,0);let elapsed=0;
 const events=sentences.map((s,i)=>{const start=elapsed;elapsed+=voiceDuration*weights[i]/total;return `Dialogue: 0,${clock(start)},${clock(elapsed)},Default,,0,0,0,,${wrap(s.trim().replace(/[{}\\]/g,''),44).join('\\N')}`;});
 const subtitles=path.join(work,'captions.ass');
 await fs.writeFile(subtitles,'[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,25,&H00FFFFFF,&H00FFFFFF,&H00130703,&H00130703,0,0,0,0,100,100,0,0,3,2,0,2,48,48,210,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'+events.join('\n'));
 const filters=images.map((_,i)=>`[${i}:v]scale=720:1280,setsar=1,zoompan=z='1.02+0.0003*on':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=720x1280:fps=25[v${i}]`).join(';')+`;[v0][v1][v2]concat=n=3:v=1:a=0,format=yuv420p,subtitles=filename='${subtitles}':fontsdir='${path.join(__dirname,'../fonts')}'[v]`;
 const output=path.join(work,'video.mp4');
 await run(ffmpeg,['-hide_banner','-loglevel','error',...input,'-i',audioPath,'-filter_complex',filters,'-map','[v]','-map','3:a:0','-af','apad','-t',String(duration),'-c:v','libx264','-threads','2','-preset','veryfast','-crf','27','-maxrate','650k','-bufsize','1300k','-c:a','aac','-b:a','96k','-ar','44100','-movflags','+faststart','-y',output],{timeout:85000,maxBuffer:2e6});
 const bytes=await fs.readFile(output);if(bytes.length>3500000)throw Error('VIDEO_SIZE_LIMIT');
 const verification=await run(ffmpeg,['-hide_banner','-i',output,'-f','null','-'],{timeout:20000,maxBuffer:2e6});
 if(!/Video: h264/.test(verification.stderr)||!/Audio: aac/.test(verification.stderr))throw Error('VIDEO_CODEC_CHECK_FAILED');
 return {bytes,duration,voice_duration:voiceDuration,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),video_codec:'h264',audio_codec:'aac',width:720,height:1280};
}
async function POST(request){
 let work,job,headers;
 const reply=(status,value)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
 try{
  const authorization=request.headers.get('authorization')||'';const apikey=request.headers.get('apikey')||'';
  if(!apikey||(authorization&&!authorization.startsWith('Bearer ')))return reply(401,{error:'authentication_required'});
  headers={...(authorization?{authorization}:{}),apikey,'content-type':'application/json'};
  const rpc=async(action,payload)=>{const r=await fetch(DB+'/rest/v1/rpc/reklam_pipeline_run',{method:'POST',headers,body:JSON.stringify({p_action:action,p_payload:payload}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('PIPELINE_AUTH_OR_STATE_REJECTED');return r.json();};
  const raw=await request.text();if(raw.length>2500000)return reply(413,{error:'audio_payload_too_large'});
  const p=JSON.parse(raw);
  if(!/^[a-f0-9-]{36}$/.test(p.job_id||'')||!/^[a-f0-9-]{36}$/.test(p.claim_token||'')||typeof p.audio_base64!=='string')return reply(400,{error:'invalid_job'});
  job={job_id:p.job_id,claim_token:p.claim_token};
  const bound=await rpc('media_claim',job);
  if(!normalize(bound.plan.narration)||normalize(bound.plan.narration)!==normalize(p.transcript))throw Error('NARRATION_TRANSCRIPT_MISMATCH');
  const audio=Buffer.from(p.audio_base64,'base64');if(audio.length<1000||audio.length>1800000)throw Error('INVALID_AUDIO_SIZE');
  work=await fs.mkdtemp(path.join(os.tmpdir(),'rhm-'));
  const rendered=await renderVideo(bound.plan,audio,work,require('ffmpeg-static'));
  const storagePath='pipeline/'+p.job_id+'.mp4';
  const upload=await fetch(DB+'/storage/v1/object/'+BUCKET+'/'+storagePath,{method:'POST',headers:{...headers,'content-type':'video/mp4','x-upsert':'false'},body:rendered.bytes,signal:AbortSignal.timeout(20000)});
  if(!upload.ok)throw Error('PRIVATE_MEDIA_UPLOAD_FAILED');
  const downloaded=await fetch(DB+'/storage/v1/object/authenticated/'+BUCKET+'/'+storagePath,{headers,signal:AbortSignal.timeout(20000)});
  if(!downloaded.ok)throw Error('PRIVATE_MEDIA_READBACK_FAILED');
  const readback=Buffer.from(await downloaded.arrayBuffer());if(crypto.createHash('sha256').update(readback).digest('hex')!==rendered.sha256)throw Error('MEDIA_READBACK_HASH_MISMATCH');
  const receipt={...rendered,bytes:undefined,size_bytes:rendered.bytes.length,storage_path:storagePath,storage_private:true,readback_verified:true,transcript_verified:true,platforms:bound.plan.platforms,publication_executed:false};
  const signing=await fetch(DB+'/storage/v1/object/sign/'+BUCKET+'/'+storagePath,{method:'POST',headers,body:JSON.stringify({expiresIn:3600}),signal:AbortSignal.timeout(10000)});
  if(!signing.ok)throw Error('PRIVATE_VIDEO_DOWNLOAD_LINK_FAILED');
  const signed=await signing.json();if(typeof signed.signedURL!=='string'||!signed.signedURL.startsWith('/object/sign/'+BUCKET+'/pipeline/'))throw Error('INVALID_PRIVATE_DOWNLOAD_URL');
  const downloadUrl=DB+'/storage/v1'+signed.signedURL+'&download='+encodeURIComponent('Focielemzesek-'+p.job_id+'.mp4');
  await rpc('media_complete',{...job,receipt});
  return reply(200,{status:'complete',job_id:p.job_id,receipt,download_url:downloadUrl,download_expires_at:new Date(Date.now()+3600000).toISOString()});
 }catch(error){
  console.error('marketing-render',String(error?.message||'render_failed').slice(0,160));
  if(job&&headers)try{await fetch(DB+'/rest/v1/rpc/reklam_pipeline_run',{method:'POST',headers,body:JSON.stringify({p_action:'media_failed',p_payload:{...job,error:String(error?.message||'render_failed').slice(0,160)}}),signal:AbortSignal.timeout(5000)});}catch{}
  return reply(422,{error:'render_requires_review',automatic_retry:false});
 }finally{if(work)await fs.rm(work,{recursive:true,force:true});}
}
module.exports={POST,renderVideo,sceneSvg,normalize};
