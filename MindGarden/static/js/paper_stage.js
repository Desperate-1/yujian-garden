import * as T from '../vendor/mediapipe/three.module.js';
import {buildWorld} from './paper_world.js';
import {buildSeasonWorld} from './season_world.js';
import {buildVisits} from './paper_visits.js';
import {buildFountain} from './paper_fountain.js';
import {finishPaper} from './paper_stock.js';
import {buildGilding} from './paper_gilding.js';
import {hangHorizon} from './paper_horizon.js';
import {lightGarden} from './paper_light.js';

const circle = Math.PI*2;
const vector=(x,y,z)=>new T.Vector3(x,y,z);
const ease=t=>t*t*(3-2*t);

export async function openPaperStage(canvas,palette,ui) {
    const theme=document.documentElement.dataset.theme;
    const buildSetting=theme==='fresh'?(await import('./noon_temple.js')).buildNoonTemple:
        theme==='ugly'?(await import('./moon_garden.js')).buildMoonGarden:null;
    const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.65));
    renderer.outputColorSpace=T.SRGBColorSpace;
    const scene=new T.Scene();
    const night=theme==='ugly';
    const lighting=lightGarden(T,scene,renderer,palette,theme);
    const world=buildSetting?buildSeasonWorld(T,scene,palette,theme,buildSetting):buildWorld(T,scene,palette);
    const fountain=buildFountain(T,scene,palette);
    const visits=buildVisits(T,scene,palette,ui.frames);
    visits.restore();
    const stock=finishPaper(T,scene);
    const horizon=theme==='cute'?hangHorizon(T,scene,palette,night):world.horizon;
    const gilding=buildGilding(T,scene,world,visits,palette,fountain);
    const camera=new T.PerspectiveCamera(46,1,.12,185);
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const homeEye=vector(-2.2,2.05,20.4),homeAim=vector(-.25,2.4,-6);
    const poolRadius=8.1,poolY=3.95,poolFocus=vector(0,1.42,0);
    const curve=points=>new T.CatmullRomCurve3(points);
    const routes={fountain:{
        eye:curve([homeEye,vector(-1.2,2.12,17.5),vector(-1.38,2.22,13.7),vector(-1.15,2.6,10.65),vector(0,poolY,poolRadius)]),
        aim:curve([homeAim,vector(-.68,1.83,.5),vector(-.25,1.53,.6),vector(.15,1.68,.25),poolFocus])
    }};
    const detours={
        candy:[vector(-1.72,2.13,13),vector(-5.8,2.22,7.0)],
        journal:[vector(-2.6,2.11,11),vector(-5.65,2.02,1.8)],
        gallery:[vector(1.2,2.1,13),vector(5.45,2.18,3.3)]
    };
    for(const [key,spot] of Object.entries(visits.spots)){
        routes[key]={
            eye:curve([homeEye,...detours[key],spot.eye]),
            aim:curve([homeAim,homeAim.clone().lerp(spot.aim,.4),spot.aim])
        };
    }

    const ray=new T.Raycaster(),ndc=new T.Vector2(),pointed=new T.Vector3();
    const ground=new T.Plane(vector(0,1,0),0);
    const poolTargets=[...fountain.solids,fountain.waterTarget];
    const entranceTargets=[world.sunTarget,...world.spotTargets,...poolTargets,...world.pathTargets];
    const nearby={fountain:[world.sunTarget,...world.spotTargets,...poolTargets]};
    for(const key of Object.keys(visits.spots)){
        nearby[key]=[world.sunTarget,...visits.targets(key),...poolTargets,...world.spotTargets.filter(o=>o.userData.destination!==key)];
    }
    const stopListeners=new AbortController(), opts={signal:stopListeners.signal};
    let place='entrance',legs=[],destination='entrance',angle=0,targetAngle=0,auto=null;
    let drag=null,over=false,hot='',frame=0,last=0,time=0,lastRender=-Infinity,lost=false,disposed=false;
    let shadowUntil=0,lastShadow=-Infinity,movementStart=0;
    const skyPosition=new T.Vector3();
    function followSun(){
        world.sunTarget.getWorldPosition(skyPosition);
        lighting.follow(skyPosition);
        shadowUntil=time+.22;
    }
    followSun();
    const currentAim=vector();
    function aimAt(eye,aim){camera.position.copy(eye);currentAim.copy(aim);camera.lookAt(aim);camera.updateMatrixWorld();}
    function atPool(){
        const west=Math.max(0,-Math.sin(angle))**2;
        const radius=poolRadius-2.7*west;
        camera.position.set(radius*Math.sin(angle),poolY,radius*Math.cos(angle));
        currentAim.copy(poolFocus);camera.lookAt(poolFocus);camera.updateMatrixWorld();
    }
    function orbitStatus(){ui.orbit(Boolean(auto),motion.matches);}
    function stopOrbit(){auto=null;orbitStatus();}
    function setPlace(key,focus){
        place=key;destination=key;legs=[];angle=targetAngle=0;
        if (key==='entrance') aimAt(homeEye,homeAim);
        else if(key==='fountain') atPool();
        else aimAt(visits.spots[key].eye,visits.spots[key].aim);
        over=false;hot='';ui.hover(null);
        ui.place(key,focus);stopOrbit();
        if (visits.spots[key]) ui.inspect(visits.describe(key));
    }
    // Follow the outside of the stone basin between façades. This also gives an
    // interrupted walk a continuous start position and viewing direction.
    function linkRoute(key){
        const end=key==='entrance'?homeEye:key==='fountain'?vector(0,poolY,poolRadius):visits.spots[key].eye;
        const look=key==='entrance'?homeAim:key==='fountain'?poolFocus:visits.spots[key].aim;
        const start=camera.position.clone(),startAngle=Math.atan2(start.x,start.z);
        const turn=Math.atan2(end.x,end.z)-startAngle;
        const arc=Math.atan2(Math.sin(turn),Math.cos(turn));
        const pieces=Math.max(1,Math.ceil(Math.abs(arc)/.32));
        const points=[start];
        // The awning projects over the outer side of the western walk. Join the
        // clear inner ring before turning, then approach each door radially.
        for(let i=0;i<=pieces;i++){
            const t=i/pieces,a=startAngle+arc*t;
            const waypoint=vector(Math.sin(a)*5.45,start.y+(end.y-start.y)*t,Math.cos(a)*5.45);
            if(waypoint.distanceTo(points[points.length-1])>.25 && waypoint.distanceTo(end)>.25) points.push(waypoint);
        }
        points.push(end.clone());
        return {eye:curve(points),aim:curve([currentAim.clone(),currentAim.clone().lerp(look,.52),look.clone()])};
    }
    function go(key,instant=false,focus=true){
        if(lost || disposed || (key!=='entrance' && !routes[key])) return;
        if(drag) endDrag();
        stopOrbit();
        if(instant || motion.matches) {setPlace(key,focus);render(0);return;}
        if((legs.length && destination===key) || (!legs.length && key===place)) return;
        if(legs.length || (place!=='entrance' && key!=='entrance')){
            legs=[{route:linkRoute(key),back:false,duration:2.35,elapsed:0}];
        } else if(place!=='entrance'){
            const backAngle=Math.atan2(Math.sin(angle),Math.cos(angle));
            if(place==='fountain' && Math.abs(backAngle)>.015)
                legs.push({angle:backAngle,duration:Math.abs(backAngle)*.38,elapsed:0});
            legs.push({route:routes[place],back:true,duration:2.55,elapsed:0});
        } else legs.push({route:routes[key],back:false,duration:2.85,elapsed:0});
        destination=key;
        movementStart=performance.now();
        over=false;hot='';ui.hover(null);ui.transit(key);
    }
    function finish(){if(legs.length){setPlace(destination,true);render(0);}}
    function turnBy(delta){
        if(place!=='fountain' || legs.length || lost)return;
        stopOrbit();targetAngle+=delta;
        if(motion.matches){angle=targetAngle;atPool();render(0);}
    }
    function tour(){
        if(place!=='fountain' || legs.length)return;
        if(motion.matches){turnBy(Math.PI);return;}
        auto=auto?null:{from:angle,elapsed:0};targetAngle=angle;orbitStatus();
    }
    const trackEye=vector(),trackAim=vector();
    function advance(dt){
        if(legs.length){
            while(legs.length){
                const leg=legs[0],left=leg.duration-leg.elapsed;
                const complete=dt>=left;
                leg.elapsed=complete?leg.duration:leg.elapsed+dt;
                const t=leg.elapsed/leg.duration;
                if(leg.route){
                    const p=leg.back?1-ease(t):ease(t);
                    aimAt(leg.route.eye.getPointAt(p,trackEye),leg.route.aim.getPointAt(p,trackAim));
                }else{angle=targetAngle=leg.angle*(1-ease(t));atPool();}
                if(!complete)break;
                dt-=left;legs.shift();
                if(!legs.length)setPlace(destination,true);
            }
        } else if(place==='fountain'){
            if(auto){
                auto.elapsed+=dt;
                const t=Math.min(1,auto.elapsed/12);
                angle=targetAngle=auto.from+circle*(t-.4*Math.sin(circle*t)/circle);
                if(t===1)stopOrbit();
            } else angle+=(targetAngle-angle)*(1-Math.exp(-14*dt));
            atPool();
        }
    }
    function render(dt,travelTime=dt){
        if(lost || disposed)return;
        advance(travelTime);
        if(over) ray.setFromCamera(ndc,camera);
        // A stroke across a wall or the sky should not comb the lawn behind it.
        const onGround=over && !hot && !drag && !legs.length;
        const groundPoint=onGround?ray.ray.intersectPlane(ground,pointed):null;
        world.update(time,motion.matches,groundPoint,over?ray.ray:null);
        visits.update(dt,motion.matches);
        fountain.update(time,motion.matches);
        gilding.update(legs.length?'walking':place==='fountain'?'pool':place,hot,time,motion.matches);
        const movingProp=time<=shadowUntil;
        const refreshShadow=movingProp ? motion.matches || time-lastShadow>=.14 :
            !motion.matches && !legs.length && time-lastShadow>=.50;
        if(refreshShadow){
            renderer.shadowMap.needsUpdate=true;lastShadow=time;
        }
        renderer.render(scene,camera);
    }
    function draw(now){
        if(lost||disposed||document.hidden)return;
        const elapsed=last?Math.max(0,(now-last)/1000):0;
        const travelTime=legs.length && last ? Math.max(0,(now-Math.max(last,movementStart))/1000) : elapsed;
        const dt=Math.min(elapsed,.25);
        time+=dt;last=now;
        if(!motion.matches || time-lastRender>=.15){render(dt,travelTime);lastRender=time;}
        frame=requestAnimationFrame(draw);
    }
    function resume(){cancelAnimationFrame(frame);last=0;if(!disposed&&!lost&&!document.hidden)frame=requestAnimationFrame(draw);}
    function resize(){
        const {width,height}=canvas.parentElement.getBoundingClientRect();
        if(!width||!height||lost||disposed)return;
        renderer.setSize(Math.round(width),Math.round(height),false);
        camera.aspect=width/height;camera.updateProjectionMatrix();
        gilding.resize(width,height,renderer.getPixelRatio());render(0);
    }
    function sample(e){
        const r=canvas.getBoundingClientRect();
        ndc.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);
        ray.setFromCamera(ndc,camera);over=true;
    }
    function foregroundCoversSun(distance,caster=ray){
        // Only check the full front scenery on a press. Hovering across the sky
        // stays cheap even on machines with a slow software WebGL renderer.
        const intersections=[],oldFar=caster.far;
        caster.far=distance;
        scene.traverseVisible(o=>{
            if(!intersections.length && o.isMesh && o.castShadow && o.material.visible)
                o.raycast(caster,intersections);
        });
        caster.far=oldFar;
        return intersections.length>0;
    }
    const sunCheck=new T.Raycaster(),sampleWorld=vector(),projected=vector(),sunEnd=vector();
    const discSamples=[vector()];
    for(let i=0;i<8;i++)discSamples.push(vector(1.48*Math.cos(i*circle/8),1.48*Math.sin(i*circle/8),0));
    function canGrabSun(dx,dy,grabPoint){
        const samples=grabPoint?[...discSamples,grabPoint]:discSamples;
        return samples.some(point=>{
            sampleWorld.copy(point).applyMatrix4(world.sunTarget.matrixWorld);
            sampleWorld.x+=dx;sampleWorld.y+=dy;
            projected.copy(sampleWorld).project(camera);
            if(Math.abs(projected.x)>.985 || Math.abs(projected.y)>.985 || Math.abs(projected.z)>1)return false;
            sunCheck.setFromCamera(projected,camera);
            return !horizon.coversSun(sunCheck.ray) && !foregroundCoversSun(sunCheck.ray.origin.distanceTo(sampleWorld),sunCheck);
        });
    }
    function settleSun(origin,grabPoint){
        // At the horizon, keep the chosen longitude and leave a visible cap of
        // the sun. At a screen edge or inside a tree, recover the last usable position.
        const lift=horizon.sunLift(camera,world.sunTarget);
        if(lift>0)world.moveSunBy(0,lift);
        world.sunTarget.getWorldPosition(sunEnd);
        const dx=origin.x-sunEnd.x,dy=origin.y-sunEnd.y;
        if(!canGrabSun(0,0,grabPoint) && canGrabSun(dx,dy,grabPoint)){
            let hidden=0,visible=1;
            for(let i=0;i<6;i++){
                const t=(hidden+visible)*.5;
                if(canGrabSun(dx*t,dy*t,grabPoint))visible=t;else hidden=t;
            }
            world.moveSunBy(dx*visible,dy*visible);
        }
        followSun();
    }
    function pick(e,press=false){
        sample(e);
        const targets=place==='entrance'?entranceTargets:nearby[place];
        const first=ray.intersectObjects(targets,false).find(hit=>hit.object!==world.sunTarget ||
            (!horizon.coversSun(ray.ray) && (!press || !foregroundCoversSun(hit.distance))));
        if(!first)return null;
        const mesh=first.object;
        if(mesh===world.sunTarget)return {key:'sun',text:night?'拖动月亮':'拖动太阳',point:first.point};
        if(mesh.userData.destination && mesh.userData.destination!==place){
            const key=mesh.userData.destination;
            return {key,text:'走近'+ui.name(key)};
        }
        if(place==='entrance'){
            if(world.pathTargets.includes(mesh))return {key:'path',text:'沿路去喷泉'};
            const key=mesh.userData.destination || 'fountain';
            return {key,text:'走近'+ui.name(key)};
        }
        if(place==='fountain')return mesh===fountain.waterTarget?{key:'water',point:first.point,text:'划过池水'}:{key:'fountain',text:'进入喷泉舞厅'};
        if(poolTargets.includes(mesh))return {key:'fountain',text:'走近心灵喷泉'};
        return {key:place,text:ui.objectLabel()};
    }
    function action(){
        if(!visits.spots[place]||legs.length)return;
        ui.inspect(visits.action(place));
        shadowUntil=time+1.7;
        if(motion.matches)render(0);
    }
    function activate(hit){
        if(!hit)return;
        if(place==='entrance'){if(hit.key!=='sun')go(hit.key==='path'?'fountain':hit.key);}
        else if(place==='fountain'){
            if(hit.key==='water')fountain.ripple(hit.point,time);
            else if(hit.key==='fountain')ui.enter('fountain');
            else go(hit.key);
        }else if(hit.key===place)ui.useObject();
        else go(hit.key);
    }
    function endDrag(){
        if(!drag)return;
        const old=drag;
        drag=null;
        if(old.sun){
            world.endSunDrag();
            if(old.moved)settleSun(old.sunOrigin,old.grabPoint);
        }
        if(canvas.hasPointerCapture(old.id))canvas.releasePointerCapture(old.id);
    }
    canvas.addEventListener('pointerdown',e=>{
        if(lost||legs.length||e.button!==0||!e.isPrimary)return;
        const hit=pick(e,true);
        drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,moved:false,sun:hit?.key==='sun',down:hit?.key};
        if(drag.sun){
            drag.sunOrigin=world.sunTarget.getWorldPosition(vector());
            drag.grabPoint=world.sunTarget.worldToLocal(hit.point.clone());
            world.beginSunDrag(ray.ray);
        }
        canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
    },opts);
    canvas.addEventListener('pointermove',e=>{
        if(lost||legs.length)return;
        if(drag && drag.id===e.pointerId){
            if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4)drag.moved=true;
            if(drag.sun){
                sample(e);world.dragSun(ray.ray);followSun();hot='sun';ui.hover(null);
                if(motion.matches)render(0);
                return;
            }
            if(place==='fountain' && drag.moved){
                turnBy((drag.lastX-e.clientX)*circle/Math.max(480,canvas.clientWidth));
                drag.lastX=e.clientX;hot='';over=false;ui.hover(null);return;
            }
        }
        const hit=pick(e);
        hot=hit?.key||'';ui.hover(hit,e);
        if(place==='fountain' && hit?.key==='water' && !drag && e.pointerType!=='touch')fountain.ripple(hit.point,time);
    },opts);
    canvas.addEventListener('pointerup',e=>{
        if(!drag || drag.id!==e.pointerId)return;
        const canTap=!drag.moved&&!drag.sun&&!lost&&!legs.length,down=drag.down;
        endDrag();
        if(canTap){const hit=pick(e);if(hit?.key===down)activate(hit);}
    },opts);
    canvas.addEventListener('pointercancel',endDrag,opts);
    canvas.addEventListener('lostpointercapture',endDrag,opts);
    canvas.addEventListener('pointerleave',()=>{over=false;hot='';ui.hover(null);},opts);
    canvas.addEventListener('keydown',e=>{
        if(legs.length || lost)return;
        if(e.shiftKey && e.key.startsWith('Arrow')){
            const step=.85;
            const before=world.sunTarget.getWorldPosition(vector());
            world.moveSunBy(({ArrowLeft:-step,ArrowRight:step})[e.key]||0,({ArrowUp:step,ArrowDown:-step})[e.key]||0);
            settleSun(before);
            render(0);
        }else if(e.key==='Escape' && place!=='entrance')go('entrance');
        else if(place==='fountain' && e.key==='ArrowLeft')turnBy(-Math.PI/8);
        else if(place==='fountain' && e.key==='ArrowRight')turnBy(Math.PI/8);
        else if(place==='fountain' && e.key===' ')fountain.ripple(vector(1.72*Math.sin(angle),.66,1.72*Math.cos(angle)),time);
        else if(place==='fountain' && e.key==='Enter')ui.enter('fountain');
        else if(visits.spots[place] && e.key==='Enter')ui.enter(place);
        else if(visits.spots[place] && e.key===' ')action();
        else return;
        e.preventDefault();
    },opts);
    motion.addEventListener('change',()=>{
        stopOrbit();renderer.shadowMap.needsUpdate=true;
        if(motion.matches && legs.length)finish();
        lastRender=-Infinity;
    },opts);
    canvas.addEventListener('webglcontextlost',e=>{
        e.preventDefault();endDrag();lost=true;cancelAnimationFrame(frame);stopOrbit();
        ui.loss(destination);
    },opts);
    canvas.addEventListener('webglcontextrestored',()=>{
        if(disposed)return;
        lost=false;renderer.shadowMap.needsUpdate=true;visits.restore();setPlace(ui.restore(),false);resize();resume();
    },opts);
    const observer=new ResizeObserver(resize);
    observer.observe(canvas.parentElement);
    document.addEventListener('visibilitychange',resume,opts);
    window.addEventListener('pageshow',resume,opts);
    window.addEventListener('pagehide',e=>{
        cancelAnimationFrame(frame);if(e.persisted)return;
        disposed=true;observer.disconnect();stopListeners.abort();
        gilding.dispose();horizon.dispose();stock.dispose();visits.dispose();fountain.dispose();world.dispose();lighting.dispose();renderer.dispose();
    },opts);
    aimAt(homeEye,homeAim);resize();resume();
    return {go,finish,tour,turnBy,action};
}
