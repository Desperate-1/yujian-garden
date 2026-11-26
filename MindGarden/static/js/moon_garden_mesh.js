import {signLettering} from './anime_lettering.js';

// All dimensions are in metres. Each surface batch shares its print and wind uniforms.
export function gardenWorkshop(T, scene) {
    const group=new T.Group();
    group.name='月下花园';
    scene.add(group);
    const mats={},batches={},maps=[],colours=new Map();
    const time={value:0},motion={value:0},brush={value:new T.Vector3(0,-100,0)};
    let seed=0x39bad019;
    const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const between=(a,b)=>a+(b-a)*rand();
    function print(url){
        const map=new T.TextureLoader().load(new URL(url,import.meta.url).href);
        map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;maps.push(map);return map;
    }
    const leafMap=print('../garden/botany/zelkova.webp');
    const blossoms=print('../garden/moon/moon-borders.webp');
    const repeatPrint=url=>{
        const map=print(url);map.wrapS=map.wrapT=T.RepeatWrapping;return map;
    };
    const barkTexture=repeatPrint('../garden/moon/moon-oak.webp');
    const moss=repeatPrint('../garden/moon/moon-earth.webp');
    const limestone=repeatPrint('../garden/moon/moon-limestone.webp');
    const newMat=(opts)=>new T.MeshLambertMaterial({side:T.DoubleSide,vertexColors:true,...opts});
    mats.stone=newMat({map:limestone});mats.plain=newMat({});
    mats.turf=newMat({map:moss});
    mats.bark=newMat({map:barkTexture});
    mats.leaf=newMat({map:leafMap,alphaTest:.36});
    mats.flora=newMat({map:blossoms,alphaTest:.37});
    mats.white=newMat({map:print('../garden/moon/moon-white-border.webp'),alphaTest:.37});
    mats.glow=new T.MeshBasicMaterial({side:T.DoubleSide,vertexColors:true});
    const deform=`
        uniform float gardenTime,gardenWind;
        uniform vec3 gardenBrush;
        vec3 gardenFlutter(vec3 p,vec2 atlasUV){
            float tip=.25+.75*sin(3.14159*fract(2.*atlasUV.y));
            float gust=.030*sin(1.27*gardenTime+.54*p.x+.43*p.z)+.015*sin(2.6*gardenTime-p.y);
            float touch=(1.-smoothstep(.05,1.5,distance(p.xz,gardenBrush.xz)))*.10*sin(9.*gardenTime+p.y);
            return vec3(gust+touch,.14*gust,.47*gust)*tip*gardenWind;
        }`;
    const ownedDepth=[];
    for(const name of ['flora','white','leaf']){
        const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide,map:mats[name].map,alphaTest:mats[name].alphaTest});
        ownedDepth.push(depth);mats[name].userData.plantDepth=depth;
        for(const m of [mats[name],depth]){
            m.customProgramCacheKey=()=> 'moon-wind-v1';
            m.onBeforeCompile=s=>{
                Object.assign(s.uniforms,{gardenTime:time,gardenWind:motion,gardenBrush:brush});
                s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\n'+deform)
                    .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=gardenFlutter(position,uv);');
            };
        }
    }
    function frame(x=0,y=0,z=0,a=0){
        return {x,y,z,c:Math.cos(a),s:Math.sin(a)};
    }
    function plaque(f,label,x,y,z,w,h){
        const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;
        const c=canvas.getContext('2d');
        const field=c.createLinearGradient(0,0,0,192);field.addColorStop(0,'#445d55');field.addColorStop(1,'#233c39');
        c.fillStyle=field;c.fillRect(0,0,768,192);
        c.strokeStyle='#bfbd97';c.lineWidth=4;c.strokeRect(9,9,750,174);
        c.lineWidth=1.6;c.strokeRect(17,17,734,158);
        for(const s of [-1,1]){
            c.save();c.translate(s<0?64:704,99);c.scale(s<0?1:-1,1);c.strokeStyle='#cad2aa';c.fillStyle='#bcc5a0';
            c.lineWidth=3;c.beginPath();c.moveTo(-9,26);c.quadraticCurveTo(15,5,21,-37);c.stroke();
            for(let j=0;j<5;j++){
                const xx=j*4,yy=14-j*9,side=j%2?-1:1;
                c.beginPath();c.ellipse(xx+side*5,yy,6,12,side*.64,0,Math.PI*2);c.fill();
            }
            c.restore();
        }
        c.fillStyle='#faf1cc';c.textAlign='center';c.textBaseline='middle';
        c.font='bold 101px '+signLettering;
        c.fillText(label,384,104,554);
        const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;maps.push(texture);
        const key='plaque-'+label;mats[key]=new T.MeshBasicMaterial({map:texture,side:T.DoubleSide});
        box(f,x,y,z,w+.043,h+.045,.054,'#c3ad85');
        face(f,[[x-w/2,y-h/2,z+.036],[x+w/2,y-h/2,z+.036],[x+w/2,y+h/2,z+.036],[x-w/2,y+h/2,z+.036]],'#ffffff',key,[[0,0],[1,0],[1,1],[0,1]]);
    }
    function transform(f,p){return [f.x+f.c*p[0]+f.s*p[2],f.y+p[1],f.z-f.s*p[0]+f.c*p[2]];}
    function bucket(key){
        return batches[key]??=( {pos:[],rgb:[],uv:[],idx:[]} );
    }
    function face(f,points,color,key='plain',uv){
        const b=bucket(key),start=b.pos.length/3;
        if(!colours.has(color))colours.set(color,new T.Color(color));
        const {r,g,b:blue}=colours.get(color);
        for(let i=0;i<points.length;i++){
            const p=points[i];b.pos.push(...transform(f,p));b.rgb.push(r,g,blue);
            const tex=uv?.[i] || [p[0]*.78+p[2]*.59,p[1]*.91+p[2]*.42];
            b.uv.push(...tex);
        }
        for(let i=1;i+1<points.length;i++)b.idx.push(start,start+i,start+i+1);
    }
    function box(f,x,y,z,w,h,d,color,key='plain'){
        const l=x-w/2,r=x+w/2,b=y-h/2,t=y+h/2,n=z-d/2,s=z+d/2;
        face(f,[[l,t,s],[r,t,s],[r,t,n],[l,t,n]],color,key);
        face(f,[[l,b,n],[r,b,n],[r,b,s],[l,b,s]],color,key);
        face(f,[[l,b,s],[r,b,s],[r,t,s],[l,t,s]],color,key);
        face(f,[[r,b,n],[l,b,n],[l,t,n],[r,t,n]],color,key);
        face(f,[[r,b,s],[r,b,n],[r,t,n],[r,t,s]],color,key);
        face(f,[[l,b,n],[l,b,s],[l,t,s],[l,t,n]],color,key);
    }
    function beam(f,a,b,r,R,color,key='plain',sides=7){
        const dir=new T.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();
        const n=dir.clone().cross(Math.abs(dir.y)>.8?new T.Vector3(1,0,0):new T.Vector3(0,1,0)).normalize();
        const q=dir.clone().cross(n);
        let prev=null;
        for(let i=0;i<=sides;i++){
            const angle=i*2*Math.PI/sides,c=Math.cos(angle),s=Math.sin(angle);
            const dx=n.x*c+q.x*s,dy=n.y*c+q.y*s,dz=n.z*c+q.z*s;
            const cur=[[a[0]+r*dx,a[1]+r*dy,a[2]+r*dz],[b[0]+R*dx,b[1]+R*dy,b[2]+R*dz]];
            if(prev)face(f,[prev[0],cur[0],cur[1],prev[1]],color,key,
                [[(i-1)/sides,0],[i/sides,0],[i/sides,1],[(i-1)/sides,1]]);
            prev=cur;
        }
    }
    // Slightly cupped sprigs cast real cut-out shadows and keep their orientation as the camera turns.
    function spray(f,x,y,z,w,h,yaw,lean,cell,key='flora',tint=0xffffff){
        const right=[Math.cos(yaw),0,-Math.sin(yaw)],front=[Math.sin(yaw),0,Math.cos(yaw)];
        const at=(u,v)=>{
            const swell=(.09*(1-4*u*u)+v*lean)*w;
            return [x+u*w*right[0]+front[0]*swell,y+v*h,z+u*w*right[2]+front[2]*swell];
        };
        const u0=(cell%2)*.5+.002,v0=(cell<2?.5:0)+.002;
        for(let j=0;j<3;j++){
            const u=j/3-.5,v=(j+1)/3-.5;
            face(f,[at(u,0),at(v,0),at(v,1),at(u,1)],tint,key,[[u0+(u+.5)*.496,v0],[u0+(v+.5)*.496,v0],[u0+(v+.5)*.496,v0+.496],[u0+(u+.5)*.496,v0+.496]]);
        }
    }
    function finish(){
        for(const [key,b] of Object.entries(batches)){
            const g=new T.BufferGeometry();
            g.setAttribute('position',new T.Float32BufferAttribute(b.pos,3));g.setAttribute('color',new T.Float32BufferAttribute(b.rgb,3));
            g.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));g.setIndex(b.idx);g.computeVertexNormals();g.computeBoundingSphere();
            const m=new T.Mesh(g,mats[key]);m.name='月园 · '+key;
            m.castShadow=key!=='glow';m.receiveShadow=key!=='glow';
            if(m.material.userData.plantDepth)m.customDepthMaterial=m.material.userData.plantDepth;
            group.add(m);
            delete batches[key];
        }
    }
    return {T,group,frame,transform,face,box,beam,spray,plaque,rand,between,finish,
        update(t,reduced,pointer){
            time.value=t;motion.value=reduced?0:1;
            if(pointer&&!reduced)brush.value.copy(pointer);else brush.value.set(0,-100,0);
        },
        dispose(){
            group.removeFromParent();group.traverse(m=>{if(m.isMesh)m.geometry.dispose();});
            Object.values(mats).forEach(m=>m.dispose());ownedDepth.forEach(m=>m.dispose());maps.forEach(m=>m.dispose());
        }};
}
