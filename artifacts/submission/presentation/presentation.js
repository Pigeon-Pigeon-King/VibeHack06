(() => {
  "use strict";
  const slides = window.GANYMEDE_SLIDES;
  const media = window.GANYMEDE_MEDIA;
  const stage = document.querySelector(".stage");
  const isPresenter = new URLSearchParams(location.search).has("presenter");
  const scope = "ganymede-pitch-v1";
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let visualId = 0;
  let current = 0;
  let presenterWindow = null;
  let localVideoFile = null;
  let videoObjectUrl = null;
  let controlsTimeout;
  let remaining = 120000;
  let timerDeadline = null;
  let touchStart = null;

  function visual(kind) {
    const p = `v${++visualId}`;
    const defs = `<defs>
      <linearGradient id="${p}bg" x2=".85" y2="1"><stop stop-color="#203645"/><stop offset="1" stop-color="#0a121d"/></linearGradient>
      <linearGradient id="${p}warm" x1="0" x2="1"><stop stop-color="#e3b684" stop-opacity=".03"/><stop offset=".48" stop-color="#f6cf9b" stop-opacity=".7"/><stop offset="1" stop-color="#e3b684" stop-opacity=".01"/></linearGradient>
      <radialGradient id="${p}glow"><stop stop-color="#e8bc85" stop-opacity=".22"/><stop offset="1" stop-color="#e8bc85" stop-opacity="0"/></radialGradient>
      <pattern id="${p}grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#9eb9c6" stroke-opacity=".06" stroke-width="1"/></pattern>
    </defs>`;
    let body = `<rect width="1600" height="900" fill="url(#${p}bg)"/><rect width="1600" height="900" fill="url(#${p}grid)"/>`;
    const marks = `<g stroke="#8ba8b8" stroke-opacity=".2" fill="none" stroke-width="1"><path d="M770 450h60m-30-30v60M65 70h75M65 70v75M1535 830h-75m75 0v-75"/><circle cx="800" cy="450" r="9"/></g>`;
    if (kind === "orbit") {
      body = `<g fill="none" stroke="#7693a4"><ellipse cx="1200" cy="290" rx="450" ry="190" stroke-opacity=".13" transform="rotate(-24 1200 290)"/><ellipse cx="1200" cy="290" rx="520" ry="230" stroke-opacity=".07" transform="rotate(-24 1200 290)"/><circle cx="1200" cy="290" r="159" fill="#243744" fill-opacity=".26" stroke-opacity=".18"/><path d="M1057 220q130 35 285 6m-299 56q150 35 310 5m-304 62q150 18 282-8" stroke-opacity=".1" stroke-width="8"/></g><g stroke="#8ba6b6" stroke-opacity=".12"><path d="M0 738H1600M0 780H1600M800 715 0 900m800-185L300 900m500-185 500 185m-500-185 800 185"/></g><circle cx="1000" cy="193" r="3" fill="#d5b68e" opacity=".8"/>`;
    } else if (kind === "world") {
      body += `<circle cx="1160" cy="220" r="120" fill="#4c626c" fill-opacity=".23" stroke="#8aa4af" stroke-opacity=".2"/>
        <g fill="none" stroke="#7795a5" stroke-width="2" stroke-opacity=".38"><path d="M0 650h1600M0 720h1600M0 810h1600M800 600 80 900m720-300L450 900m350-300 350 300m-350-300 720 300"/><path d="M120 650V370h240v280M145 370v-60h190v60M395 650V430h210v220M1010 650V360h305v290M1070 360V190h20v170m0-165h250v22h-250m250-22v200M680 650V490h130v160m-90-160V290h28v200"/><path d="M180 410h120m-120 50h120m780-50h165m-165 50h165" stroke-opacity=".4"/></g>
        <path d="M120 650h450m430 0h440" stroke="#d7ae7c" stroke-opacity=".65" stroke-width="3"/><ellipse cx="840" cy="680" rx="420" ry="240" fill="url(#${p}glow)"/>${marks}`;
    } else if (kind.startsWith("person")) {
      const warm = kind === "person-wen";
      body += `<ellipse cx="800" cy="520" rx="500" ry="420" fill="url(#${p}glow)" opacity="${warm ? .8 : .25}"/><g fill="none" stroke="${warm ? '#c5a17b' : '#7fa4bc'}" stroke-opacity=".5" stroke-width="2"><path d="M625 350v-170h350v170l-70 90H695zM695 440l-165 85-90 300h720l-90-300-165-85M530 525l90 300m450-300-90 300M695 440v170h210V440M800 180v260M625 270h350M530 525h540"/><path d="M400 180h800M400 440h800M400 825h800M500 100v750m600-750v750" stroke-dasharray="8 16" stroke-opacity=".18"/><path d="M715 610v215m170-215v215M620 710h360" stroke-opacity=".35"/></g>${marks}`;
    } else if (kind === "gateway" || kind === "ending") {
      const end = kind === "ending";
      body += `<ellipse cx="${end ? 800 : 1120}" cy="430" rx="700" ry="540" fill="url(#${p}glow)"/><g stroke="#8199a5" stroke-opacity=".25" stroke-width="2" fill="none"><path d="M260 900V110h1080v790M400 900V210h800v690M550 900V280h500v620M0 900l550-280m1050 280-550-280M0 300l550 70m1050-70-550 70M400 210 260 110m940 100 140-100"/><path d="M550 620h500M400 720h800M260 840h1080"/></g><path d="M${end ? 800 : 1000} 280v390" stroke="#dfbc8c" stroke-width="${end ? 10 : 5}" opacity=".75"/><rect x="700" y="280" width="200" height="430" fill="url(#${p}warm)" opacity="${end ? .4 : .18}"/><path d="m800 640-190 260h380z" fill="#e7c38f" opacity=".04"/>${marks}`;
    } else if (kind === "cover") {
      body += `<g fill="none" stroke="#8da9b9" stroke-opacity=".5" stroke-width="3"><path d="M200 730V370l470-80v440zM670 290l210 110v330H670M1050 250v500m-200-250h400"/><circle cx="1050" cy="500" r="105"/><path d="m310 550 790-170" stroke="#ddb680" stroke-dasharray="14 18"/></g>${marks}`;
    } else if (kind === "carry") {
      body += `<g fill="none" stroke="#bfaa91" stroke-opacity=".55" stroke-width="3"><path d="m300 535 700-120 300 150-700 130zM300 535v90l300 150 700-120V565M385 670v95m830-135v95M500 490l-60-90m650 35 65-100"/><ellipse cx="1080" cy="505" rx="65" ry="30" transform="rotate(-10 1080 505)"/><path d="m1000 510-380 65m-25-50 70 100"/></g>${marks}`;
    } else if (kind === "door") {
      body += `<g fill="none" stroke="#94adba" stroke-width="3" stroke-opacity=".5"><path d="M430 800V170h740v630M480 800V220h640v580M480 220l430 90v510l-430-20z"/><path d="M850 540v100" stroke="#e1ba82" stroke-width="8"/></g><path d="m910 310 210-90v580l-210 20z" fill="url(#${p}warm)" opacity=".28"/>${marks}`;
    } else if (kind === "workflow") {
      const icons = [
        '<rect x="-55" y="-45" width="110" height="90" rx="2"/><circle cx="-22" cy="-12" r="9"/><path d="m-48 33 28-30 25 22 19-18 28 26"/>',
        '<path d="m0-58 56 32v64L0 70l-56-32v-64zM0 6v64m0-64 56-32M0 6l-56-32M0-58V6m-56 32L0 6l56 32"/>',
        '<path d="M-60 0h15l10-28 15 63 16-84 15 88 16-65L40 0h20"/>',
        '<path d="m-25-38-38 38 38 38m50-76 38 38-38 38M12-53-12 53"/>',
        '<rect x="-65" y="-45" width="130" height="85" rx="3"/><path d="M-25 65h50M0 40v25m-15-84v42L25 2z"/>'
      ];
      body = `<g stroke="#7694a8" stroke-opacity=".2" fill="none"><ellipse cx="800" cy="430" rx="680" ry="250"/><ellipse cx="800" cy="430" rx="680" ry="340"/><path d="M80 430h1440" stroke-opacity=".5"/></g><g fill="#dbb184"><circle cx="400" cy="430" r="4"/><circle cx="668" cy="430" r="4"/><circle cx="935" cy="430" r="4"/><circle cx="1200" cy="430" r="4"/></g>`;
      body += icons.map((icon,i) => `<g transform="translate(${265+i*268} 430)"><rect x="-106" y="-124" width="212" height="248" rx="3" fill="#101f2b" stroke="${i === 4 ? '#bb9570' : '#405c6e'}" stroke-opacity=".8"/><path d="M-106-92h212" stroke="#597282" stroke-opacity=".35"/><g transform="translate(0 8)" stroke="${i===4 ? '#d9b68b' : '#a0b6c5'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none">${icon}</g></g>`).join("");
    }
    return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}${body}</svg>`;
  }

  function slot(id, kind, label) {
    return `<div class="slot" data-slot="${id}" role="img" aria-label="${esc(label)}画面占位，非实机画面">${visual(kind)}<span class="corner tl"></span><span class="corner br"></span></div>`;
  }
  function build(s, i) {
    let art = "";
    if(s.layout === "cover") art = `<div class="art">${visual("orbit")}</div><h1 class="title-lockup"><img src="${esc(media.title)}" alt="重返木卫三"></h1><div class="horizon"></div>`;
    if(s.layout === "world") art = slot("world","world","港区");
    if(s.layout === "portraits") art = `<div class="portrait-pair">${slot("wen","person-wen","闻川")}${slot("zhou","person-zhou","周延")}</div>`;
    if(s.layout === "promise") art = slot("promise","gateway","护送与接应");
    if(s.layout === "triptych") art = `<div class="strip">${slot("cover","cover","掩护")}${slot("carry","carry","救援")}${slot("door","door","通路")}</div>`;
    if(s.layout === "workflow") art = `<div class="art" role="img" aria-label="概念图、模型、声音、代码、游戏整合的制作流程图">${visual("workflow")}</div>`;
    if(s.layout === "ending") art = slot("ending","ending","通路与希望");
    if(s.layout === "video") art = `<div class="video-frame"><div class="video-placeholder" aria-label="45秒视频占位，尚无视频素材"><img class="video-wordmark" src="${esc(media.title)}" alt=""><svg class="play-mark" viewBox="0 0 48 48" aria-hidden="true"><path d="M18 10v28l23-14z"/></svg></div><video id="trailer" controls playsinline preload="metadata" hidden aria-label="45秒故事预告"></video></div>`;
    return `<section class="slide ${s.layout}" id="slide-${i+1}" data-slide="${s.id}" role="group" aria-roledescription="幻灯片" aria-label="${i+1} / ${slides.length} · ${esc(s.title)}" ${i ? 'hidden' : ''}><div class="accent-rule" aria-hidden="true"></div>${art}<div class="copy">${s.layout === 'cover' ? '' : `<h2>${esc(s.title)}</h2>`}<p class="caption"><span class="full">${esc(s.caption)}</span><span class="short">${esc(s.shortCaption)}</span></p></div></section>`;
  }
  document.querySelector("#slides").innerHTML = slides.map(build).join("");
  document.querySelector("#progress").innerHTML = slides.map((s,i) => `<button type="button" data-go="${i}" aria-label="第${i+1}页：${esc(s.title)}" title="${esc(s.title)}"></button>`).join("");
  const elements = [...document.querySelectorAll(".slide")];
  const trailer = document.querySelector("#trailer");
  const trailerPlaceholder = document.querySelector(".video-placeholder");

  function hintControls() {
    stage.classList.add("controls-visible");
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => stage.classList.remove("controls-visible"), 2200);
  }
  function message(target, payload) {
    if(target && !target.closed) target.postMessage({scope,...payload}, "*");
  }
  function show(index, announce = true, notify = true) {
    const n = Math.max(0, Math.min(slides.length-1, Math.trunc(Number(index) || 0)));
    if(current !== n && trailer.getAttribute("src")) trailer.pause();
    current = n;
    elements.forEach((el,i) => { el.hidden = i !== n; el.setAttribute("aria-hidden", String(i !== n)); });
    document.querySelectorAll("[data-go]").forEach((b,i) => b.setAttribute("aria-current", String(i === n)));
    document.querySelector("#previous").disabled = n === 0;
    document.querySelector("#next").disabled = n === slides.length-1;
    document.querySelector("#page-number").textContent = `${String(n+1).padStart(2,'0')} / ${String(slides.length).padStart(2,'0')}`;
    document.querySelector("#note-title").textContent = slides[n].title;
    document.querySelector("#notes").textContent = slides[n].notes;
    document.querySelector("#cue").textContent = slides[n].cue;
    document.querySelector("#next-title").textContent = n+1 < slides.length ? `下一页 · ${slides[n+1].title}` : "影片结束后停留本页";
    if(announce) document.querySelector("#announce").textContent = `第${n+1}页，${slides[n].title}`;
    document.title = `${slides[n].title} · 重返木卫三${isPresenter ? ' · 备注' : ''}`;
    const hash=`#slide-${n+1}`;
    if(location.hash!==hash) {
      try { history.replaceState(null,"",hash); }
      catch (_) { location.hash=hash; } // 部分 file:// 环境不允许 replaceState。
    }
    if(notify) message(isPresenter ? window.opener : presenterWindow, {type:"slide", index:n});
  }
  function openPresenter() {
    if(isPresenter) return;
    if(presenterWindow && !presenterWindow.closed) { presenterWindow.focus(); return; }
    const url = new URL(location.href); url.searchParams.set("presenter","1");
    presenterWindow = window.open(url.href,"ganymede-presenter","popup,width=1440,height=900");
    if(!presenterWindow) {
      document.body.classList.add("presenter-mode");
      document.querySelector("#presenter-panel").hidden = false;
      document.querySelector("#presenter-status").textContent = "浏览器拦截了备注窗口，已在当前窗口显示。重新打开本页可恢复纯展示。";
    }
  }
  async function fullscreen() {
    try {
      if(document.fullscreenElement) await document.exitFullscreen();
      else if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else document.querySelector("#announce").textContent = "请使用浏览器的全屏菜单";
    } catch (_) { document.querySelector("#announce").textContent = "请使用浏览器的全屏菜单"; }
  }
  document.querySelector("#previous").addEventListener("click", () => show(current-1));
  document.querySelector("#next").addEventListener("click", () => show(current+1));
  document.querySelector("#presenter").addEventListener("click", openPresenter);
  document.querySelector("#fullscreen").addEventListener("click", fullscreen);
  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => show(Number(b.dataset.go))));
  stage.addEventListener("pointermove",hintControls);
  stage.addEventListener("pointerdown",hintControls);
  window.addEventListener("keydown", e => {
    if(e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT|AUDIO|VIDEO)$/.test(e.target.tagName)) return;
    if(e.target.closest("button,summary,label") && (e.key === ' ' || e.key === 'Enter')) return;
    if(["ArrowRight","ArrowDown","PageDown"," "].includes(e.key)) { e.preventDefault(); show(current+1); }
    else if(["ArrowLeft","ArrowUp","PageUp"].includes(e.key)) { e.preventDefault(); show(current-1); }
    else if(e.key === "Home") { e.preventDefault(); show(0); }
    else if(e.key === "End") { e.preventDefault(); show(slides.length-1); }
    else if(e.key.toLowerCase() === "f") fullscreen();
    else if(e.key.toLowerCase() === "n") openPresenter();
    hintControls();
  });
  stage.addEventListener("touchstart", e => {
    if(e.target.closest("video,button,audio")) return;
    const t=e.changedTouches[0]; touchStart={x:t.clientX,y:t.clientY};
  },{passive:true});
  stage.addEventListener("touchend", e => {
    if(!touchStart) return;
    const t=e.changedTouches[0], dx=t.clientX-touchStart.x, dy=t.clientY-touchStart.y;
    if(Math.abs(dx)>50 && Math.abs(dx)>Math.abs(dy)*1.4) show(current+(dx<0 ? 1 : -1));
    touchStart=null;
  },{passive:true});
  window.addEventListener("hashchange", () => show(Math.max(0, parseInt(location.hash.replace('#slide-',''),10)-1) || 0));

  for(const [id,src] of Object.entries(media.images)) {
    if(!src) continue;
    const target = document.querySelector(`[data-slot="${id}"]`);
    if(!target) continue;
    const img=new Image(); img.alt="";
    img.addEventListener("load", () => {
      target.append(img);
      target.setAttribute("aria-label",media.imageDescriptions?.[id] || `${id} 游戏实机画面`);
      if(media.imagePositions?.[id]) img.style.objectPosition=media.imagePositions[id];
      target.closest(".portraits")?.classList.add("captured-perspectives");
    });
    img.addEventListener("error", () => { target.dataset.loadError="true"; });
    img.src=src;
  }
  function setVideo(src, description) {
    trailer.hidden=true; trailerPlaceholder.hidden=false;
    trailer.src=src;
    trailer.load();
    document.querySelector("#video-status").textContent=description;
  }
  function receiveVideo(file) {
    if(!file || !file.type.startsWith("video/")) return;
    if(videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    localVideoFile=file;
    videoObjectUrl=URL.createObjectURL(file);
    setVideo(videoObjectUrl,`${file.name} · 本次临时载入`);
  }
  if(media.trailer) setVideo(media.trailer,"已配置本地视频，等待读取");
  if(media.trailerCaptions) {
    const track=document.createElement('track'); track.kind='subtitles'; track.srclang='zh-CN'; track.label='中文'; track.src=media.trailerCaptions;
    trailer.append(track);
  }
  trailer.addEventListener("loadedmetadata", () => {
    trailer.hidden=false; trailerPlaceholder.hidden=true;
    const seconds=Number.isFinite(trailer.duration) ? trailer.duration.toFixed(3) : "未知";
    document.querySelector("#video-status").textContent=`视频已载入 · ${seconds} 秒${Math.abs(trailer.duration-45)>.1 ? ' · 请核对45秒时长' : ''}`;
    const cap=document.querySelector(".video .caption");
    const label=media.trailerLabel || (Math.abs(trailer.duration-45)<=.1 ? "45秒故事预告" : "故事预告");
    cap.querySelector('.full').textContent=label; cap.querySelector('.short').textContent=label;
  });
  trailer.addEventListener("error", () => {
    trailer.hidden=true; trailerPlaceholder.hidden=false;
    document.querySelector("#video-status").textContent="视频读取失败，请检查路径或选择浏览器可播放的本地文件。";
  });
  document.querySelector("#video-file").addEventListener("change", e => {
    const file=e.target.files[0]; if(!file) return;
    receiveVideo(file);
    message(isPresenter ? window.opener : presenterWindow, {type:"video-file",file});
  });
  if(media.audioPreview) {
    const audio=document.querySelector("#preview-player");
    audio.src=media.audioPreview;
    document.querySelector("#audio-preview").hidden=false;
    audio.addEventListener("error", () => { document.querySelector("#presenter-status").textContent="音频试听读取失败，请检查素材路径。"; });
  }
  if(media.preeditPreview) {
    const preedit=document.querySelector("#preedit-player");
    preedit.src=media.preeditPreview;
    document.querySelector("#preedit-preview").hidden=false;
    preedit.addEventListener("error", () => { document.querySelector("#presenter-status").textContent="预剪稿读取失败，请检查素材路径。"; });
    const players=[preedit,document.querySelector("#preview-player"),trailer];
    players.forEach(player => player.addEventListener("play", () => players.forEach(other => { if(other!==player && !other.paused) other.pause(); })));
  }
  window.addEventListener("message", e => {
    if(!e.data || e.data.scope!==scope) return;
    const trusted=isPresenter ? e.source===window.opener && !!window.opener : e.source===presenterWindow && !!presenterWindow;
    if(!trusted) return;
    if(e.data.type==='slide') show(e.data.index,true,false);
    if(e.data.type==='ready' && !isPresenter) {
      message(presenterWindow,{type:'slide',index:current});
      if(localVideoFile) message(presenterWindow,{type:'video-file',file:localVideoFile});
    }
    if(e.data.type==='video-file') receiveVideo(e.data.file);
  });

  function clockTick() {
    const ms=timerDeadline===null ? remaining : timerDeadline-Date.now();
    const sec=Math.ceil(Math.abs(ms)/1000);
    document.querySelector("#clock").textContent=`${ms<0 ? '+' : ''}${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
    document.querySelector(".timer").classList.toggle('over',ms<0);
  }
  document.querySelector("#timer-toggle").addEventListener("click", e => {
    if(timerDeadline===null) { timerDeadline=Date.now()+remaining; e.target.textContent="暂停计时"; }
    else { remaining=timerDeadline-Date.now(); timerDeadline=null; e.target.textContent="继续计时"; }
    clockTick();
  });
  document.querySelector("#timer-reset").addEventListener("click", () => {
    remaining=120000; timerDeadline=null; document.querySelector("#timer-toggle").textContent="开始计时"; clockTick();
  });
  if(isPresenter) {
    document.body.classList.add("presenter-mode"); document.querySelector("#presenter-panel").hidden=false;
    document.querySelector("#presenter").hidden=true;
    if(!window.opener) document.querySelector("#presenter-status").textContent="当前为独立备注页。由展示页按N打开，可同步翻页。";
    else message(window.opener,{type:"ready"});
  }
  setInterval(clockTick,250);
  show(Math.max(0,parseInt(location.hash.replace('#slide-',''),10)-1)||0,false,false);
  hintControls();
})();
