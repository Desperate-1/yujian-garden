import { mergeGeometries } from '../vendor/mediapipe/BufferGeometryUtils.js';
import { buildParkBench } from './paper_hardware.js';
import {layShoppingStreet} from './anime_street.js';
import {dressRoadside} from './anime_roadside.js';
import { plantMeadow } from './paper_meadow.js';
import {buildAnimeQuarter,dressAnimeCafe,dressAnimeGallery,quarterTreeClearance} from './anime_quarter.js';
import {driftingPetals} from './anime_botany_petals.js';
import { leafBreeze } from './paper_leaf_wind.js';
import { dressTree, woodlandSpecies } from './paper_cuts.js';

// Assemble the shops, street furniture, planting and interactive landmarks in one
// coordinate system. The fountain is at the origin and the entrance lies south.
export function buildWorld(T, scene, palette) {
    const root = new T.Group(), moving = new T.Group();
    scene.add(root, moving);
    const {paper,leaf,ink,gold,sky,blossom=gold}=palette;
    const materials = new Map(), originals = new Set();
    const pathTargets = [], spotTargets = [], glowOutlines = {};
    const box = new T.BoxGeometry(1, 1, 1);
    const dowel = new T.CylinderGeometry(1, 1, 1, 7);
    const v = (x, y, z) => new T.Vector3(x, y, z);
    const tau = 2 * Math.PI;
    let seed = 90315;
    function random() { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; }
    function between(a,b) { return a + (b-a)*random(); }
    function mat(color, unlit = false) {
        const key = color + (unlit ? 'flat' : '');
        if (!materials.has(key)) {
            const options = {color, side:T.DoubleSide};
            materials.set(key, unlit ? new T.MeshBasicMaterial(options) : new T.MeshLambertMaterial(options));
        }
        return materials.get(key);
    }
    function mesh(parent, geometry, color, x=0, y=0, z=0, unlit=false) {
        originals.add(geometry);
        const m = new T.Mesh(geometry,mat(color,unlit));
        m.position.set(x,y,z); parent.add(m); return m;
    }
    function group(parent,x,y,z, yaw=0) {
        const g = new T.Group(); g.position.set(x,y,z); g.rotation.y=yaw; parent.add(g); return g;
    }
    function block(parent,color,x,y,z,w,h,d) {
        const m=mesh(parent,box,color,x,y,z); m.scale.set(w,h,d); return m;
    }
    function rod(parent,color,a,b,r) {
        const A=v(...a), B=v(...b), delta=B.clone().sub(A), len=delta.length();
        const m=mesh(parent,dowel,color); m.position.copy(A.add(B).multiplyScalar(.5));
        m.quaternion.setFromUnitVectors(v(0,1,0),delta.normalize()); m.scale.set(r,len,r); return m;
    }
    function polygon(points) {
        const s=new T.Shape(); s.moveTo(...points[0]); for(const p of points.slice(1)) s.lineTo(...p);
        s.closePath(); return s;
    }
    function cut(shape,thick=.075) {
        const g=new T.ExtrudeGeometry(shape,{depth:thick,bevelEnabled:false,curveSegments:5});
        g.translate(0,0,-thick/2); return g;
    }
    function disk(r,segments=28) { return new T.CylinderGeometry(r,r,1,segments); }
    const round=disk(1);
    function coin(parent,color,x,y,z,rx,ry,depth) {
        const m=mesh(parent,round,color,x,y,z);
        m.rotation.x=Math.PI/2; m.scale.set(rx,depth,ry); return m;
    }
    function bed(parent,color,x,z,rx,rz,y=.015) {
        const m=mesh(parent,round,color,x,y,z);
        m.scale.set(rx,.035,rz);return m;
    }
    function proxy(x,y,z,w,h,d,destination) {
        const m=mesh(moving,box,ink,x,y,z);
        m.scale.set(w,h,d);m.visible=false;m.userData.destination=destination;spotTargets.push(m);
    }

    const subsoil=new T.Color(paper).lerp(new T.Color(ink),.49).getHex();
    const lawn=block(root,subsoil,0,-.36,0,170,.64,170);
    // Vegetation and turf share the leaf ink. Only the turf takes the root-bed impression.
    const lawnStock=lawn.material.clone();
    lawn.material=lawnStock;

    // Broad irregular ribbons meet the annular path flush, so it can be approached from any side.
    const curve = new T.CatmullRomCurve3([[1,0,24],[1,0,21],[-1,0,15],[-2.7,0,11],[-1.3,0,8.3],[0,0,6.3],[2,0,5]].map(p=>v(...p)));
    function ribbon(curve,width,y,color) {
        const vertices=[],indices=[];
        for(let i=0;i<=64;i++) {
            const t=i/64, p=curve.getPointAt(t), f=curve.getTangentAt(t);
            const w=width*(1+.12*Math.sin(t*4)+.055*Math.sin(t*18));
            for(const sign of [-1,1]) vertices.push(p.x+sign*f.z*w,y,p.z-sign*f.x*w);
            const j=i*2;if(i<64)indices.push(j,j+2,j+1,j+1,j+2,j+3);
        }
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return mesh(root,g,color);
    }
    function ringPath(inner,outer,y,color) {
        const m=mesh(root,new T.RingGeometry(inner,outer,84),color,0,y,0);
        m.rotation.x=-Math.PI/2;return m;
    }
    const targets=[ribbon(curve,1.45,.052,paper),ringPath(3.35,6.35,.060,paper)];
    targets.forEach(m=>{m.userData.keep=true;pathTargets.push(m);});
    targets.forEach(m=>{m.visible=false;});
    // These walks also reserve the approaches to the four landmarks.
    const walks=[
        [[-4.9,0,-3.5],[-6.22,0,-3.52],[-7.58,0,-2.87],[-9.01,0,-2.13]],
        [[-2.9,0,-5.20],[-3.56,0,-7.11],[-5.72,0,-9.13],[-6.72,0,-11.01]],
        [[3.54,0,-4.93],[5.62,0,-5.95],[6.39,0,-8.04],[7.21,0,-9.96]]
    ];
    // Leaves have a raised central fold, two faces and a visible cut edge.
    function foldedBlade(stations) {
        const vertices=[],indices=[];
        for(const [y,w,x,z] of stations){
            vertices.push(x-w,y,z-.30*w, x,y,z+.22*w, x+w*.86,y-.01*w,z-.45*w, x,y,z-.018);
        }
        for(let i=0;i<stations.length-1;i++)for(let j=0;j<4;j++){
            const p=i*4+j,q=i*4+(j+1)%4;
            indices.push(p,q,q+4,p,q+4,p+4);
        }
        const g=new T.BufferGeometry();
        g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;
    }
    const blade=foldedBlade([[0,.008,0,0],[.20,.112,-.013,.044],[.44,.176,-.018,.088],
        [.65,.166,.002,.106],[.82,.103,.032,.097],[1,.002,.070,.056]]);
    // The basal rosettes turn outward at the tips. They sit below the upright flowers and oats.
    const basalLeaf=foldedBlade([[0,.006,0,0],[.14,.042,-.006,.02],[.34,.094,-.021,.066],
        [.53,.126,-.035,.151],[.70,.118,-.019,.268],[.80,.079,.017,.396],
        [.84,.041,.049,.512],[.81,.002,.084,.618]]);
    function foliage(parent,color,x,y,z,size,lean,yaw=0,wide=1,geometry=blade) {
        const m=mesh(parent,geometry,color,x,y,z);m.rotation.set(0,yaw,lean,'YXZ');m.scale.set(size*wide,size,size);return m;
    }
    const kit={T,paper,leaf,ink,gold,sky,blossom,mesh,group,block,rod,foliage,coin,polygon,cut};
    const street=layShoppingStreet(kit,root),roadside=dressRoadside(kit,root);
    const species=woodlandSpecies(kit);
    const leafInstances=new Map();
    function livingLeaf(parent,color,x,y,z,size,lean,yaw,wide,geometry=blade,pitch=-.16) {
        const pose=new T.Object3D();
        pose.position.set(x,y,z);pose.rotation.set(pitch,yaw,lean,'YXZ');pose.scale.set(size*wide,size,size);
        parent.updateWorldMatrix(true,false);pose.updateMatrix();
        const matrix=parent.matrixWorld.clone().multiply(pose.matrix);
        const tip=v(0,.64,0).applyMatrix4(matrix);
        const onGround=geometry===blade || geometry===basalLeaf;
        // Cull a whole crown when a visitor turns away from it. Keep the much
        // smaller rosettes together so they still cost a single draw per shape.
        const key=onGround?geometry:parent;
        if(!leafInstances.has(key))leafInstances.set(key,{geometry,leaves:[]});
        originals.add(geometry);
        leafInstances.get(key).leaves.push({matrix,tip,color:mat(color).color,size:matrix.getMaxScaleOnAxis(),
            phase:onGround?between(0,tau):tip.x*.97+tip.y*1.54+tip.z*.63,flutter:0});
    }
    function outline(parent,key,points) {
        parent.updateWorldMatrix(true,false);
        glowOutlines[key]=points.map(point=>v(...point).applyMatrix4(parent.matrixWorld));
    }
    function tree(x,z,size,yaw,detail=true,hollow=false,kind='oak') {
        const g=group(root,x,0,z,yaw);g.scale.setScalar(size);
        if(kind!=='oak') {species[kind](g,detail,livingLeaf);return;}
        species.oak(g,detail,livingLeaf,hollow);
        if(hollow){
            outline(g,'journal',dressTree(g,kit));
        }
    }
    tree(-6.4,-13,2.35,-.32,true,true);
    proxy(-6.4,3.5,-13,6,7.2,3,'journal');
    // Street trees stand in kerbside beds or in the gardens behind the shop fronts.
    const trees=[
        [-7.2,10.2,1.34,-.27,'sakura'],[7.1,12.3,1.62,1.72,'sakura'],
        [-7.0,21.5,1.52,2.36,'sakura'],[6.4,3.8,.94,-1.2,'oak'],
        [5.42,-23.5,1.25,.8,'sakura'],[-5.35,-25.5,1.25,-.2,'sakura'],
        [-5.34,-34.5,1.23,.3,'sakura'],[5.42,-36.3,1.28,.69,'sakura']
    ];
    for(const [x,z,size,angle,kind] of trees)tree(x,z,size,angle,true,false,kind);
    seed=3169371518;
    for(let i=0;i<17;i++){
        const a=i/17*tau,r=between(30,37);
        const x=Math.sin(a)*r,z=Math.cos(a)*r,size=between(.98,1.54);
        if(quarterTreeClearance(x,z)>size*2.25+.25 && Math.abs(x)>10)
            tree(x,z,size,a,false,false,i%4===0?'sakura':'oak');
    }

    // Paper flower heads folded back from the centre. Clusters intentionally leave breathing space.
    const petal=new T.BufferGeometry(),petalVertices=[],petalIndex=[];
    // Longitudinal valleys let light travel into the cup. The silhouette carries
    // the small notch of a cosmos ray and the underside follows the curled face.
    const petalProfile=[[0,.019,0],[.09,.067,-.022],[.20,.129,-.040],
        [.32,.146,-.016],[.40,.120,.026],[.446,.067,.050]];
    for(const [i,[y,w,z]] of petalProfile.entries()) {
        const tip=i===petalProfile.length-1;
        for(const t of [-1,-.53,0,.53,1]){
            const cross=Math.abs(t);
            const lip=tip ? -.020*Math.cos(t*Math.PI*2)-.024*cross*cross : 0;
            petalVertices.push(w*t,y+lip+.006*t,z+cross*cross*w*.43-.018*(1-cross));
        }
    }
    const topCount=petalVertices.length/3;
    for(let i=0;i<topCount;i++)petalVertices.push(petalVertices[3*i],petalVertices[3*i+1],petalVertices[3*i+2]-.018);
    for(let i=0;i<petalProfile.length-1;i++){
        for(let j=0;j<4;j++){
            const a=i*5+j,b=topCount+a;
            petalIndex.push(a,a+1,a+6,a,a+6,a+5,b,b+6,b+1,b,b+5,b+6);
        }
        for(const edge of [0,4]){
            const a=i*5+edge,b=a+topCount;petalIndex.push(a,b,b+5,a,b+5,a+5);
        }
    }
    for(let j=0;j<4;j++){
        const a=topCount-5+j,b=a+topCount;petalIndex.push(a,a+1,b+1,a,b+1,b);
    }
    petal.setAttribute('position',new T.Float32BufferAttribute(petalVertices,3));petal.setIndex(petalIndex);petal.computeVertexNormals();
    const pollen=new T.SphereGeometry(1,9,6);
    const anther=new T.IcosahedronGeometry(1,0);
    const amber=new T.Color(gold).lerp(new T.Color(blossom),.31).getHex();
    const deepLeaf=new T.Color(leaf).lerp(new T.Color(ink),.36).getHex();
    const shrubs=[];
    function plantPatch(x,z,scale,flowers,count,canMove=false) {
        const patch=group(canMove?moving:root,x,0,z);
        const ground=bed(root,leaf,x,z,scale*.95,scale*.63,.02);
        ground.rotation.y=x;
        for(let i=0;i<count;i++){
            const px=between(-.82,.82)*scale,pz=between(-.47,.47)*scale;
            const color=i===7?deepLeaf:leaf;
            const height=between(.42,.89)*scale;
            const yaw=between(-.75,.75)+Math.atan2(x,z)*.4;
            for(let j=0;j<3;j++){
                const args=[patch,color,px,0,pz,height*between(.76,1.09),(j-1)*.48+between(-.20,.20),
                    yaw+j*2.09+between(-.6,.6),between(.73,1.14),basalLeaf];
                if(j===1 && !canMove)livingLeaf(...args);
                else foliage(...args);
            }
            if(i<flowers) {
                const h=height*between(1.2,1.7), ox=between(-.18,.18)*scale;
                rod(patch,ink,[px,0,pz],[px+ox,h,pz],.014*scale);
                for(let k=0;k<2;k++){
                    const t=.28+.24*k;
                    foliage(patch,leaf,px+ox*t,h*t,pz,h*(.39-.11*k),k?.90:-.83,yaw+i*.7+k*2.8,.74,basalLeaf);
                }
                const bloom=group(patch,px+ox,h,pz,yaw);
                bloom.rotation.x=between(-.58,-.17);
                const n=i%3===0?5:7;
                for(let j=0;j<n;j++){
                    const m=mesh(bloom,petal,[paper,blossom,gold][i%3],0,0,0);
                    m.rotation.set(between(-.28,.12),.08,j/n*tau+between(-.13,.13),'ZXY');
                    m.scale.setScalar(scale*between(.36,.54));
                }
                const cone=mesh(bloom,pollen,i%3===2?amber:gold,0,0,.038*scale);
                cone.scale.set(.078*scale,.078*scale,.046*scale);
                if(scale>1.18) for(let k=0;k<10;k++){
                    const a=k*2.39996,r=.057*Math.sqrt((k+.5)/10);
                    const floret=mesh(bloom,anther,k%5===0?paper:gold,Math.cos(a)*r*scale,Math.sin(a)*r*scale,(.078-.35*r)*scale);
                    floret.scale.set(.009*scale,.012*scale,.010*scale);
                }
            }
        }
        if(canMove)shrubs.push({group:patch,phase:random()*tau,x,z});
    }
    const patches=[[-7.40,11.45,.58,4],[7.14,13.38,.65,5],[-6.91,20.23,.61,3],
        [-6.15,-14.44,.49,4],[6.49,4.67,.47,4],[7.24,-22.04,.54,4]];
    patches.forEach(([x,z,size,n],i)=>plantPatch(x,z,size,n,6,i===0||i===1));

    const house=group(root,-9.9,0,-4.7,.34);
    dressAnimeCafe(kit,house);
    outline(house,'candy',[[-.78,.15,1.97],[-.78,1.83,1.97],[-.56,2.13,1.97],
        [.06,2.13,1.97],[.30,1.84,1.97],[.30,.15,1.97]]);
    proxy(-9.9,2.5,-4.7,5.6,5.0,4.1,'candy');

    const gallery=group(root,8,0,-12.7,-.23);
    dressAnimeGallery(kit,gallery);
    const turret=group(gallery,.68,0,.24);
    coin(turret,ink,0,4.28,.76,.65,.65,.12);
    coin(turret,paper,0,4.28,.835,.565,.565,.06);
    for(let i=0;i<12;i++) {
        const a=i*tau/12;
        const tick=block(turret,ink,.463*Math.sin(a),4.28+.463*Math.cos(a),.895,
            i%3===0?.055:.025,i%3===0?.105:.063,.018);tick.rotation.z=-a;
    }
    root.updateMatrixWorld(true);
    const handsFrame=group(moving,0,0,0);
    const dial=group(turret,0,4.28,.927);
    dial.updateWorldMatrix(true,false);
    dial.matrixWorld.decompose(handsFrame.position,handsFrame.quaternion,handsFrame.scale);
    const hours=group(handsFrame,0,0,0),minutes=group(handsFrame,0,0,.015);
    block(hours,ink,0,.127,0,.062,.31,.03);block(minutes,ink,0,.187,0,.034,.455,.026);
    const seconds=group(handsFrame,0,0,.040);
    seconds.name='Gallery clock second hand';
    const needle=cut(polygon([[-.017,-.14],[.017,-.14],[.015,.41],[0,.526],[-.015,.41]]),.012);
    mesh(seconds,needle,ink);
    coin(seconds,gold,0,-.142,.003,.035,.044,.015);
    coin(turret,gold,0,4.28,.995,.065,.065,.04);
    outline(gallery,'gallery',[[-.92,.81,2.62],[1.36,.81,2.62],[1.36,2.24,2.62],[-.92,2.24,2.62]]);
    proxy(8,2.5,-12.7,8.6,5.4,3.15,'gallery');

    function bench(x,z,yaw) {
        buildParkBench(kit,group(root,x,.01,z,yaw));
    }
    bench(-6.82,-7.15,1.4);
    const quarter=buildAnimeQuarter(kit,root);

    const sun=group(moving,10.6,13.6,-34,-.10);
    sun.scale.setScalar(.71);
    sun.name='Paper sun';
    coin(sun,gold,0,0,0,1.95,1.96,.16);
    const rayShape=new T.Shape();rayShape.moveTo(-.074,.05);
    rayShape.bezierCurveTo(-.12,.27,-.057,.68,.037,.73);
    rayShape.bezierCurveTo(.139,.75,.170,.59,.13,.38);rayShape.lineTo(.065,.05);rayShape.closePath();
    const ray=cut(rayShape,.045);
    for(let i=0;i<19;i++){
        const a=tau*i/19+.021*Math.sin(i*2.4),r=2.05+(i%3)*.047;
        const m=mesh(sun,ray,gold,-Math.sin(a)*r,Math.cos(a)*r,.03,true);
        m.rotation.z=a;m.scale.y=between(.62,1.03);
    }
    sun.updateWorldMatrix(true,false);
    const faceInverse=sun.matrixWorld.clone().invert(),facePlane=new T.Plane(v(0,0,1),-.16);
    const faceRay=new T.Ray(),facePoint=new T.Vector3();
    const smile=new T.Shape();smile.moveTo(-.40,-.35);smile.quadraticCurveTo(-.02,-.65,.40,-.32);
    smile.quadraticCurveTo(.03,-.79,-.40,-.35);mesh(sun,cut(smile,.025),ink,0,-.07,.16);
    const glint=new T.Shape();glint.moveTo(-1.66,.66);glint.quadraticCurveTo(-1.41,1.44,-.62,1.64);
    glint.quadraticCurveTo(-1.32,1.33,-1.66,.66);
    mesh(sun,cut(glint,.02),paper,0,0,.099,true);
    for(const side of [-1,1]){
        coin(sun,blossom,side*.98,-.17,.103,.26,.135,.028);
        coin(sun,paper,side*1.01-.05,-.14,.13,.065,.031,.014);
    }
    // Combine the fixed paper cuts by ink. The scene then submits one draw per ink
    // while the dial, eyelids, and breeze can still move independently.
    function bind(rootGroup) {
        rootGroup.updateWorldMatrix(true,true);
        const inverse=rootGroup.matrixWorld.clone().invert(), buckets=new Map(), visit=[];
        rootGroup.traverse(o=>{if(o.isMesh&&!o.userData.keep)visit.push(o);});
        for(const o of visit){
            const source=o.geometry, geometry=source.index?source.toNonIndexed():source.clone();
            if(!o.material.map)geometry.deleteAttribute('uv');
            geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
            if(!buckets.has(o.material))buckets.set(o.material,[]);
            buckets.get(o.material).push(geometry);o.removeFromParent();
        }
        for(const [material,parts] of buckets){
            const geometry=mergeGeometries(parts);geometry.computeBoundingSphere();
            originals.add(geometry);parts.forEach(p=>p.dispose());
            const combined=new T.Mesh(geometry,material);
            if(material.userData.branchDepth)combined.customDepthMaterial=material.userData.branchDepth;
            rootGroup.add(combined);
        }
        [...rootGroup.children].filter(o=>o.isGroup).forEach(o=>o.removeFromParent());
    }
    bind(root);
    bind(sun);
    const eyes=group(sun,0,0,0);
    eyes.name='Paper sun eyes';
    const eyeCentres=[-.54,.53];
    const lids=eyeCentres.map(x=>{
        const eye=group(eyes,x,.19,.16);
        coin(eye,ink,0,0,0,.170,.217,.048);
        coin(eye,paper,-.043,.075,.034,.048,.055,.013);
        return eye;
    });
    // The sun is printed on the sky sheet itself. Give that sheet and its face their
    // own unfogged inks so dusk does not erase the draggable object's expression.
    const solarInks=new Map();
    sun.traverse(object=>{
        if(!object.isMesh)return;
        const hex=object.material.color.getHex();
        if(!solarInks.has(hex))solarInks.set(hex,new T.MeshBasicMaterial({color:object.material.color,side:T.DoubleSide,fog:false}));
        object.material=solarInks.get(hex);
    });
    const sunDisc=new T.CircleGeometry(2.04,40);
    originals.add(sunDisc);
    const pickMaterial=new T.MeshBasicMaterial({side:T.DoubleSide,visible:false});
    const sunTarget=new T.Mesh(sunDisc,pickMaterial);
    sunTarget.name='Drag sun';sunTarget.userData.destination='sun';
    sun.add(sunTarget);
    glowOutlines.sun=Array.from({length:48},(_,i)=>v(2.04*Math.cos(tau*i/48),2.04*Math.sin(tau*i/48),.12));
    const skyPage=new T.Plane(v(0,0,1),34),grabPoint=new T.Vector3(),grabOffset=new T.Vector3();
    let sunHeld=false;
    function setSun(x,y) {
        sun.position.x=T.MathUtils.clamp(x,-23,25);
        sun.position.y=T.MathUtils.clamp(y,8.5,19.5);
        sun.updateWorldMatrix(true,true);
        faceInverse.copy(sun.matrixWorld).invert();
    }
    function beginSunDrag(pointerRay) {
        sunHeld=Boolean(pointerRay && pointerRay.intersectPlane(skyPage,grabPoint));
        if(sunHeld)grabOffset.copy(sun.position).sub(grabPoint);
        return sunHeld;
    }
    function dragSun(pointerRay) {
        if(!sunHeld || !pointerRay || !pointerRay.intersectPlane(skyPage,grabPoint))return false;
        setSun(grabPoint.x+grabOffset.x,grabPoint.y+grabOffset.y);return true;
    }
    function endSunDrag(){sunHeld=false;}
    function moveSunBy(dx,dy){setSun(sun.position.x+dx,sun.position.y+dy);}
    sun.updateWorldMatrix(true,true);
    for(const plant of shrubs)bind(plant.group);
    // One draw per visible crown or rosette shape. Wind bends the stock in the shader, while the
    // closest brushed leaves alone change their instance matrices and ink.
    const foliageBatches=[];
    const foldedLeafStock=mat(leaf).clone();
    foldedLeafStock.color.set(0xffffff);
    const breeze=leafBreeze(T,foldedLeafStock);
    const foil=new T.Color(gold),brushColor=new T.Color();
    for(const {geometry,leaves} of leafInstances.values()) {
        const instanced=new T.InstancedMesh(geometry,foldedLeafStock,leaves.length);
        instanced.customDepthMaterial=breeze.depth;
        instanced.name='Brushable paper leaves';
        instanced.instanceMatrix.setUsage(T.DynamicDrawUsage);
        leaves.forEach((l,i)=>{instanced.setMatrixAt(i,l.matrix);instanced.setColorAt(i,l.color);});
        instanced.instanceColor.setUsage(T.DynamicDrawUsage);
        instanced.computeBoundingSphere();
        instanced.boundingSphere.radius+=.65; // includes tip deflection outside the resting crown
        moving.add(instanced);
        foliageBatches.push({instanced,leaves});
    }
    const leafTilt=new T.Matrix4(),leafMatrix=new T.Matrix4(),leafDelta=new T.Vector3();
    function brushLeaves(ray,time,dt,reduced){
        let foremost=Infinity;
        for(const {instanced,leaves} of foliageBatches){
            const inReach=ray && !reduced && ray.intersectsSphere(instanced.boundingSphere);
            for(const l of leaves){
                l.near=false;
                if(!inReach)continue;
                const reach=.10+Math.min(.49,l.size)*.56;
                if(ray.distanceSqToPoint(l.tip)>reach*reach)continue;
                l.depth=leafDelta.copy(l.tip).sub(ray.origin).dot(ray.direction);
                if(l.depth<0)continue;
                l.near=true;foremost=Math.min(foremost,l.depth);
            }
        }
        for(const {instanced,leaves} of foliageBatches){
            let dirty=false;
            leaves.forEach((l,i)=>{
                const near=l.near && l.depth<foremost+2.4;
                if(near && !l.touched) {l.flutter=1;l.brushedAt=time;}
                l.touched=near;
                if(!l.flutter && !l.bent)return;
                l.flutter=reduced?0:l.flutter*Math.exp(-3.3*dt);
                if(l.flutter<.015)l.flutter=0;
                const angle=l.flutter*.26*Math.cos((time-l.brushedAt)*13+l.phase*.42)+(near?.055:0);
                const tilt=reduced?0:angle;
                leafTilt.makeRotationZ(tilt);
                leafMatrix.multiplyMatrices(l.matrix,leafTilt);
                instanced.setMatrixAt(i,leafMatrix);l.bent=Math.abs(tilt)>.0001;dirty=true;
                instanced.setColorAt(i,brushColor.copy(l.color).lerp(foil,reduced?0:.24*l.flutter+(near?.12:0)));
            });
            if(dirty){instanced.instanceMatrix.needsUpdate=true;instanced.instanceColor.needsUpdate=true;}
        }
    }
    const petalsInAir=driftingPetals(T,scene,palette);
    const meadow=plantMeadow(T,scene,palette,curve,walks);
    meadow.dressGround(lawnStock);
    let lastMinute=-1,lastSecond=-1,lastGazeTime=0,gazeX=0,gazeY=0;
    function update(timeSeconds,reducedMotion,pointerWorld,pointerRay) {
        const time=new Date(), minute=time.getHours()*60+time.getMinutes();
        if(minute!==lastMinute){
            lastMinute=minute;hours.rotation.z=-tau*minute/720;minutes.rotation.z=-tau*time.getMinutes()/60;
        }
        seconds.visible=!reducedMotion;
        if(!reducedMotion && time.getSeconds()!==lastSecond){
            lastSecond=time.getSeconds();seconds.rotation.z=-tau*lastSecond/60;
        }
        const blinkTime=(timeSeconds+1.3)%5.35;
        const open=reducedMotion?1:1-.90*Math.max(0,1-Math.abs(blinkTime-.135)/.135);
        let targetX=0,targetY=0;
        if(!reducedMotion && pointerRay){
            faceRay.copy(pointerRay).applyMatrix4(faceInverse);
            if(faceRay.direction.z<0 && faceRay.intersectPlane(facePlane,facePoint)){
                const distance=Math.hypot(facePoint.x,facePoint.y);
                const weight=(1-T.MathUtils.smoothstep(distance,1.95,3.5))/Math.max(1.55,distance);
                targetX=.21*facePoint.x*weight;
                targetY=.135*facePoint.y*weight;
            }
        }
        const dt=T.MathUtils.clamp(timeSeconds-lastGazeTime,0,.12);
        const ease=1-Math.exp(-8*dt);
        lastGazeTime=timeSeconds;
        meadow.update(timeSeconds,reducedMotion,pointerWorld,pointerRay);
        breeze.update(timeSeconds,reducedMotion);
        petalsInAir.update(timeSeconds,reducedMotion);
        species.update?.(timeSeconds,reducedMotion,pointerRay);
        brushLeaves(pointerRay,timeSeconds,dt,reducedMotion);
        gazeX=reducedMotion?0:gazeX+(targetX-gazeX)*ease;
        gazeY=reducedMotion?0:gazeY+(targetY-gazeY)*ease;
        lids.forEach((lid,i)=>{
            lid.position.set(eyeCentres[i]+gazeX,.19+gazeY,.16);
            lid.scale.y=open;
        });
        for(const plant of shrubs){
            const d=pointerWorld?Math.hypot(plant.x-pointerWorld.x,plant.z-pointerWorld.z):Infinity;
            const sway=Math.sin(timeSeconds*1.55+plant.phase)*.015;
            const nudge=d<1.8?(1-d/1.8)*.16:0;
            plant.group.rotation.z=reducedMotion?0:sway+nudge;
        }
    }
    update(0,true);
    return {pathTargets,spotTargets,sunTarget,glowOutlines,beginSunDrag,dragSun,endSunDrag,moveSunBy,update,dispose(){
        scene.remove(root,moving);for(const g of originals)g.dispose();for(const m of materials.values())m.dispose();
        for(const {instanced} of foliageBatches)instanced.dispose();
        petalsInAir.dispose();species.dispose?.();quarter.dispose();street.dispose();roadside.dispose();
        meadow.dispose();breeze.dispose();lawnStock.dispose();foldedLeafStock.dispose();
        for(const material of solarInks.values())material.dispose();
        pickMaterial.dispose();
    }};
}
