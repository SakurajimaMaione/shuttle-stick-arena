/* World units: metres. x across court, y along court, z above ground. */
'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const canvas=$('#court'), ctx=canvas.getContext('2d');
let virtualLandscape=false;
const SHOTS={smash:{name:'杀球',time:.72,arc:.65},drop:{name:'短球',time:1.55,arc:1.8},clear:{name:'高远球',time:2.35,arc:4.4},drive:{name:'平高球',time:1.15,arc:1.5}};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const matchWon=(a,b)=>a===30||(a>=21&&a-b>=2);
let view='top', count=1, state='menu', previousState='serve', players=[], score=[0,0], games=[0,0], history=[], servingTeam=0, serverIndex=0, serviceCycle=0, turn=0, ball=null, rally=0, aim=[{x:1.3,y:2.3},{x:4.8,y:11.1}], selected=['clear','clear'], keys=new Set(), pointerMoves=new Set(), clock=0, last=0, toastUntil=0, dimensions={}, effects=[], qualityMessage='', audioOn=true, audioCtx, aiTimer=0, receiveGrace=0, endChanged=false;
const SMASH_DOUBLE_TAP_MS=280;
let lastSmash=[null,null],judgement=null;
const GRADE_TONES={PERFECT:[880,1175,1480],GOOD:[660],BAD:[220,140]};
const playerName=t=>count===1?(t===0?'你':'电脑'):(t===0?'P1 队':'P2 队');
function notify(text,seconds=2){$('#toast').textContent=text;$('#toast').classList.add('visible');toastUntil=clock+seconds;}
function beep(freq=500,duration=.06){if(!audioOn)return;try{audioCtx??=new(window.AudioContext||window.webkitAudioContext)();audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);o.frequency.value=freq;g.gain.setValueAtTime(.07,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.start();o.stop(audioCtx.currentTime+duration);}catch{}}
function bounds(){return count===2?{left:0,right:6.1}:{left:.46,right:5.64};}
function makePlayer(team,partner=false){return {team,partner,ai:partner||(team===1&&count===1),x:partner?4.7:2.1,y:team===0?10.4:3,z:0,vz:0,moveUsed:false,target:null,swing:0,walk:0,crouch:false};}
function resetPositions(){players=[makePlayer(0),makePlayer(1)];if(count===2)players.push(makePlayer(0,true),makePlayer(1,true));players.forEach(p=>{p.x=p.partner?4.6:1.5;p.y=p.team===0?(p.partner?11.2:9.4):(p.partner?2.2:4);});const server=players.find(p=>p.team===servingTeam&&Number(p.partner)===serverIndex)||players.find(p=>p.team===servingTeam);serverIndex=Number(server.partner);const sx=score[servingTeam]%2===0?(servingTeam===0?4.4:1.7):(servingTeam===0?1.7:4.4);server.x=sx;server.y=servingTeam===0?9:4.4;players.filter(p=>p.team===servingTeam&&p!==server).forEach(p=>{p.x=6.1-sx;p.y=servingTeam===0?11.4:2;});const receiver=players.find(p=>p.team!==servingTeam&&!p.partner);receiver.x=6.1-sx;receiver.y=servingTeam===0?3.8:9.6;players.filter(p=>p.team!==servingTeam&&p!==receiver).forEach(p=>{p.x=sx;p.y=servingTeam===0?2:11.4;});}
function scoreboard(){for(let t=0;t<2;t++){$('#score'+t).textContent=score[t];$('#name'+t).textContent=playerName(t)+(servingTeam===t?' · 发球':'');$('#games'+t).textContent='●'.repeat(games[t])+'○'.repeat(2-games[t]);}$('#setLabel').textContent=`第 ${history.length+1} 局 · 21 分`;$('#rallyTag').textContent=state==='serve'?'准备发球 · 右双左单':`第 ${rally} 拍`;$('#serveBtn').hidden=state!=='serve';}
function start(){lastSmash=[null,null];judgement=null;$('#judgement').hidden=true;primeAudio();score=[0,0];games=[0,0];history=[];servingTeam=0;serverIndex=0;serviceCycle=0;ball=null;effects=[];state='serve';rally=0;endChanged=false;resetPositions();$('#menu').hidden=true;$('#pauseOverlay').hidden=true;['scoreboard','rallyTag','bottomControls','matchActions'].forEach(id=>$('#'+id).hidden=false);$('#footerHint').textContent=count===2?'P1：WASD + J K L ;　 P2：TFGH + 1 2 3 4':'移动：WASD / 方向键　击球：J K L ;';$('#moveTitle').textContent=view==='top'?'一拍一步':'自由跑位';$('#moveHint').textContent=view==='top'?'点击己方半场移动':'左右跑位 · 上键跳起';$('#aimText').textContent=view==='top'?'点击对方半场瞄准':'靠近球再出手';aiTimer=clock+1;scoreboard();resize();notify(view==='top'?'先选球路，再按空格发球。点击对手半场瞄准。':'先选球路，再按空格发球。跑到球下方，抓准击球时机。',4);}
function prepareServe(){lastSmash=[null,null];ball=null;state='serve';rally=0;receiveGrace=0;resetPositions();aiTimer=clock+1.1;scoreboard();}
function doServe(){if(state!=='serve')return;const p=players.find(p=>p.team===servingTeam&&Number(p.partner)===serverIndex);const receiving=1-servingTeam;let target={x:6.1-p.x,y:receiving===0?10.8:2.6};const near=count===2?.76:0;target.y=clamp(target.y,near+.2,13.4-near-.2);state='rally';rally=1;p.moveUsed=false;launch(p,target,selected[servingTeam],.95,true);notify(`${playerName(servingTeam)}发球`,1);scoreboard();beep(420);}
function launch(p,target,type,quality,service=false,jumpSmash=false){
 const spec=SHOTS[type],from={x:p.x,y:p.y,z:service?.95:Math.max(1.2,(ball?.z||1.8))};
 let duration=spec.time*(1.12-quality*.22),arc=spec.arc;
 if(service){duration=1.65;arc=2.3;}
 else if(type==='smash'){
  if(from.z<2.1){arc=1.1;duration=.97;}else{arc=.28;duration=.64;}
  if(jumpSmash){duration*=.9;from.z=Math.max(2.5,from.z);}
 }
 if(!service){duration*=1+(1-quality)*.35;arc+=(1-quality)*1.1;const error=1-quality;target.x+=(Math.random()-.5)*error*1.6;target.y+=(Math.random()-.5)*error*2;}
 ball={...from,from,to:target,t:0,duration,arc,by:p.team,byPartner:p.partner,type,quality,service,jumpSmash,fire:!service&&(jumpSmash||quality>.85),trail:[],arrived:false,netChecked:false};
 turn=1-p.team;receiveGrace=0;
 players.filter(a=>a.team===p.team).forEach(a=>{a.moveUsed=false;a.target=null;});
 p.swing=.3;aiTimer=clock+.16+Math.random()*.18;
 qualityMessage=quality>.85?'完美击球':'成功回球';
 if(!service)rally++;
 scoreboard();
 return ball;
}
function hitWindow(p){if(!ball||ball.by===p.team||state!=='rally')return 0;const lateral=view==='side'?0:Math.abs(ball.x-p.x);const longitudinal=Math.abs(ball.y-p.y);const head=1.8+p.z-(p.crouch?.5:0);if(lateral>1.6||longitudinal>(view==='side'?1.35:2.3)||ball.z>head+1.4||ball.z<.18)return 0;const spatial=Math.hypot(lateral/2.5,longitudinal/3.3),heightError=Math.abs(ball.z-head)/2.8;return clamp(1-spatial*.45-heightError*.55,.15,1);}
function humanHit(team,type,{jump=false}={}){
 selected[team]=type;updateShotButtons();
 if(state==='serve'){if(servingTeam===team)notify(`已选${SHOTS[type].name} · 按空格发球`,1);return null;}
 if(state!=='rally')return null;
 const p=players.find(a=>a.team===team&&!a.partner);
 if(!p||!ball||ball.by===team)return null;
 if(jump){p.z=Math.max(.5,p.z);p.vz=5.2;}
 const quality=hitWindow(p);p.swing=.26;
 if(!quality){showJudgement('BAD',team,'未击中 · 靠近来球再出手');return null;}
 const target={...aim[team]},b=bounds();
 target.x=clamp(target.x,b.left+.16,b.right-.16);
 target.y=type==='drop'?(team===0?5.5:7.9):type==='clear'?(team===0?1:12.4):type==='smash'?(team===0?3.7:9.7):(team===0?2:11.4);
 if(view==='side')target.x=3.05;
 const hitBall=launch(p,target,type,quality,false,jump);
 showJudgement(quality>.85?'PERFECT':'GOOD',team,jump?'跳杀 · 火焰加速':SHOTS[type].name);
 return hitBall;
}
// First tap hits immediately. A quick second tap upgrades that exact stroke;
// no delay, charge timer, second shuttle, or extra rally count is introduced.
function shotInput(team,type,stamp=performance.now()){
 primeAudio();
 if(type!=='smash'){lastSmash[team]=null;return humanHit(team,type);}
 const pending=lastSmash[team];
 const doubleTap=pending&&stamp>=pending.at&&stamp-pending.at<=SMASH_DOUBLE_TAP_MS&&state==='rally';
 if(doubleTap){
  lastSmash[team]=null;
  if(pending.hitBall&&ball===pending.hitBall&&ball.by===team&&!ball.service&&!ball.jumpSmash){
   const progress=ball.t/ball.duration;
   ball.duration*=.9;ball.t=progress*ball.duration;ball.jumpSmash=true;ball.fire=true;
   const p=players.find(a=>a.team===team&&!a.partner);
   p.z=Math.max(.5,p.z);p.vz=5.2;p.swing=.32;
   showJudgement(ball.quality>.85?'PERFECT':'GOOD',team,'跳杀 · 火焰加速');
   return ball;
  }
  if(ball===pending.incoming&&ball?.by!==team)return humanHit(team,'smash',{jump:true});
  return null;
 }
 const incoming=ball,hitBall=humanHit(team,type);
 lastSmash[team]=state==='rally'?{at:stamp,incoming,hitBall}:null;
 return hitBall;
}
function primeAudio(){
 if(!audioOn)return null;
 try{if(!audioCtx){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return null;audioCtx=new Audio();}audioCtx.resume();return audioCtx;}catch{return null;}
}
function playGradeSound(grade){
 const audio=primeAudio();if(!audio)return;
 const tones=GRADE_TONES[grade];
 tones.forEach((frequency,index)=>{
  const oscillator=audio.createOscillator(),gain=audio.createGain();
  const time=audio.currentTime+index*(grade==='BAD'?.10:.065),duration=grade==='GOOD'?.16:.11;
  oscillator.type=grade==='BAD'?'triangle':grade==='PERFECT'?'sine':'triangle';
  oscillator.frequency.setValueAtTime(frequency,time);
  gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(.10,time+.008);gain.gain.exponentialRampToValueAtTime(.001,time+duration);
  oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(time);oscillator.stop(time+duration+.02);
 });
}
function showJudgement(grade,team,detail=''){
 judgement={grade,team,until:clock+1.05};
 const panel=$('#judgement');panel.hidden=false;panel.className='judgement '+grade.toLowerCase();
 $('#judgeWord').textContent=grade;
 $('#judgeDetail').textContent=(count===2?`P${team+1} · `:'')+detail;
 void panel.offsetWidth;panel.classList.add('show');
 playGradeSound(grade);
}
function updateShotButtons(){$$('[data-shot]').forEach(b=>b.classList.toggle('active',b.dataset.shot===selected[0]));}
function award(team,reason){if(state!=='rally')return;lastSmash=[null,null];if(ball?.by===team&&(count===2||1-team===0))showJudgement('BAD',1-team,'未接到球');const oldServer=servingTeam;score[team]++;servingTeam=team;if(count===2){if(oldServer!==team)serviceCycle=(serviceCycle+1)%4;serverIndex=Math.floor(serviceCycle/2);}else serverIndex=0;state='point';ball=null;notify(`${playerName(team)}得分 · ${reason}`,2.2);if(!judgement)beep(team===0?660:280,.18);scoreboard();if(matchWon(score[team],score[1-team])){games[team]++;history.push([...score]);scoreboard();if(games[team]===2){state='matchover';showResult('比赛结束',`${playerName(team)}赢得比赛`,`${history.map(s=>s.join(' : ')).join('　 /　 ')}　·　局数 ${games[0]} : ${games[1]}`,'再来一场');}else{state='setover';showResult('本局结束',`${playerName(team)}拿下第 ${history.length} 局`,`${score[0]} : ${score[1]}　·　当前局数 ${games[0]} : ${games[1]}`,'开始下一局');}}else{aiTimer=clock+2.2;} }
function showResult(eyebrow,title,text,button){$('#resultEyebrow').textContent=eyebrow;$('#resultTitle').textContent=title;$('#resultText').textContent=text;$('#resumeBtn').textContent=button;$('#pauseOverlay').hidden=false;}
function pause(){if(!['rally','serve','point'].includes(state))return;lastSmash=[null,null];previousState=state;state='paused';keys.clear();pointerMoves.clear();showResult('TAKE A BREATH','比赛已暂停','调整一下，下一拍继续。','继续比赛');}
function resume(){const old=state;$('#pauseOverlay').hidden=true;if(old==='matchover'){start();return;}if(old==='setover'){score=[0,0];endChanged=!endChanged;prepareServe();notify('新的一局开始 · 场地已交换',2);return;}state=previousState;last=performance.now();}
function menu(){lastSmash=[null,null];$("#toast").classList.remove("visible");judgement=null;$('#judgement').hidden=true;state='menu';ball=null;keys.clear();pointerMoves.clear();$('#menu').hidden=false;$('#pauseOverlay').hidden=true;['scoreboard','rallyTag','bottomControls','matchActions'].forEach(id=>$('#'+id).hidden=true);$('#footerHint').textContent='基于你的《羽毛球》规则设计';resize();}
function move(p,dx,dy,dt,once=false){if(!p||!['serve','rally'].includes(state))return;const b=bounds(), minY=p.team===0?6.9:.15,maxY=p.team===0?13.25:6.5;if(view==='top'){if(state==='serve'||p.moveUsed)return;const d=Math.hypot(dx,dy)||1;p.target={x:clamp(p.x+dx/d*2.25,b.left,b.right),y:clamp(p.y+dy/d*2.25,minY,maxY)};p.moveUsed=true;return;}p.y=clamp(p.y-dx*(endChanged?-1:1)*4.3*dt,minY,maxY);if(dy<0&&p.z===0){p.vz=4.4;}p.crouch=dy>0;p.walk+=Math.abs(dx)*dt*12;}
function update(dt){if(['paused','menu','matchover','setover'].includes(state))return;clock+=dt;if(judgement&&clock>judgement.until){judgement=null;$('#judgement').hidden=true;}if(clock>toastUntil)$('#toast').classList.remove('visible');effects.forEach(e=>e.life-=dt);effects=effects.filter(e=>e.life>0);
 if(state==='point'){if(clock>=aiTimer)prepareServe();return;}
 const p1=players.find(p=>p.team===0&&!p.partner),p2=players.find(p=>p.team===1&&!p.partner);
 if(view==='side'){const dx=Number(keys.has('d')||keys.has('arrowright')||pointerMoves.has('right'))-Number(keys.has('a')||keys.has('arrowleft')||pointerMoves.has('left'));const dy=Number(keys.has('s')||keys.has('arrowdown')||pointerMoves.has('down'))-Number(keys.has('w')||keys.has('arrowup')||pointerMoves.has('up'));move(p1,dx,dy,dt);if(count===2)move(p2,Number(keys.has('h'))-Number(keys.has('f')),Number(keys.has('g'))-Number(keys.has('t')),dt);}
 for(const p of players){p.swing=Math.max(0,p.swing-dt);p.z=Math.max(0,p.z+p.vz*dt);p.vz-=10*dt;if(p.z===0)p.vz=0;if(p.target){let d=dist(p,p.target),step=8*dt;if(d<=step){Object.assign(p,p.target);p.target=null;}else{p.x+=(p.target.x-p.x)/d*step;p.y+=(p.target.y-p.y)/d*step;p.walk+=dt*13;}}}
 if(state==='serve'){if(players.find(p=>p.team===servingTeam&&Number(p.partner)===serverIndex)?.ai&&clock>aiTimer)doServe();updateTiming();return;}
 if(!ball)return;const b=ball;b.t+=dt;const u=clamp(b.t/b.duration,0,1);b.x=b.from.x+(b.to.x-b.from.x)*u;b.y=b.from.y+(b.to.y-b.from.y)*u;b.z=b.from.z*(1-u)+4*b.arc*u*(1-u);b.trail.unshift({x:b.x,y:b.y,z:b.z});if(b.trail.length>16)b.trail.pop();
 if(!b.netChecked&&((b.by===0&&b.y<=6.7)||(b.by===1&&b.y>=6.7))){b.netChecked=true;if(b.z<1.52){award(1-b.by,'回球未过网');return;}}
 const receivers=players.filter(p=>p.team===turn);let closest=receivers.reduce((a,p)=>dist(p,b.to)<dist(a,b.to)?p:a,receivers[0]);
 for(const p of receivers){if(!p.ai)continue;const wants=closest===p||(count===1&&p.team===1);if(wants&&clock>aiTimer){const target={x:view==='side'?p.x:b.to.x,y:b.to.y};const d=dist(p,target),step=(p.partner?3.9:3.6)*dt;if(d>0){if(view==='side'){p.y+=clamp(target.y-p.y,-step,step);}else{p.x+=(target.x-p.x)/d*Math.min(step,d);p.y+=(target.y-p.y)/d*Math.min(step,d);}}p.walk+=dt*9;const h=hitWindow(p);if(h>.58&&u>.55&&b.z<2.7&&Math.random()<dt*20){let type=['clear','drop','drive','smash'][Math.floor(Math.random()*4)];if(b.z<1.8&&type==='smash')type='clear';const targetX=Math.random()<.5?.9:5.2;const targetY=type==='drop'?(p.team===0?5.6:7.8):type==='clear'?(p.team===0?.9:12.5):p.team===0?2.4:11;launch(p,{x:targetX,y:targetY},type,clamp(h-.08+Math.random()*.12,.5,.97));return;}}}
 if(u>=1){const edge=bounds();const out=b.x<edge.left||b.x>edge.right||b.y<0||b.y>13.4;const wrongHalf=b.by===0?b.y>6.7:b.y<6.7;if(out||wrongHalf){award(1-b.by,'出界');return;}if(b.service){const doublesOut=count===2&&(b.y<.76||b.y>12.64);const tooShort=b.by===0?b.y>4.72:b.y<8.68;const sameX=(b.from.x<3.05)===(b.to.x<3.05);if(doublesOut||tooShort||sameX){award(1-b.by,'发球违例');return;}}award(b.by,'羽毛球落地');return;}
 updateTiming();}
function updateTiming(){const p=players.find(p=>p.team===0&&!p.partner);const q=hitWindow(p);$('#timingText').textContent=state==='serve'?'选择球路，按空格发球':ball?.by===0?'对方接球中 · 抓紧回位':q>.85?'完美时机 · 现在击球':q>0?'可以回球 · 继续找准时机':'追向落点 · 等待球进入范围';$('#moveTitle').textContent=view==='top'?(p?.moveUsed?'本拍已移动':'本拍可移动'):'自由跑位';}
function resize(){
 const box=canvas.getBoundingClientRect(),r={width:canvas.clientWidth||(virtualLandscape?box.height:box.width),height:canvas.clientHeight||(virtualLandscape?box.width:box.height)},dpr=Math.min(devicePixelRatio||1,2);
 canvas.width=r.width*dpr;canvas.height=r.height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
 const compact=r.width>r.height&&r.height<=540;
 const mobile=r.width<650;
 const top=compact?76:mobile?230:155,bottom=compact?16:mobile?170:165;
 const h=Math.max(compact?100:200,r.height-top-bottom);
 const w=compact?Math.max(100,Math.min(r.width-412,h*.98)):Math.min(r.width*(mobile?.9:.66),h*.95);
 const sideBase=compact?Math.max(90,r.height-132):top+h*.88;
 const sideScale=compact?Math.max(10,Math.min(34,(sideBase-65)/5.5)):Math.min(r.width*.78/13.4,45);
 dimensions={w:r.width,h:r.height,top,bottom,cx:r.width/2,cy:top+h/2,cw:w,ch:h,compact,sideBase,sideScale};
}
function project(x,y,z=0){const d=dimensions;if(view==='top'||state==='menu'){const yy=endChanged?13.4-y:y;const xx=endChanged?6.1-x:x;return {x:d.cx+(xx-3.05)*d.cw/6.1,y:d.top+yy*d.ch/13.4-z*10};}const available=d.w*.78,s=available/13.4;const yy=endChanged?13.4-y:y;return {x:d.cx+(6.7-yy)*s,y:d.sideBase-z*d.sideScale+(x-3.05)*3};}
function line(points,color='#d6e6d3a0',width=1.5){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function worldLine(x,y,xx,yy,color,width){line([project(x,y),project(xx,yy)],color,width);}
function drawCourt(){const d=dimensions;ctx.fillStyle='#102324';ctx.fillRect(0,0,d.w,d.h);const glow=ctx.createRadialGradient(d.cx,d.cy,0,d.cx,d.cy,d.w*.65);glow.addColorStop(0,'#28413b');glow.addColorStop(1,'#102324');ctx.fillStyle=glow;ctx.fillRect(0,0,d.w,d.h);
 ctx.strokeStyle='#bcd4aa06';ctx.lineWidth=1;for(let i=0;i<d.w;i+=46){line([{x:i,y:0},{x:i,y:d.h}],'#d7f57304',1);}const corners=[[0,0],[6.1,0],[6.1,13.4],[0,13.4]].map(([x,y])=>project(x,y));ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle='#356858';ctx.shadowColor='#0005';ctx.shadowBlur=35;ctx.fill();ctx.shadowBlur=0;
 if(view==='top'||state==='menu'){const middle=project(0,6.7);ctx.fillStyle='#2d5b4e';ctx.fillRect(corners[0].x,middle.y,d.cw,Math.abs(corners[2].y-middle.y));for(let i=0;i<14;i++)worldLine(0,i,6.1,i,'#9ad5ab07',1);}
 const b=bounds();for(const x of [0,.46,5.64,6.1])worldLine(x,0,x,13.4,x===b.left||x===b.right?'#e9f3dfc4':'#d2e4d660',x===b.left||x===b.right?2:1);for(const y of [0,.76,4.72,8.68,12.64,13.4])worldLine(0,y,6.1,y,'#e6f0dca0',1.4);worldLine(3.05,0,3.05,4.72);worldLine(3.05,8.68,3.05,13.4);
 if(view==='side'&&state!=='menu'){const a=project(3.05,6.7,0),b=project(3.05,6.7,1.55);line([a,b],'#f6f5d9',4);for(let i=0;i<9;i++){let y=b.y+i*(a.y-b.y)/9;line([{x:a.x-10,y},{x:a.x+10,y}],'#a7b7a5',1);}line([{x:b.x-13,y:b.y},{x:b.x+13,y:b.y}],'#fff1c7',3);}else{const a=project(-.25,6.7),b=project(6.35,6.7);ctx.fillStyle='#0d241caa';ctx.fillRect(a.x,a.y-9,b.x-a.x,18);for(let i=0;i<3;i++)line([{x:a.x,y:a.y-8+i*8},{x:b.x,y:b.y-8+i*8}],'#d7e4cd60',1);for(let x=a.x;x<b.x;x+=9)line([{x,y:a.y-8},{x,y:a.y+8}],'#d7e4cd40',1);line([{x:a.x,y:a.y-10},{x:b.x,y:b.y-10}],'#f6f1cd',3);for(const p of [a,b]){ctx.fillStyle='#e8f2d4';ctx.fillRect(p.x-3,p.y-16,6,32);}}
 ctx.font='600 12px system-ui';ctx.fillStyle='#d7ebcc50';ctx.textAlign='center';if(view==='top'||state==='menu'){const a=project(3.05,1.7),b=project(3.05,11.8);ctx.fillText('SHUTTLE CLUB',a.x,a.y);ctx.fillText('PLAY THE NEXT',b.x,b.y);}else{ctx.fillText('SHUTTLE CLUB',d.cx,d.top+d.ch+30);}}
function stick(p,decor=false){const v=project(p.x,p.y,p.z),side=view==='side'&&!decor;let scale=side?1: .75;const color=p.team===0?'#e5fa94':'#ffd0a3';ctx.save();ctx.translate(v.x,v.y);ctx.scale(scale,scale);ctx.lineCap='round';ctx.lineJoin='round';const jump=p.z||0;ctx.fillStyle='#071c1760';ctx.beginPath();ctx.ellipse(0,3+jump*15,20,5,0,0,Math.PI*2);ctx.fill();const crouch=p.crouch?9:0;ctx.translate(0,crouch);ctx.strokeStyle=color;ctx.lineWidth=3.2;const sway=Math.sin(p.walk)*8;const swing=p.swing>0?Math.sin(p.swing/.3*Math.PI)*22:0;ctx.beginPath();ctx.arc(0,-46,8,0,Math.PI*2);ctx.stroke();line([{x:0,y:-37},{x:0,y:-17},{x:-10+sway,y:0}],color,3.3);line([{x:0,y:-17},{x:12-sway,y:0}],color,3.3);line([{x:0,y:-33},{x:-13,y:-23},{x:-21,y:-29}],color,3);line([{x:0,y:-33},{x:15,y:-30-swing*.4},{x:26,y:-20-swing}],color,3);line([{x:26,y:-20-swing},{x:34,y:-35-swing}],color,2);ctx.save();ctx.translate(38,-43-swing);ctx.rotate(.45);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,7,11,0,0,Math.PI*2);ctx.stroke();for(let i=-3;i<=3;i+=3)line([{x:i,y:-7},{x:i,y:7}],color+'88',.7);line([{x:-5,y:0},{x:5,y:0}],color+'88',.7);ctx.restore();ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillStyle=color;ctx.fillText(decor?'':p.partner?'AI':p.team===0?'P1':count===1?'CPU':'P2',0,20);if(state==='serve'&&p.team===servingTeam&&Number(p.partner)===serverIndex){ctx.beginPath();ctx.arc(0,3,25,0,Math.PI*2);ctx.setLineDash([3,5]);ctx.strokeStyle='#d7f573';ctx.lineWidth=1;ctx.stroke();}ctx.restore();}
// The cork points along the projected flight tangent; feathers and fire trail behind.
function shuttleHeading(shuttle){
 const u=clamp(shuttle.t/shuttle.duration,0,1);
 const at=t=>project(
  shuttle.from.x+(shuttle.to.x-shuttle.from.x)*t,
  shuttle.from.y+(shuttle.to.y-shuttle.from.y)*t,
  shuttle.from.z*(1-t)+4*shuttle.arc*t*(1-t)
 );
 const a=at(Math.max(0,u-.001)),b=at(Math.min(1,u+.001));
 // The unrotated sprite has its cork at the -Y end, with feathers at +Y.
 return Math.atan2(b.y-a.y,b.x-a.x)+Math.PI/2;
}
function drawBall(){if(!ball)return;const b=ball,ground=project(b.to.x,b.to.y),current=project(b.x,b.y,b.z);const fire=Boolean(b.fire||b.jumpSmash||(b.quality>.85&&!b.service));ctx.save();ctx.textAlign='center';ctx.strokeStyle=b.by===0?'#ffd2a2':'#e2f58a';ctx.setLineDash([4,5]);ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(ground.x,ground.y,view==='top'?17:10,view==='top'?10:4,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#061b1855';const shadow=project(b.x,b.y);ctx.beginPath();ctx.ellipse(shadow.x,shadow.y,7,4,0,0,Math.PI*2);ctx.fill();for(let i=b.trail.length-1;i>0;i--){const a=project(b.trail[i].x,b.trail[i].y,b.trail[i].z),c=project(b.trail[i-1].x,b.trail[i-1].y,b.trail[i-1].z);line([a,c],fire?`rgba(255,${100+i*5},58,${(1-i/16)*.8})`:`rgba(231,248,190,${(1-i/16)*.4})`,fire?6-i*.27:3-i*.12);}ctx.translate(current.x,current.y);ctx.rotate(shuttleHeading(b));if(fire){ctx.shadowColor='#ff8b32';ctx.shadowBlur=18;ctx.fillStyle='#ffb740';ctx.beginPath();ctx.moveTo(-5,2);ctx.lineTo(0,19+Math.random()*9);ctx.lineTo(5,2);ctx.fill();}ctx.fillStyle='#f8ffe6';ctx.beginPath();ctx.moveTo(-6,10);ctx.lineTo(-3,0);ctx.lineTo(3,0);ctx.lineTo(6,10);ctx.closePath();ctx.fill();ctx.fillStyle='#dbef84';ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();ctx.restore();}
function drawTargets(){if(state!=='rally'&&state!=='serve')return;if(view==='top'){for(let t=0;t<count;t++){const v=project(aim[t].x,aim[t].y);ctx.strokeStyle=t===0?'#d7f57388':'#ffba8e88';ctx.lineWidth=1;ctx.beginPath();ctx.arc(v.x,v.y,11,0,Math.PI*2);ctx.moveTo(v.x-17,v.y);ctx.lineTo(v.x+17,v.y);ctx.moveTo(v.x,v.y-17);ctx.lineTo(v.x,v.y+17);ctx.stroke();}}for(const p of players){if(p.target){const v=project(p.target.x,p.target.y);ctx.strokeStyle='#d7f57388';ctx.beginPath();ctx.arc(v.x,v.y,8,0,Math.PI*2);ctx.stroke();}}}
function draw(){drawCourt();if(state==='menu'){stick({x:2.2,y:10.2,team:0,z:0,walk:0,swing:0},true);stick({x:4.3,y:3.2,team:1,z:0,walk:0,swing:0},true);}else{drawTargets();[...players].sort((a,b)=>a.y-b.y).forEach(p=>stick(p));drawBall();for(const e of effects){const v=project(e.x,e.y,e.z);ctx.save();ctx.globalAlpha=e.life;ctx.font='800 22px Barlow Condensed, sans-serif';ctx.fillStyle=e.color;ctx.textAlign='center';ctx.fillText(e.text,v.x,v.y-40-(1-e.life)*35);ctx.restore();}}}
function frame(time){const dt=Math.min((time-(last||time))/1000,.035);last=time;update(dt);draw();requestAnimationFrame(frame);}
function canvasClick(e){if(!['rally','serve'].includes(state)||view!=='top')return;const point=canvasPoint(e),d=dimensions;let x=(point.x-d.cx)/d.cw*6.1+3.05,y=(point.y-d.top)/d.ch*13.4;if(endChanged){x=6.1-x;y=13.4-y;}if(x<0||x>6.1||y<0||y>13.4)return;const p=players.find(p=>p.team===0&&!p.partner);if(y<6.7){aim[0]={x,y};notify('已设置回球方向',.7);}else if(state==='rally'){if(p.moveUsed){notify('本拍已移动，下一次击球后恢复',1);return;}const target={x,y},len=dist(p,target);if(len>6.7){target.x=p.x+(x-p.x)/len*6.7;target.y=p.y+(y-p.y)/len*6.7;}const b=bounds();target.x=clamp(target.x,b.left,b.right);target.y=clamp(target.y,6.9,13.25);p.target=target;p.moveUsed=true;}}
$$('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;$$('[data-view]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',x===b);});resize();});
$$('[data-players]').forEach(b=>b.onclick=()=>{count=Number(b.dataset.players);$$('[data-players]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',x===b);});});
$$('[data-shot]').forEach(b=>{
 b.addEventListener('pointerdown',event=>{
  if(event.button!==undefined&&event.button!==0)return;
  event.preventDefault();shotInput(0,b.dataset.shot);
 });
 // Keyboard/assistive activation has detail=0. Pointer clicks were handled above.
 b.addEventListener('click',event=>{event.preventDefault();if(event.detail===0)shotInput(0,b.dataset.shot);});
});
const moveVectors={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
$$('[data-move]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(view==='top')move(players.find(p=>p.team===0&&!p.partner),...moveVectors[b.dataset.move],0,true);else pointerMoves.add(b.dataset.move);});for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,()=>pointerMoves.delete(b.dataset.move));});
window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||$('#help').open||$('#settings').open)return;const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright',';'].includes(k))e.preventDefault();if(e.repeat)return;keys.add(k);if(k==='p'){if(state==='paused')resume();else pause();return;}if(k===' '){if(state==='serve')doServe();return;}if(!['serve','rally'].includes(state))return;const shots={j:'smash',k:'drop',l:'clear',';':'drive'};if(shots[k])shotInput(0,shots[k]);if(count===2&&['1','2','3','4'].includes(k))shotInput(1,['smash','drop','clear','drive'][Number(k)-1]);if(view==='top'){const dirs={w:'up',arrowup:'up',a:'left',arrowleft:'left',s:'down',arrowdown:'down',d:'right',arrowright:'right'};if(dirs[k])move(players.find(p=>p.team===0&&!p.partner),...moveVectors[dirs[k]],0,true);const other={t:'up',f:'left',g:'down',h:'right'};if(count===2&&other[k])move(players.find(p=>p.team===1&&!p.partner),...moveVectors[other[k]],0,true);}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();pointerMoves.clear();if(['serve','rally'].includes(state))pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&['serve','rally'].includes(state))pause();});
canvas.addEventListener('pointerdown',canvasClick);$('#start').onclick=start;$('#serveBtn').onclick=doServe;$('#pauseBtn').onclick=pause;$('#menuBtn').onclick=menu;$('#resumeBtn').onclick=resume;$('#restartBtn').onclick=start;$('#resultMenuBtn').onclick=menu;$('#helpBtn').onclick=openHelp;$('#closeHelp').onclick=()=>$('#help').close();$('#soundBtn').onclick=()=>{audioOn=!audioOn;updateSoundSetting();if(audioOn)beep();};window.addEventListener('resize',resize);resize();requestAnimationFrame(frame);


// Rotate the game surface itself when the browser keeps the device in portrait.
// The inverse transform keeps canvas taps aligned with the rendered court.
function canvasPoint(event){
 const rect=canvas.getBoundingClientRect();
 return virtualLandscape
  ?{x:event.clientY-rect.top,y:rect.left+rect.width-event.clientX}
  :{x:event.clientX-rect.left,y:event.clientY-rect.top};
}
function needsLandscape(){
 const width=window.visualViewport?.width||window.innerWidth||canvas.getBoundingClientRect().width;
 const height=window.visualViewport?.height||window.innerHeight||canvas.getBoundingClientRect().height;
 const touch=window.matchMedia?.('(any-pointer: coarse)').matches||false;
 return height>width&&(touch||width<=600);
}
function syncOrientation(){
 const before=virtualLandscape;
 virtualLandscape=needsLandscape();
 const width=window.visualViewport?.width||window.innerWidth||canvas.getBoundingClientRect().width;
 const height=window.visualViewport?.height||window.innerHeight||canvas.getBoundingClientRect().height;
 const root=document.documentElement;
 root?.style?.setProperty('--game-width',Math.max(width,height)+'px');
 root?.style?.setProperty('--game-height',Math.min(width,height)+'px');
 root?.classList?.toggle('virtualLandscape',virtualLandscape);
 $('#app').inert=false;
 if(before!==virtualLandscape){keys.clear();pointerMoves.clear();}
 resize();
 return virtualLandscape;
}
async function requestLandscape(fullscreen=true){
 const touch=window.matchMedia?.('(any-pointer: coarse)').matches||false;
 if(!touch&&!needsLandscape())return;
 const root=document.documentElement;
 try{
  if(fullscreen&&!document.fullscreenElement){
   if(root?.requestFullscreen)await root.requestFullscreen();
   else if(root?.webkitRequestFullscreen)await root.webkitRequestFullscreen();
  }
 }catch{/* The rotated game surface works without native fullscreen. */}
 try{
  if(window.screen?.orientation?.lock)await window.screen.orientation.lock('landscape');
 }catch{/* Keep the CSS landscape surface when native locking is unavailable. */}
 syncOrientation();
}
$('#start').onclick=()=>{syncOrientation();void requestLandscape();start();};
window.addEventListener('resize',syncOrientation);
window.addEventListener('orientationchange',syncOrientation);
window.visualViewport?.addEventListener('resize',syncOrientation);
document.addEventListener('fullscreenchange',syncOrientation);
syncOrientation();
void requestLandscape(false);


// Disable native selection/callout gestures without cancelling taps or held movement.
function suppressGameMenu(event){
 if(event.target?.closest?.('#app'))event.preventDefault();
}
for(const type of ['contextmenu','selectstart','dragstart']){
 document.addEventListener(type,suppressGameMenu,{capture:true});
}


// Double taps belong to gameplay; never let them magnify the browser viewport.
function isGameTarget(event){return Boolean(event.target?.closest?.('#app'));}
function suppressGameZoom(event){if(isGameTarget(event))event.preventDefault();}
let lastScreenTap=null;
function suppressDoubleTapZoom(event){
 if(!isGameTarget(event)||event.touches?.length)return;
 const touch=event.changedTouches?.[0];if(!touch)return;
 const stamp=event.timeStamp??performance.now();
 if(lastScreenTap&&stamp-lastScreenTap.at<350&&stamp>=lastScreenTap.at&&Math.hypot(touch.clientX-lastScreenTap.x,touch.clientY-lastScreenTap.y)<32)event.preventDefault();
 lastScreenTap={at:stamp,x:touch.clientX,y:touch.clientY};
}
document.addEventListener('dblclick',suppressGameZoom,{capture:true,passive:false});
document.addEventListener('touchend',suppressDoubleTapZoom,{capture:true,passive:false});
for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,suppressGameZoom,{capture:true,passive:false});
document.addEventListener('touchmove',event=>{if(event.touches?.length>1)suppressGameZoom(event);},{capture:true,passive:false});


let returnToSettings=false;
function updateSoundSetting(){
 const toggle=$('#soundBtn');
 toggle.setAttribute('aria-checked',String(audioOn));
 toggle.classList.toggle('on',audioOn);
 $('#soundState').textContent=audioOn?'已开启':'已关闭';
}
function openSettings(){
 if(['serve','rally','point'].includes(state))pause();
 updateSoundSetting();
 if(!$('#settings').open)$('#settings').showModal();
}
function openHelp(){
 returnToSettings=$('#settings').open;
 if(returnToSettings)$('#settings').close();
 if(['serve','rally','point'].includes(state))pause();
 $('#help').showModal();
}
$('#settingsBtn').onclick=openSettings;
$('#pauseSettingsBtn').onclick=openSettings;
$('#closeSettings').onclick=()=>$('#settings').close();
$('#help').addEventListener('close',()=>{
 if(returnToSettings){returnToSettings=false;openSettings();}
});
updateSoundSetting();
