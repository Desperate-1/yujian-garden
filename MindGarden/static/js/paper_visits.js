import {portraits} from './host_silhouettes.js';
import {visitPages} from './paper_visit_pages.js';
import {batchHardware,dressMechanisms} from './paper_hardware.js';

// Draw the little editions at print resolution, in precisely the five scene inks.
// The frame, hinges, easel and exposed sides of the pages are separate solids.
function makePrint(p, subject) {
    const canvas = document.createElement('canvas');
    canvas.width = 768; canvas.height = 516;
    const c = canvas.getContext('2d');
    const fill = (data, color) => { c.fillStyle = p[color]; c.fill(new Path2D(data)); };
    function line(data, color, width) {
        c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = width;
        c.strokeStyle = p[color]; c.stroke(new Path2D(data));
    }
    function oval(x,y,rx,ry,color,angle=0) {
        c.beginPath(); c.ellipse(x,y,rx,ry,angle,0,2*Math.PI); c.fillStyle=p[color]; c.fill();
    }
    function leaf(x,y,angle,size,color,vein=false) {
        c.save(); c.translate(x,y); c.rotate(angle); c.scale(size,size);
        fill('M0 0 Q-22 -19 -3 -60 Q20 -35 0 0Z',color);
        if (vein) line('M0 -4 Q-2 -22 -3 -51','paper',1.3);
        c.restore();
    }
    function stem(x,y,scale,lean,color) {
        c.save(); c.translate(x,y); c.scale(scale,scale); c.rotate(lean);
        line('M0 0 Q3 -76 -9 -177',color,3);
        for (let i=0;i<6;i++) {
            leaf(-2-i*.9,-24-i*23,-.65-i*.07,.53-i*.035,color);
            leaf(-1-i*1.4,-34-i*22,.7+i*.04,.49-i*.035,color);
        }
        c.restore();
    }
    function marks(x,y,w,n,color) {
        for (let i=0;i<n;i++) {
            const dx=x+(i*79%w),dy=y+(i*57%26);
            line('M'+dx+' '+dy+' q10 3 24 -1',color,1.8);
        }
    }
    c.fillStyle=p.paper; c.fillRect(0,0,768,516);
    if (subject === 'note') {
        c.save(); c.translate(14,0);
        stem(123,428,1.45,.17,'leaf'); stem(115,415,.96,-.28,'ink');
        oval(148,183,12,14,'gold'); oval(94,221,10,12,'gold');
        line('M48 451 Q123 444 200 447','leaf',2); c.restore();
        c.fillStyle=p.ink; c.font='52px KaiTi, "Kaiti SC", SimSun, serif';
        c.fillText('今天，有哪件小事',251,243);
        c.fillText('值得记住？',253,320);
        line('M251 145 Q350 141 406 144','gold',3);
        c.strokeStyle=p.leaf;c.lineWidth=2;c.strokeRect(33,30,701,451);
        return canvas;
    }
    const border=new Path2D('M33 32 Q377 26 736 35 L733 438 Q420 445 32 435Z');
    c.fillStyle=p[subject===0?'sky':subject===1?'ink':'leaf'];c.fill(border);
    c.save(); c.clip(border);
    if (subject===0) {
        oval(569,128,62,59,'gold');
        fill('M24 327 Q193 259 348 307 Q460 348 590 300 Q664 273 748 298 L756 451 L18 448Z','leaf');
        fill('M20 362 Q248 295 409 355 Q523 390 747 333 L747 446 L20 450Z','paper');
        marks(75,363,603,39,'sky'); marks(352,396,303,21,'leaf');
        stem(133,449,1.35,-.19,'ink');stem(192,446,.97,.15,'leaf');stem(93,437,.79,-.26,'leaf');
        line('M438 287 L451 339 L448 386 M417 291 L409 334 L394 381 M446 385 l24 2 M394 381 l-14 6','ink',5);
        fill('M364 276 Q395 253 423 257 Q447 243 453 221 Q462 200 448 185 Q425 163 430 145 Q436 119 475 125 Q497 127 498 139 L482 149 Q458 148 458 160 Q456 170 480 196 Q505 227 476 263 Q449 304 405 300 L367 292 L341 300Z','paper');
        fill('M370 278 Q398 250 437 262 Q417 283 378 286 L352 295Z','sky');
        line('M368 282 Q397 272 418 266 M377 286 Q402 277 416 274','ink',2);
        fill('M490 134 L548 142 L490 144Z','gold');oval(483,137,3.8,3.8,'ink');
        line('M452 131 Q435 124 425 107 M457 129 Q443 118 440 101','paper',3);
    } else if (subject===1) {
        line('M0 402 Q218 366 380 282 Q521 206 747 78','gold',12);
        line('M243 333 Q239 269 192 198 M433 253 Q493 252 586 278 M525 203 Q523 150 494 105','gold',4);
        for (const [x,y,a,s] of [[201,217,-.8,1.1],[223,252,.4,1.0],[266,323,-.45,1.2],[496,117,-.6,.9],[511,145,.57,.85],[538,192,.35,.94],[575,170,1,1.02],[576,274,1.48,1.25],[534,259,1.97,1],[649,131,1.04,1.04]]) leaf(x,y,a,s,'leaf',true);
        for (const [x,y] of [[250,349],[286,326],[458,240],[477,220],[645,134]]) {
            line('M'+x+' '+y+' q5 22 -8 42 M'+(x+1)+' '+y+' q21 22 21 37','paper',2);
            oval(x-8,y+44,11,12,'gold');oval(x+21,y+39,10,11,'gold');
            oval(x-11,y+40,3,2,'paper');oval(x+18,y+35,2.8,2,'paper');
        }
        line('M362 272 l-7 17 -14 3 M378 260 l6 16 -7 10','paper',3);
        fill('M278 288 L329 232 Q337 202 359 180 Q378 154 405 163 Q430 171 420 195 Q425 209 399 242 Q377 276 334 273Z','paper');
        fill('M336 243 Q351 203 389 200 Q371 232 348 246 L318 265Z','sky');
        fill('M370 172 Q393 149 413 169 Q428 179 419 192 L394 186 L382 190Z','leaf');
        fill('M418 180 L439 174 L421 188Z','gold');oval(410,179,3.7,3.7,'ink');
        line('M334 251 Q355 232 374 214 M337 254 Q358 239 368 229','ink',2);
    } else {
        fill('M22 151 Q218 107 390 139 Q577 163 760 108 L757 445 L22 444Z','sky');
        marks(58,340,641,44,'paper');marks(47,263,627,36,'leaf');
        fill('M75 333 C32 282 97 242 166 251 Q241 258 253 315 C241 361 169 371 126 352 L142 313Z','leaf');
        line('M143 309 Q148 281 151 266 M142 311 L94 282 M142 314 L91 329 M146 315 L212 327','ink',2);
        fill('M438 405 Q520 317 624 345 Q675 370 682 417 Q573 440 499 420 L554 381Z','leaf');
        line('M396 420 Q420 357 400 284','ink',6);
        for (const [a,s] of [[-1.11,.99],[-.71,1.13],[.88,1.10],[1.24,.92],[-.28,1.18],[.35,1.22]]) {
            c.save();c.translate(399,291);c.rotate(a);c.scale(s,s);
            fill('M0 0 Q-28 -21 -8 -76 Q22 -44 16 -18Z','paper');
            line('M1 -6 Q-6 -28 -6 -58','gold',2);c.restore();
        }
        oval(401,290,20,8,'gold');
        c.save();c.translate(500,155);c.rotate(-.22);
        for(const a of [-.55,-.24,.24,.55]) {c.save();c.rotate(a);oval(-14,-4,42,4.2,'paper');c.restore();}
        line('M-28 0 L40 2','ink',3.6);oval(43,2,6,5,'gold');c.restore();
    }
    c.restore();
    const names=['浅 汀','枝 头','池 上'];
    c.fillStyle=p.ink;c.font='32px KaiTi, "Kaiti SC", SimSun, serif';c.fillText(names[subject],36,489);
    c.font='italic 21px Georgia, serif';c.textAlign='right';c.fillText(['白鹭','山雀','莲花'][subject],728,488);
    return canvas;
}

export function buildVisits(T,scene,palette,state={candy:0,journal:0,gallery:0}) {
    const root=new T.Group();
    root.name='纸景互动道具';scene.add(root);
    const geometries=new Set(), paints=new Map(), extraMaterials=[], textures=[];
    const V=(x,y,z)=>new T.Vector3(x,y,z);
    function group(parent,x=0,y=0,z=0,yaw=0) {
        const g=new T.Group();g.position.set(x,y,z);g.rotation.y=yaw;parent.add(g);return g;
    }
    function paint(name) {
        if (!paints.has(name)) paints.set(name,new T.MeshLambertMaterial({color:palette[name],side:T.DoubleSide}));
        return paints.get(name);
    }
    function mesh(parent,geo,material,x=0,y=0,z=0) {
        geometries.add(geo);
        const obj=new T.Mesh(geo,typeof material==='string'?paint(material):material);
        obj.position.set(x,y,z);parent.add(obj);return obj;
    }
    const unitBox=new T.BoxGeometry();
    const unitRod=new T.CylinderGeometry(1,1,1,8);
    function box(parent,color,x,y,z,w,h,d) {
        const m=mesh(parent,unitBox,color,x,y,z);m.scale.set(w,h,d);return m;
    }
    function rod(parent,color,from,to,r) {
        const a=V(...from),b=V(...to), delta=b.clone().sub(a);
        const m=mesh(parent,unitRod,color);m.position.copy(a).lerp(b,.5);
        m.quaternion.setFromUnitVectors(V(0,1,0),delta.clone().normalize());m.scale.set(r,delta.length(),r);return m;
    }
    function silhouette(parent,color,points,depth,x=0,y=0,z=0) {
        const shape=new T.Shape(points.map(([a,b])=>new T.Vector2(a,b)));
        const geo=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:5});
        geo.translate(0,0,-depth/2);return mesh(parent,geo,color,x,y,z);
    }
    function artTexture(canvas) {
        const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=2;
        textures.push(tex);return tex;
    }
    function surface(parent,w,h,map,x,y,z) {
        const material=new T.MeshBasicMaterial({map,side:T.FrontSide});
        extraMaterials.push(material);return mesh(parent,new T.PlaneGeometry(w,h),material,x,y,z);
    }
    function pointAt(node,x,y,z) { return node.localToWorld(V(x,y,z)); }
    const hitMeshes={};
    function hitBox(parent,key,x,y,z,w,h,d) {
        const hit=box(parent,'gold',x,y,z,w,h,d);hit.name=key+'-visit-hit';
        hit.visible=false;hitMeshes[key]=[...(hitMeshes[key]||[]),hit];return hit;
    }
    let doorMotion=0,letterMotion=0,printTurn=0,knockAge=Infinity,disposed=false;
    const clamp=t=>Math.min(1,Math.max(0,t));
    const ease=t=>{t=clamp(t);return t*t*(3-2*t);};
    function tend(current,target,speed,dt) {
        const step=Math.min(Math.abs(target-current),Math.max(0,dt)*speed);
        return current+Math.sign(target-current)*step;
    }
    // The little brass pear knocker, hanging from a pin on the hinged door.
    const house=group(root,-9.9,0,-4.7,.34);
    const door=group(house,-.635,.19,1.965);
    const doorShape=[[0,0],[.80,.012],[.80,1.37]];
    for(let i=1;i<=16;i++) {
        const a=i*Math.PI/16;doorShape.push([.40+.40*Math.cos(a),1.37+.39*Math.sin(a)]);
    }
    silhouette(door,'leaf',doorShape,.065);
    // The lit alcove is cut to the same arch. Its curtain and crockery are
    // uncovered progressively as the door swings on the outside hinge.
    const alcove=group(house,-.635,.19,1.877);
    silhouette(alcove,'gold',doorShape.map(([x,y])=>[.025+.94*x,.015+.96*y]),.014);
    silhouette(alcove,'leaf',[[.025,.10],[.15,.13],[.22,.78],[.14,1.02],[.29,1.62],[.18,1.56],[.07,1.45],[.025,1.32]],.014,0,0,.020);
    silhouette(alcove,'ink',[[.15,.57],[.76,.58],[.75,.52],[.19,.50]],.019,0,0,.027);
    silhouette(alcove,'paper',[[.44,.60],[.58,.61],[.60,.71],[.42,.72]],.018,0,0,.032);
    const cupHandle=mesh(alcove,new T.TorusGeometry(.048,.014,5,12),'paper',.594,.67,.036);
    cupHandle.scale.set(1,.75,1);
    box(alcove,'ink',.52,.586,.038,.23,.015,.023);
    const windowLight=new T.MeshBasicMaterial({color:palette.paper,transparent:true,depthWrite:false,opacity:0});
    extraMaterials.push(windowLight);
    for(const [x,y,w,h] of [[-1.55,1.03,.82,.97],[1.32,.97,.85,1.01]]) {
        const r=w*.43,coords=[[-r,.09],[r,.09],[r,h-r]];
        for(let i=1;i<=14;i++){const a=Math.PI*i/14;coords.push([Math.cos(a)*r,h-r+Math.sin(a)*r]);}
        silhouette(house,windowLight,coords,.004,x,y,1.884);
    }
    for(let i=1;i<6;i++) {
        const x=i*.132,h=1.345+Math.sqrt(Math.max(0,.143-(x-.4)**2));
        box(door,'ink',x,h/2,.036,.010,h-.045,.009);
    }
    for(const y of [.27,1.25]) {
        silhouette(door,'ink',[[0,-.048],[.19,-.042],[.25,0],[.18,.045],[0,.046]],.024,.005,y,.052);
    }
    const latch=group(door,.53,.91,.092);
    const doorHit=hitBox(house,'candy',-.20,1.05,2.04,1.53,2,.72);

    const guest=group(house,-.20,.18,1.87);
    const theme=document.documentElement.dataset.theme;
    const {aspect,edge}=portraits[theme] || portraits.cute;
    const portraitMap=new T.TextureLoader().load(new URL('../garden/hosts/'+theme+'.webp',import.meta.url).href);
    portraitMap.colorSpace=T.SRGBColorSpace;portraitMap.anisotropy=2;textures.push(portraitMap);
    const portrait=surface(guest,aspect*1.74,1.74,portraitMap,0,.87,.024);
    portrait.material.alphaTest=.35;
    // The envelope rises from the hollow. Its flap opens and the illustrated
    // note slides up behind the pocket, like a pull-tab in a movable book.
    const trunk=group(root,-6.4,0,-13,-.32);
    const letter=group(trunk,.05,.44,1.04);
    const pocket=[[-.64,-.32],[.60,-.34],[.65,.24],[.62,.31],[-.63,.30]];
    silhouette(letter,'ink',pocket,.045);
    const slip=group(letter,0,.04,0);
    const noteShape=[[-.60,0],[.59,0],[.59,.78],[-.58,.80]];
    silhouette(slip,'paper',noteShape,.032);
    surface(slip,1.14,.742,artTexture(makePrint(palette,'note')),0,.392,.018);
    silhouette(letter,'paper',[[-.64,-.32],[.60,-.34],[.64,.24],[.03,-.04],[-.63,.25]],.035,0,0,.049);
    rod(letter,'gold',[-.61,-.27,.070],[-.08,.025,.070],.009);
    rod(letter,'gold',[.59,-.28,.070],[.095,.015,.070],.009);
    const flap=group(letter,0,.29,.077);
    silhouette(flap,'leaf',[[-.63,0],[.62,0],[.06,-.392],[-.025,-.411]],.025);
    // The closed and opened note share a pull area and a visible gold outline.
    const letterHit=hitBox(letter,'journal',0,.01,.13,1.31,.75,.33);
    const letterEdge=group(letter,0,-.34,0);

    // A freestanding trunnion stand. Both sides carry a print so the artwork
    // remains visible throughout each turn, even when the user reverses course.
    const arcade=group(root,8,0,-12.7,-.23);
    const stand=group(arcade,.30,0,2.50,-.045);
    for(const side of [-1,1]) {
        rod(stand,'ink',[side*1.21,.09,.52],[side*.96,2.27,-.02],.053);
        rod(stand,'leaf',[side*1.17,.08,-.43],[side*.96,2.11,-.02],.045);
        box(stand,'gold',side*1.10,.10,.12,.24,.11,1.14);
    }
    rod(stand,'gold',[-1.03,1.51,0],[1.03,1.51,0],.042);
    const frame=group(stand,0,1.51,0);
    box(frame,'ink',0,0,0,1.88,1.35,.11);
    box(frame,'gold',0,0,.052,1.84,1.31,.05);box(frame,'gold',0,0,-.052,1.84,1.31,.05);
    const prints=[0,1,2].map(i=>artTexture(makePrint(palette,i)));
    const recto=surface(frame,1.76,1.19,prints[0],0,0,.080);
    const verso=surface(frame,1.76,1.19,prints[1],0,0,-.080);
    verso.rotation.y=Math.PI;verso.rotation.z=Math.PI;
    hitBox(stand,'gallery',0,1.52,0,1.98,1.50,1.40);
    dressMechanisms(T,{mesh,silhouette,rod},door,latch,letter,flap,stand,frame);
    batchHardware(T,root,paints,geometries,extraMaterials);
    const spots={
        candy:{eye:V(-5.30,2.12,2.80),aim:pointAt(house,-.12,2.19,1.27),
            focus:pointAt(house,-.19,1.13,2.06),radius:1.01,outlineParent:door,
            outline:doorShape.map(([x,y])=>V(x,y,.12)),
            revealed:{parent:guest,points:edge.map(([x,y])=>V(x,y,.048)),visible:()=>guest.visible}},
        journal:{eye:V(-6.12,1.98,-6.67),aim:pointAt(trunk,0,1.51,.96),
            focus:pointAt(trunk,.05,1.13,1.16),radius:.98,outlineParent:letterEdge,
            outline:pocket.map(([x,y])=>V(x,y+.34,.11)),
            revealed:{parent:slip,points:noteShape.map(([x,y])=>V(x,y,.033)),visible:()=>letterMotion>.55}},
        gallery:{eye:V(4.12,2.30,-3.92),aim:pointAt(arcade,.20,2.47,1.65),
            focus:pointAt(stand,0,1.51,0),radius:1.18,outlineParent:frame,
            outline:[V(-.974,-.701,.112),V(.974,-.701,.112),V(.974,.701,.112),V(-.974,.701,.112)],
            revealed:{parent:frame,points:[V(-.974,-.701,-.112),V(.974,-.701,-.112),V(.974,.701,-.112),V(-.974,.701,-.112)],
                visible:()=>Math.cos(frame.rotation.x)<0}}
    };
    function describe(key) { return visitPages[key]?.[state[key]]; }
    let requestedTurn=0;
    function action(key) {
        if(!Object.hasOwn(visitPages,key))return;
        state[key]=(state[key]+1)%visitPages[key].length;
        if(key==='candy')knockAge=state.candy?0:Infinity;
        if(key==='gallery')requestedTurn++;
        return describe(key);
    }
    function update(dt,reduced=false) {
        dt=Math.min(.25,Math.max(0,dt||0));
        knockAge+=dt;
        const opening=state.candy && (knockAge>=.28 || reduced) ? 1 : 0;
        doorMotion=reduced?state.candy:tend(doorMotion,opening,1.19,dt);
        const welcome=ease(doorMotion);
        doorHit.position.set(-.20+.19*welcome,1.05,2.04+.44*welcome);
        doorHit.scale.x=1.53+.32*welcome;
        latch.rotation.x=(!reduced && knockAge<.32) ? -.89*Math.sin(knockAge/.32*Math.PI*2)**2 : 0;
        door.rotation.y=-1.54*welcome;
        windowLight.opacity = theme === 'cute' ? .67 * welcome : 0;
        guest.visible=welcome>.15;
        guest.position.set(-.21+.41*welcome,.18+.09*Math.sin(welcome*Math.PI),1.86+.79*welcome);
        guest.rotation.z=-.055*Math.sin(welcome*Math.PI);

        letterMotion=reduced?state.journal:tend(letterMotion,state.journal,1.07,dt);
        const pull=ease(letterMotion), unfold=ease((letterMotion-.24)/.76);
        letter.position.set(.05+.21*pull,.53+.57*pull,1.04+1.15*pull);
        letter.rotation.set(-.12+.07*pull,.07+.09*pull,.17*(1-pull));
        letter.scale.setScalar(.58+.72*pull);
        flap.rotation.x=Math.PI*.85*ease(letterMotion/.65);
        slip.position.y=-.21+.65*unfold;
        slip.scale.y=.52+.61*unfold;
        letterHit.position.y=.02+.46*unfold;
        letterHit.scale.y=.76+.98*unfold;
        letterEdge.scale.y=1+1.58*unfold;

        printTurn=reduced?requestedTurn:tend(printTurn,requestedTurn,1.06*Math.max(1,requestedTurn-printTurn),dt);
        const index=Math.floor(printTurn),phase=ease(printTurn-index);
        frame.rotation.x=Math.PI*(index+phase);
        recto.material.map=prints[(index+(index%2))%3];
        verso.material.map=prints[(index+(index%2?0:1))%3];
    }
    update(0,true);
    function restore(){
        knockAge=Infinity;requestedTurn=state.gallery;update(0,true);
    }
    return {spots,describe,action,update,restore,targets:key=>hitMeshes[key]||[],dispose(){
        disposed=true;root.removeFromParent();
        for(const item of geometries)item.dispose();
        for(const item of [...paints.values(),...extraMaterials,...textures])item.dispose();
    }};
}
