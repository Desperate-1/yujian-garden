import {visitPages} from './paper_visit_pages.js';

const get=id=>document.getElementById(id);
const garden=get('paperGarden'),canvas=get('paperCanvas'),menu=get('gardenDestinations');
const links=Object.fromEntries([...menu.querySelectorAll('[data-play]')].map(a=>[a.dataset.play,a]));
const enterText={candy:'进屋找'+document.documentElement.dataset.host,journal:'坐下写日记',gallery:'走进展厅'};
const titles={entrance:document.documentElement.dataset.scene,fountain:'心灵喷泉'};
const returnButton=get('gardenReturn'),still=get('paperStill'),stillButton=get('stillAction');
const hint=get('paperHint'),note=get('paperPointerHint');
const frames={candy:0,journal:0,gallery:0};
let stage=null,live=false,place='entrance';
const targetFromURL=()=>Object.hasOwn(links,location.hash.slice(1))?location.hash.slice(1):'entrance';
const name=key=>titles[key] || links[key]?.textContent.trim();
const objectLabel=()=>frames[place] ? enterText[place] : visitPages[place]?.[0].label;
function remember(key){
    const hash=key==='entrance'?'':'#'+key;
    if(hash!==location.hash)history.replaceState(history.state,'',location.pathname+location.search+hash);
}
function showPanel(id){
    for(const panel of garden.querySelectorAll('.paper-actions'))panel.classList.toggle('is-on',panel.id===id);
}
function hover(hit,e){
    canvas.dataset.hit=hit?.key || '';
    if(!hit || !e || e.pointerType==='touch'){note.hidden=true;return;}
    const bounds=canvas.getBoundingClientRect();
    note.textContent=hit.text;note.hidden=false;
    const x=Math.max(6,Math.min(e.clientX-bounds.left+15,bounds.width-note.offsetWidth-8));
    const y=Math.max(5,Math.min(e.clientY-bounds.top+19,bounds.height-note.offsetHeight-8));
    note.style.transform='translate('+x+'px,'+y+'px)';
}
function inspect(page){
    get('visitAction').textContent=page.label;
    hint.textContent=page.hint;
    stillButton.setAttribute('aria-label',objectLabel());
}
function showPlace(key,focus=false){
    if(key!==place || focus)menu.open=false;
    place=key;
    const pool=key==='fountain',home=key==='entrance';
    garden.dataset.view=pool?'pool':key;
    garden.dataset.render=live?'webgl':'fallback';
    get('paperPlace').textContent=name(key);
    get('paperVisit').dataset.place=key;
    showPanel(home?'paperEntrance':pool?'paperPool':'paperVisit');
    returnButton.hidden=home;
    canvas.tabIndex=live?0:-1;
    hover(null);
    if(home){
        hint.textContent='点画中的金边景物走近，或从花园导航直接进入玩法。';
    }else if(pool){
        hint.textContent=live?'划过水面看涟漪，点击水莲或池沿进入舞厅。':'点击水莲进入喷泉舞厅。';
    }else{
        const link=get('visitEnter');
        link.href=links[key].href;link.textContent=enterText[key]+' →';
    }
    if(!live)paintStill();
    remember(key);
    if(focus){
        const target=home?get('walkPath'):live?canvas:pool?get('enterDance'):get('visitAction');
        target.focus({preventScroll:true});
    }
}
function paintStill(){
    const base=garden.dataset.cover;
    const src=place==='entrance'?base:base.replace(/\.webp$/,'-'+place+'-'+(frames[place]||0)+'.webp');
    get('paperStillImage').src=src;
    stillButton.hidden=place==='entrance';
    if(place==='fountain')stillButton.setAttribute('aria-label','进入喷泉舞厅');
    else if(visitPages[place])inspect(visitPages[place][frames[place]]);
}
function action(){
    if(live){stage.action();return;}
    if(visitPages[place]){
        frames[place]=(frames[place]+1)%visitPages[place].length;
        paintStill();
    }
}
function enter(key){if(links[key])location.assign(links[key].href);}
function useObject(){
    if(place==='fountain'||frames[place])enter(place);
    else action();
}
function go(key,instant=false){
    menu.open=false;
    if(live)stage.go(key,instant);
    else showPlace(key,true);
}
function transit(key){
    garden.dataset.view=key==='entrance'?'returning':'walking';
    showPanel('paperTransit');returnButton.hidden=false;canvas.tabIndex=-1;hover(null);
    get('paperPlace').textContent=key==='entrance'?'回到花园':'走近'+name(key);
    hint.textContent='正在沿路前行。';
    get('skipWalk').focus({preventScroll:true});
}
function orbit(on,reduced){
    const button=get('orbitTour');button.setAttribute('aria-pressed',String(on));
    button.textContent=reduced?'看向对岸':on?'停在这里':'绕池一周';
}
for(const link of [...menu.querySelectorAll('[data-destination]'),...still.querySelectorAll('[data-map]')]){
    link.addEventListener('click',e=>{
        if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;
        e.preventDefault();go(link.dataset.destination || link.dataset.map);
    });
}
// Leave the menu closed if the browser restores this page from its back cache.
for(const link of Object.values(links))link.addEventListener('click',()=>{menu.open=false;});
function backToGarden(){
    const travelling=['walking','returning'].includes(garden.dataset.view);
    go('entrance',travelling);
}
returnButton.addEventListener('click',e=>{e.preventDefault();backToGarden();});
get('walkPath').addEventListener('click',()=>go('fountain'));
get('skipWalk').addEventListener('click',()=>stage?.finish());
get('visitAction').addEventListener('click',action);
stillButton.addEventListener('click',useObject);
get('orbitLeft').addEventListener('click',()=>stage?.turnBy(-Math.PI/4));
get('orbitRight').addEventListener('click',()=>stage?.turnBy(Math.PI/4));
get('orbitTour').addEventListener('click',()=>stage?.tour());
const player=get('g3dMusic'),audio=get('paperAudio');
if(player&&audio){audio.append(player);audio.parentElement.hidden=false;}
const menus=[...garden.querySelectorAll('.paper-header details')];
document.addEventListener('click',e=>{for(const el of menus)if(!el.contains(e.target))el.open=false;});
document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||e.defaultPrevented)return;
    for(const el of menus)if(el.open){el.open=false;el.querySelector('summary').focus();return;}
    if(!returnButton.hidden && e.target!==canvas){e.preventDefault();backToGarden();}
});
window.addEventListener('hashchange',()=>go(targetFromURL(),true));
const initial=targetFromURL();
async function start(){
    try{
        const {loadStreetLettering}=await import('./anime_lettering.js');
        await loadStreetLettering();
        const {openPaperStage}=await import('./paper_stage.js');
        const styles=getComputedStyle(garden);
        const palette=Object.fromEntries(['sky','paper','leaf','ink','gold','blossom'].map(k=>[k,styles.getPropertyValue('--pg-'+k).trim()]));
        const ui={name,hover,inspect,enter,useObject,objectLabel,transit,place:showPlace,orbit,frames,
            loss(key){live=false;showPlace(key);},
            restore(){live=true;return place;}
        };
        stage=await openPaperStage(canvas,palette,ui);
        live=true;stage.go(targetFromURL(),true,false);
    }catch(error){
        console.warn('已切换为花园插画导览。',error.message);
        live=false;
        if(garden.dataset.render!=='fallback' || targetFromURL()!==place)showPlace(targetFromURL());
    }
}
garden.dataset.ready='true';
showPlace(initial);
start();
