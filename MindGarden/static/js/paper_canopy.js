import {markFloweringTree} from './anime_botany_petals.js';
import {barkSurface,releaseBark} from './anime_botany_bark.js';
import {quarterTreeClearance} from './anime_quarter.js';

// The trees grow from the roots outwards. The last fork of each wooden limb
// carries curved sprays of flowers or leaves, painted on both sides. Nothing
// rotates towards the camera, so branches keep their shape around the square.
function stream(seed){
    return ()=>{
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        return seed/4294967296;
    };
}

// Street trees are pruned more closely on the side facing the shop awnings.
// Measure the actual planting position around the bole before growing twigs:
// the open, road-facing side keeps the natural fan of the cherry tree.
function crownSetback(parent){
    const steps=96,distances=[],scale=parent.scale.x,yaw=parent.rotation.y;
    for(let j=0;j<steps;j++){
        const a=j/steps*Math.PI*2-yaw,c=Math.cos(a),s=Math.sin(a);
        let length=0;
        for(;length<6*scale;length+=.18){
            if(quarterTreeClearance(parent.position.x+c*length,parent.position.z+s*length)<.72)break;
        }
        distances.push(Math.max(.15,(length-.19)/scale));
    }
    // Grow away from a projecting corner on either side of a sampled ray.
    // This keeps the surface of the spray clear between adjacent boughs too.
    const limits=distances.map((v,i)=>Math.min(v,distances[(i+1)%steps],distances[(i+steps-1)%steps]));
    return p=>{
        const radius=Math.hypot(p.x,p.z);
        if(radius<.35)return p;
        const angle=(Math.atan2(p.z,p.x)/(Math.PI*2)+1)%1*steps;
        const j=Math.floor(angle),f=angle-j;
        const limit=limits[j]*(1-f)+limits[(j+1)%steps]*f;
        const knee=limit*.68;
        if(radius>knee){
            const span=limit-knee;
            const bend=(knee+span*(1-Math.exp(-(radius-knee)/span)))/radius;
            p.x*=bend;p.z*=bend;
        }
        return p;
    };
}

export function broadleafTrees(kit){
    const {T,mesh,ink,gold,leaf,paper,sky,blossom}=kit;
    const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
    const blend=(a,b,t)=>new T.Color(a).lerp(new T.Color(b),t).getHex();
    const bark=blend(ink,'#836971',.76),wood=blend(bark,'#b39c94',.21);
    const edge=blend(bark,'#b8acaa',.32);
    const goldLeaf=blend(leaf,gold,.16),leafShade=blend(leaf,ink,.34);
    const springTint=blend(blossom??'#ef9fb6',paper,.60);
    const up=V(0,1,0);
    const uniforms={
        t:{value:0}, motion:{value:0}, brushing:{value:0},
        eye:{value:V()}, ray:{value:V(0,0,-1)}
    };

    function moveSprays(material){
        material.onBeforeCompile=shader=>{
            Object.assign(shader.uniforms,{sprayTime:uniforms.t,sprayMotion:uniforms.motion,
                sprayBrush:uniforms.brushing,sprayEye:uniforms.eye,sprayRay:uniforms.ray});
            shader.vertexShader=shader.vertexShader
                .replace('#include <common>',`#include <common>
                    uniform float sprayTime, sprayMotion, sprayBrush;
                    uniform vec3 sprayEye, sprayRay;`)
                .replace('#include <begin_vertex>',`#include <begin_vertex>
                    float phase=position.x*.74+position.z*.41;
                    float wind=(sin(sprayTime*1.27+phase)+.32*sin(sprayTime*2.27-phase))*.035;
                    vec3 delta=position-sprayEye;
                    float along=dot(delta,sprayRay);
                    float cursor=(1.-smoothstep(.05,1.28,length(delta-sprayRay*along)))*step(0.,along);
                    float flick=cursor*sprayBrush*(.096+.066*sin(position.y*2.6+sprayTime*9.0));
                    float tip=clamp(fract(uv.y*2.)*1.37-.13,0.,1.);
                    transformed.xz+=sprayMotion*tip*(wind+flick)*vec2(.90,-.37);
                    transformed.y+=sprayMotion*tip*(wind*.15-flick*.45);`);
            // Leaves reflect sky from both sides. Each spray carries its own
            // upward normals and the painted warm and cool sides of its florets.
            if(material.isMeshLambertMaterial)shader.fragmentShader=shader.fragmentShader
                .replace('#include <normal_fragment_begin>',
                    T.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;',''));
        };
        material.customProgramCacheKey=()=> 'spring-twigs-v1';
    }
    const loader=typeof document==='undefined'?null:new T.TextureLoader();
    const arts={};
    for(const name of ['sakura','zelkova']){
        const texture=loader?.load(new URL('../garden/botany/'+name+'.webp',import.meta.url).href)
            ??new T.Texture();
        texture.colorSpace=T.SRGBColorSpace;
        texture.anisotropy=4;
        const tint=blend('#ffffff',name==='sakura'?springTint:blend(leaf,sky,.25),.12);
        const material=new T.MeshLambertMaterial({map:texture,color:tint,vertexColors:true,
            alphaTest:.40,side:T.DoubleSide,alphaToCoverage:true,shadowSide:T.DoubleSide});
        // Thin petals transmit skylight through the flower bed, particularly
        // where the uppermost sprays overlap. Retain the same hue after sunset.
        const day=T.MathUtils.smoothstep(new T.Color(sky).g,.16,.55);
        material.emissiveMap=texture;
        material.emissive.setHex(name==='sakura'?0xa699aa:0x8a9274);
        material.emissiveIntensity=(name==='sakura'?.27:.11)*(.34+.66*day);
        material.name=name==='sakura'?'染井吉野花枝':'春日树叶';
        const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,
            map:texture,alphaTest:.40,side:T.DoubleSide});
        moveSprays(material);moveSprays(depth);
        material.userData.branchDepth=depth;
        arts[name]={texture,material,depth};
    }
    // Attached, articulated leaves for the visitor's hand. The blossom beds
    // have scattered bronze new leaves among the colour of the flowers.
    const liveShape=new T.BufferGeometry();
    liveShape.setAttribute('position',new T.Float32BufferAttribute(
        [0,0,0,-.16,.28,-.03,-.20,.49,-.028,-.13,.65,.01,.013,.97,.06,
        .10,.72,-.008,.19,.48,-.06,.14,.27,-.045,0,.47,.065],3));
    liveShape.setIndex([0,8,1,1,8,2,2,8,3,3,8,4,4,8,5,5,8,6,6,8,7,7,8,0]);
    liveShape.computeVertexNormals();
    const profiles={
        sakura:{rise:1,reach:1.10,stem:.33},
        oak:{rise:1.03,reach:.94,stem:.36},
        birch:{rise:1.10,reach:.74,stem:.27},
        willow:{rise:.98,reach:.88,stem:.32},
        fir:{rise:.91,reach:.80,stem:.28}
    };
    function grow(parent,detail,livingLeaf,kind,hollow=false){
        const cherry=kind==='sakura', pine=kind==='fir';
        if(cherry)markFloweringTree(parent);
        const cfg=profiles[kind];
        const seed=(Math.round((parent.position.x+60)*4219)^Math.round((parent.position.z+71)*2987))>>>0;
        const random=stream(seed),range=(a,b)=>a+(b-a)*random();
        const offset=range(0,Math.PI*2);
        const veil=arts[cherry?'sakura':'zelkova'];
        const fit=crownSetback(parent);
        const batches=new Map(),positions=[],normals=[],uvs=[],colors=[],indices=[];
        const trunkSkin=barkSurface(kit,parent);
        function woodTriangle(color,a,b,c){
            if(!batches.has(color))batches.set(color,[]);
            batches.get(color).push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
        }
        function branch(points,radii,sides=6){
            let last,previousDirection,sideNormal,travel=0;
            for(let i=0;i<points.length;i++){
                const tangent=points[Math.min(i+1,points.length-1)].clone()
                    .sub(points[Math.max(0,i-1)]).normalize();
                if(sideNormal)sideNormal.addScaledVector(tangent,-sideNormal.dot(tangent)).normalize();
                else sideNormal=new T.Vector3().crossVectors(tangent,Math.abs(tangent.y)>.92?V(1,0,0):up).normalize();
                const second=new T.Vector3().crossVectors(tangent,sideNormal),ring=[],directions=[];
                for(let j=0;j<sides;j++){
                    const angle=j*Math.PI*2/sides;
                    const r=radii[i]*(1+.048*Math.sin(3*angle+offset));
                    const dir=sideNormal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(second,Math.sin(angle));
                    ring.push(fit(points[i].clone().addScaledVector(dir,r)));
                    directions.push(dir);
                }
                if(last){
                    const nextTravel=travel+points[i].distanceTo(points[i-1]);
                    for(let j=0;j<sides;j++){
                        const k=(j+1)%sides;
                        if(detail&&radii[0]>.09){
                            const circum=Math.max(.27,radii[0]*4.3);
                            const u=j/sides*circum,uu=(j+1)/sides*circum;
                            const vv=nextTravel*.90,v=travel*.90;
                            trunkSkin.vertex(last[j],previousDirection[j],u,v);
                            trunkSkin.vertex(last[k],previousDirection[k],uu,v);
                            trunkSkin.vertex(ring[k],directions[k],uu,vv);
                            trunkSkin.vertex(last[j],previousDirection[j],u,v);
                            trunkSkin.vertex(ring[k],directions[k],uu,vv);
                            trunkSkin.vertex(ring[j],directions[j],u,vv);
                        }else{
                            const color=j%7===3?wood:bark;
                            woodTriangle(color,last[j],last[k],ring[k]);
                            woodTriangle(color,last[j],ring[k],ring[j]);
                        }
                    }
                    travel=nextTravel;
                }
                last=ring;previousDirection=directions;
            }
        }
        function offsetPoint(p,a,r,y){return V(p.x+Math.cos(a)*r,p.y+y,p.z+Math.sin(a)*r);}

        function spray(p,yaw,tilt,width,height,light){
            const direction=V(Math.cos(yaw),0,Math.sin(yaw));
            const across=V(-direction.z,0,direction.x);
            const roll=range(-.23,.23);
            const first=positions.length/3, variant=Math.floor(random()*4);
            const flip=random()<.5, curved=.13*width;
            for(let j=0;j<3;j++){
                const v=j/2;
                for(let i=0;i<5;i++){
                    const u=i/4, dx=(u-.5)*width;
                    const reach=(v-.12)*height*Math.sin(tilt)+curved*(1-4*(u-.5)**2);
                    const y=(v-.12)*height*Math.cos(tilt)+dx*roll
                        +Math.sin(v*Math.PI)*height*.08-.12*Math.abs(dx);
                    const pt=p.clone().addScaledVector(direction,reach).addScaledVector(across,dx);
                    pt.y+=y;fit(pt);
                    positions.push(pt.x,pt.y,pt.z);
                    // A small leafy spray catches more skylight than a solid flat sheet.
                    const n=direction.clone().multiplyScalar(.30+.18*(1-v))
                        .addScaledVector(across,(u-.5)*.72);
                    n.y=.82+.30*v;n.normalize();normals.push(n.x,n.y,n.z);
                    const shade=light*(.78+.22*v)-.036*Math.abs(u-.5);
                    colors.push(Math.min(1.06,shade),Math.min(1.04,shade*(cherry?.975:1.015)),
                        Math.min(1.08,shade*(cherry?1.025:.96)));
                    uvs.push(((variant%2)+.002+.996*(flip?1-u:u))/2,
                        ((1-Math.floor(variant/2))+.002+.996*v)/2);
                }
            }
            for(let j=0;j<2;j++)for(let i=0;i<4;i++){
                const a=first+j*5+i;
                indices.push(a,a+1,a+6,a,a+6,a+5);
            }
        }
        const height=.96*cfg.rise*range(.96,1.06);
        const reach=cfg.reach*range(.92,1.08);
        const stemAt=t=>V(.19*Math.sin(t*3.6+offset)*t+.12*t,3.18*t*height,
            -.12*t+.12*Math.sin(t*4.6+offset)*t);
        if(!hollow){
            const levels=[0,.10,.34,.52,.68,.84,1], base=cfg.stem;
            branch(levels.map(stemAt),[1.27,.92,.69,.54,.40,.24,.095].map(r=>r*base),detail?11:8);
            for(let i=0;i<(detail?5:3);i++){
                const a=offset+i*1.28;
                branch([V(0,.27,0),offsetPoint(V(),a,.27,.11),offsetPoint(V(),a+.20,.52,-.016)],
                    [.132,.099,.020],6);
            }
            if(detail){
                for(let i=0;i<41;i++){
                    const t=range(.08,.53),p=stemAt(t);
                    const r=base*(1.02-.96*t),a=range(0,Math.PI*2);
                    const p1=offsetPoint(p,a,r,-.003),p2=offsetPoint(p,a+.26,r,.008);
                    const p3=offsetPoint(p,a+.58,r-.008,.012);
                    woodTriangle(edge,p1,p2,offsetPoint(p,a+.31,r+.002,.019));
                    woodTriangle(edge,p2,p3,offsetPoint(p,a+.34,r+.002,.021));
                }
            }
        }
        const limbCount=pine?6:detail?10:8;
        for(let j=0;j<limbCount;j++){
            const slot=j/(limbCount-1);
            const a=offset+j*2.39996+range(-.20,.20);
            const origin=stemAt(.39+slot*.52);
            if(hollow){origin.x-=.08;origin.y+=.24;}
            const length=reach*(1.52-.69*slot)*range(.85,1.03);
            const climb=(.77+.20*slot+range(-.10,.16))*(pine?.70:1);
            const knee=offsetPoint(origin,a+.12,length*.36,climb*.50);
            const elbow=offsetPoint(knee,a-.12,length*.48,climb*.38);
            const arm=offsetPoint(elbow,a+.21,length*.15,climb*.34);
            branch([origin,knee,elbow,arm],[.154-.071*slot,.105-.042*slot,.060,.026],detail?8:5);
            const forks=detail?4:3;
            for(let k=0;k<forks;k++){
                const t=k/(forks-1),w=range(.75,1.12);
                const az=a+(t-.5)*2.76+range(-.23,.23);
                const start=k%2===0?elbow.clone():elbow.clone().lerp(arm,.74);
                const end=offsetPoint(start,az,length*(.22+.15*w),(.14+.19*slot)*w);
                const shoot=offsetPoint(end,az+range(-.26,.26),.12*w,.18*w);
                branch([start,end,shoot],[.032,.018,.006],detail?5:4);
                const tilt=pine?range(.96,1.40):range(.45,1.14);
                const size=(detail?1.20:1.35)*w*(.97+.15*(1-slot));
                const light=.78+.22*slot+range(-.085,.085);
                spray(end,az,tilt,(cherry?1.58:1.46)*size,(pine?.78:1.02)*size,light);
                if(detail||k%2===0){
                    const bud=offsetPoint(shoot,az+.51,.11*w,.11);
                    spray(bud,az+range(1.55,2.52),tilt*.70,(cherry?1.16:1.05)*size,.81*size,light+.044);
                }
                if(cherry && seed%3!==0 && j%4===1 && k%2===0){
                    const droop=offsetPoint(shoot,az,.43*w,-.28*w);
                    const tassel=offsetPoint(droop,az+.18,.14*w,-.34*w);
                    branch([shoot,droop,tassel],[.018,.011,.004],4);
                    spray(droop,az+.06,2.07,.62*w,.66*w,light);
                    spray(tassel,az+.78,2.49,.32*w,.43*w,light-.08);
                }
                if(detail){
                    const count=cherry?2:4;
                    for(let n=0;n<count;n++){
                        const side=n%2?1:-1;
                        const leafPos=offsetPoint(end,az+side*.68,range(.18,.55)*w,range(.15,.45)*w);
                        fit(leafPos);
                        livingLeaf(parent,cherry?(n%2?springTint:blend(blossom??paper,ink,.14)):
                            (n%3===0?goldLeaf:leafShade),leafPos.x,leafPos.y,leafPos.z,
                            range(.115,.205),side*range(.5,1.2),-az+range(-.30,.30),1,liveShape,range(.27,.89));
                    }
                }
            }
        }
        trunkSkin.finish();
        for(const [color,vertices] of batches){
            const g=new T.BufferGeometry();
            g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeVertexNormals();
            mesh(parent,g,color);
        }
        const g=new T.BufferGeometry();
        g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
        g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
        g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
        g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);
        const canopy=mesh(parent,g,leaf);
        canopy.material=veil.material;
        canopy.customDepthMaterial=veil.depth;
    }
    return {
        sakura:(p,d,l)=>grow(p,d,l,'sakura'),
        oak:(p,d,l,hollow)=>grow(p,d,l,hollow?'sakura':'oak',hollow),
        birch:(p,d,l)=>grow(p,d,l,'birch'),
        willow:(p,d,l)=>grow(p,d,l,'willow'),
        fir:(p,d,l)=>grow(p,d,l,'fir'),
        update(time,reduced,ray){
            uniforms.t.value=time;uniforms.motion.value=reduced?0:1;
            uniforms.brushing.value=ray&&!reduced?1:0;
            if(ray){uniforms.eye.value.copy(ray.origin);uniforms.ray.value.copy(ray.direction);}
        },
        dispose(){
            for(const {texture,material,depth} of Object.values(arts)){
                texture.dispose();material.dispose();depth.dispose();
            }
            liveShape.dispose();
            releaseBark(kit);
        }
    };
}
