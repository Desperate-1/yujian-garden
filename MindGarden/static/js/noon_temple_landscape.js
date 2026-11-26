import {courtPaint as p} from './noon_temple_craft.js';

export function plantTempleGarden(k){
    const {T,node,mesh,box,rod,pillar,sheet,random,tone}=k;
    const tex=k.asset('../garden/botany/zelkova.webp');
    const leaf=k.finish(tex,{alphaTest:.36});leaf.name='水榭树冠';
    const sway={value:0},wind={value:0},touch={value:0},origin={value:new T.Vector3()},direction={value:new T.Vector3(0,0,-1)};
    leaf.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,{windTime:sway,windStrength:wind,leafTouch:touch,rayStart:origin,rayDir:direction});
        shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
            uniform float windTime,windStrength,leafTouch;uniform vec3 rayStart,rayDir;`)
            .replace('#include <begin_vertex>',`#include <begin_vertex>
                vec3 cursor=position-rayStart;float along=max(0.,dot(cursor,rayDir));
                float nearCursor=(1.-smoothstep(.18,1.25,length(cursor-along*rayDir)))*leafTouch;
                float wave=sin(position.x*1.46+position.z*.93+windTime*1.36);
                transformed.x+=windStrength*wave*(.037+nearCursor*.24);
                transformed.y+=windStrength*(.021+nearCursor*.095)*sin(position.z*2.19+windTime*1.64);
            `);
    };
    const woodMap=k.asset('../garden/botany/cherry-bark.webp');
    woodMap.wrapT=T.RepeatWrapping;woodMap.repeat.y=1.35;
    const barkSkin=k.finish(woodMap);barkSkin.name='古树灰褐纹皮';
    const stone=new T.IcosahedronGeometry(1,1),bud=new T.IcosahedronGeometry(1,0),stoneForms=[];
    // The eroded limestone banks have uneven ledges. Their silhouettes stay
    // coherent when the visitor turns around the lake or approaches the tree.
    for(let j=0;j<5;j++){
        const geo=new T.IcosahedronGeometry(1,1),positions=geo.getAttribute('position');
        for(let i=0;i<positions.count;i++){
            const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
            const field=Math.sin(x*4.1+y*6.4+z*3.2+j*8.12)*.085+Math.cos(z*5.2-x*4.-j*.43)*.072;
            const height=y>.48?.54+(y-.48)*.51:y;
            positions.setXYZ(i,x*(1+field)+height*.17,height*(1+field*.8)+.055*Math.sin(x*4+z*4+j),z*(1+field*.80));
        }
        geo.computeVertexNormals();stoneForms.push(geo);
    }
    function boulder(g,x,y,z,w,h,d,col){
        const m=mesh(g,stoneForms[Math.floor(random()*stoneForms.length)],col,x,y,z);m.scale.set(w,h,d);
        m.rotation.set(random()*.30,random()*6.28,random()*.36-.15);return m;
    }
    function spray(g,x,y,z,width,height,dir,tilt,col){
        const cs=Math.cos(dir),sn=Math.sin(dir),variant=Math.floor(random()*4);
        const pos=[],idx=[],uv=[];
        for(let j=0;j<=3;j++)for(let i=0;i<=3;i++){
            const u=i/3,v=j/3,side=(u-.5)*width,forward=height*v*.79+.24*Math.sin(Math.PI*u)*width;
            pos.push(x+side*cs+forward*sn,y+height*v*tilt-.17*height*v*v+.08*width*Math.sin(u*Math.PI),
                z-side*sn+forward*cs);
            uv.push(((variant%2)+.005+.99*u)/2,(Math.floor(variant/2)+.005+.99*v)/2);
            if(i<3&&j<3){const n=j*4+i;idx.push(n,n+5,n+1,n,n+4,n+5);}
        }
        sheet(g,pos,idx,uv,col,leaf);
    }
    function crown(g,x,y,z,width,flower,seedAngle){
        for(let j=0;j<17;j++){
            const a=j*2.4+seedAngle+random()*.2,r=(.13+random()*.37)*width;
            spray(g,x+Math.sin(a)*r,y+(.1+random()*.22)*width,z+Math.cos(a)*r,
                (.95+random()*.65)*width,(.72+random()*.64)*width,a,-.22+random()*.96,
                tone(0xbac994,0xf5f2bc,random()*.86));
        }
        if(flower){
            for(let j=0;j<38;j++){
                const a=random()*6.283,r=Math.sqrt(random())*width*.85;
                const o=mesh(g,bud,tone(p.ivory,0xe7ceb0,random()*.62),x+Math.sin(a)*r,y+width*(.25+random()*.26),z+Math.cos(a)*r);
                o.scale.set(.055+random()*.052,.044+random()*.043,.055+random()*.052);
            }
        }
    }
    function tree(x,z,size,seedAngle=0,hollow=false,flower=false,y=0){
        const g=node(k.root,x,y,z,hollow?-.32:seedAngle);g.scale.setScalar(size);
        const bark=0x65594b,dark=0x4a4d43;
        const pts=[[0,0,0],[-.21,1.25,.05],[-.12,2.39,-.03],[.20,3.18,-.13],[.36,3.99,.02]];
        if(hollow){
            const pos=[],ind=[],uvs=[],steps=36,levels=[[.04,1.02],[.30,.87],[.83,.70],[1.34,.61],[1.91,.56],[2.46,.41],[2.73,.32],[2.89,.23]];
            const lip=a=>.80+.42*Math.sqrt(Math.max(0,1-(a/.69)**2));
            const point=(a,h,r)=>[Math.sin(a)*r*(1+.048*Math.sin(7*a+h))-.078*h+Math.max(0,h-1.9)*.26,h,
                Math.cos(a)*r*(1.01+.048*Math.sin(4*a+h))+.056-Math.max(0,h-1.8)*.08];
            for(let i=0;i<steps;i++){
                const a=-Math.PI+i/steps*2*Math.PI,b=a+2*Math.PI/steps;
                const hollowFace=Math.abs((a+b)/2)<.69;
                for(let j=0;j<levels.length-1;j++){
                    if(hollowFace&&j<3)continue;
                    const [h0,r0]=levels[j],[h1,r1]=levels[j+1];
                    const A=hollowFace&&j===3?lip(a):h0,B=hollowFace&&j===3?lip(b):h0;
                    const offset=pos.length/3;
                    for(const pp of [point(a,A,r0),point(b,B,r0),point(b,h1,r1),point(a,h1,r1)])pos.push(...pp);
                    uvs.push(i/steps,A/2.46,(i+1)/steps,B/2.46,(i+1)/steps,h1/2.46,i/steps,h1/2.46);
                    ind.push(offset,offset+1,offset+2,offset,offset+2,offset+3);
                }
            }
            sheet(g,pos,ind,uvs,0xd7c4a6,barkSkin);
            const cavity=mesh(g,stone,0x34382d,0,.53,.04);cavity.scale.set(.54,.63,.29);
            // Short, irregular strips form a recessed wooden lip and never
            // cross the entrance. The letter is mounted in the cavity's mouth.
            const edges=[[-.51,.05,.80],[-.56,.36,.69],[-.51,.84,.54],[-.35,1.09,.60],[-.12,1.2,.63],
                [.10,1.20,.65],[.24,1.11,.64],[.36,.90,.63],[.41,.53,.73],[.51,.08,.89]];
            for(let i=1;i<edges.length;i++){
                const strip=rod(g,edges[i-1],edges[i],.054,0xf1d3a4,.052);strip.material=barkSkin;
            }
            for(let i=0;i<8;i++){
                const a=.9+i*.69;
                rod(g,[Math.sin(a)*.53,.37,Math.cos(a)*.55],[Math.sin(a)*1.15,.026,Math.cos(a)*1.1],.22,bark,.033,9);
            }
        }
        for(let j=hollow?2:0;j<pts.length-1;j++){
            const m=rod(g,pts[j],pts[j+1],(.335-.063*j)*(hollow?1.46:1),0xc2b49d,.25-.055*j,10);m.material=barkSkin;
        }
        for(let i=0;i<12;i++){
            const a=i*2.4+.35,layer=(i%4),v=1.58+.4*layer+(hollow?.34:0),reach=1.12+.64*(1-layer/4)+.26*random();
            const sin=Math.sin(a),cos=Math.cos(a);
            const from=[-.13+layer*.045,v,0],bend=[sin*reach*.48,v+.59,cos*reach*.48],
                fork=[sin*reach*.81,v+.65+.20*random(),cos*reach*.81],tip=[sin*reach,v+.99,cos*reach];
            rod(g,from,bend,.150-i%3*.019,bark,.100,9);rod(g,bend,fork,.10,dark,.061);
            rod(g,fork,tip,.066,bark,.025);
            const side=a+.63,sub=[tip[0]+Math.sin(side)*.57,tip[1]+.32,tip[2]+Math.cos(side)*.57];
            rod(g,tip,sub,.035,bark,.011);
            crown(g,...tip,1.04-layer*.058,flower,a);
        }
        crown(g,.26,4.0,.04,1.03,flower,.7);
        return g;
    }
    function grass(x,z,r,flower=false,height=.035){
        const g=node(k.root,x,height,z);
        const pos=[],idx=[],dark=0x4f735a;
        for(let i=0;i<30;i++){
            const a=random()*6.283,rr=Math.sqrt(random())*r,cx=Math.cos(a)*rr,cz=Math.sin(a)*rr;
            const w=.053+r*.04,h=.28+random()*.51;
            const wx=Math.cos(a)*w,wz=Math.sin(a)*w;
            let n=pos.length/3;pos.push(cx-wx,0,cz-wz,cx+wx,0,cz+wz,cx+Math.sin(a)*.21,h,cz+Math.cos(a)*.21);
            idx.push(n,n+1,n+2);
            if(flower&&i%3===0){
                const fx=cx+Math.sin(a)*.21,fz=cz+Math.cos(a)*.21;
                const petals=[],faces=[];
                for(let j=0;j<5;j++){
                    const t=j*1.257+a,s=Math.sin(t),c=Math.cos(t),n=petals.length/3;
                    petals.push(fx,h-.015,fz,fx+.045*c-.033*s,h+.012,fz+.045*s+.033*c,
                        fx+.091*c,h+.043,fz+.091*s,fx+.045*c+.033*s,h+.012,fz+.045*s-.033*c);
                    faces.push(n,n+1,n+2,n,n+2,n+3);
                }
                sheet(g,petals,faces,null,p.ivory);
                const b=mesh(g,bud,p.gold,fx,h+.007,fz);b.scale.set(.024,.018,.024);
            }
        }
        sheet(g,pos,idx,null,dark);
    }
    return {boulder,tree,grass,update(t,reduced,ray){
        sway.value=reduced?0:t;wind.value=reduced?0:1;
        touch.value+=(Number(Boolean(ray)&&!reduced)-touch.value)*.18;
        if(ray){origin.value.copy(ray.origin);direction.value.copy(ray.direction);}
    }};
}

// The ground and roofs appear in the lake through mirrored copies of the same
// batches. Their reflected outlines bend with the water; the main camera is
// rendered once, including on software WebGL.
export function templeAtmosphere(T,scene,architecture){
    const ready={value:0};
    const texture=new T.TextureLoader().load(new URL('../garden/noon/cloud-valley.webp',import.meta.url).href,()=>{ready.value=1;});
    texture.colorSpace=T.SRGBColorSpace;texture.wrapS=T.MirroredRepeatWrapping;
    const time={value:0},motion={value:1},cursor={value:new T.Vector2(-999,-999)},shore=-.64;
    const sampleSky=`vec3 sampleSky(vec3 d){
        d=normalize(d);float u=0.515+atan(d.x,-d.z)*0.52;
        float v=clamp(0.274+asin(clamp(d.y,-1.,1.))*.87,.03,.997);
        vec3 skyTint=mix(vec3(.55,.75,.81),vec3(.23,.54,.82),smoothstep(-.1,.6,d.y));
        return mix(skyTint,texture2D(valley,vec2(u,v)).rgb,skyReady);
    }`;
    const sky=new T.Mesh(new T.SphereGeometry(1,36,18),new T.ShaderMaterial({
        side:T.BackSide,depthTest:false,depthWrite:false,uniforms:{valley:{value:texture},skyReady:ready},
        vertexShader:`varying vec3 rayDir;void main(){rayDir=position;vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=p.xyww;}`,
        fragmentShader:`uniform sampler2D valley;uniform float skyReady;varying vec3 rayDir;${sampleSky}
        void main(){gl_FragColor=vec4(sampleSky(rayDir),1.);
        #include <colorspace_fragment>
        }`
    }));sky.name='云汀远山与晴空';sky.renderOrder=-95;sky.frustumCulled=false;scene.add(sky);
    const reflects=new T.Group();reflects.name='水榭的几何倒影';reflects.userData.ownPaperFinish=true;
    const mirrorMats=[];
    for(const m of architecture.children){
        if(!m.isMesh)continue;
        const original=m.material;
        const paint=new T.MeshBasicMaterial({color:0x98b5ac,vertexColors:true,map:original.map??null,
            alphaTest:original.alphaTest||0,side:T.DoubleSide,fog:true});
        paint.onBeforeCompile=shader=>{
            shader.uniforms.pondTime=time;
            shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float pondTime;')
                .replace('#include <begin_vertex>',`#include <begin_vertex>
                  transformed.x+=.045*sin(position.y*21.0+.7*position.z+pondTime*1.5)*min(2.,max(position.y,0.));`);
        };
        const refl=new T.Mesh(m.geometry,paint);refl.scale.y=-1;refl.position.y=shore*2-.014;
        refl.renderOrder=-1;reflects.add(refl);mirrorMats.push(paint);
    }
    scene.add(reflects);
    const water=new T.Mesh(new T.PlaneGeometry(360,360),new T.ShaderMaterial({
        side:T.DoubleSide,transparent:true,depthWrite:false,uniforms:{valley:{value:texture},skyReady:ready,pondTime:time,flow:motion,pointer:cursor},
        vertexShader:`varying vec3 worldPoint; void main(){vec4 pt=modelMatrix*vec4(position,1.);worldPoint=pt.xyz;gl_Position=projectionMatrix*viewMatrix*pt;}`,
        fragmentShader:`uniform sampler2D valley;uniform float skyReady,pondTime,flow;uniform vec2 pointer;varying vec3 worldPoint;${sampleSky}
         void main(){
           vec2 q=worldPoint.xz;float t=pondTime*.7;
           float w=sin(q.x*.83+q.y*2.67+t+sin(q.y*.45))*.006+sin(q.y*5.1-q.x*.82-t*1.21)*.0036;
           vec3 direction=normalize(worldPoint-cameraPosition);
           vec3 reflected=reflect(direction,normalize(vec3(.002*cos(q.x*2.16+t),1.,w)));
           float rim=pow(1.-abs(direction.y),2.9);
           vec3 waterColor=mix(vec3(.042,.205,.173),sampleSky(reflected),.19+.31*rim);
           float fade=1.-smoothstep(12.,80.,distance(cameraPosition,worldPoint));
           float glimmer=smoothstep(.95,1.,.5+.5*sin(q.y*10.1+w*76.+q.x*.9+t))*smoothstep(.43,.93,cos(q.x*3.6-q.y*1.3+t*.55));
           waterColor+=vec3(.15,.18,.145)*glimmer*fade*.30;
           float dist=distance(q,pointer),pulse=smoothstep(.59,.99,sin(24.*dist-t*4.2));
           waterColor+=vec3(.13,.22,.18)*pulse*(1.-smoothstep(.1,1.48,dist))*flow;
           gl_FragColor=vec4(waterColor,.42+.39*rim);
           #include <colorspace_fragment>
         }`
    }));water.rotation.x=-Math.PI/2;water.position.y=shore;water.name='临水庭院的倒影';water.renderOrder=1;
    scene.add(water);
    return {update(t,reduced,point){time.value=reduced?0:t;motion.value=reduced?0:1;
        if(point&&!reduced)cursor.value.set(point.x,point.z);else cursor.value.set(-999,-999);
    },dispose(){
        sky.removeFromParent();water.removeFromParent();reflects.removeFromParent();
        sky.geometry.dispose();sky.material.dispose();water.geometry.dispose();water.material.dispose();
        for(const m of mirrorMats)m.dispose();texture.dispose();
    }};
}
