import {courtPaint as p} from './noon_temple_craft.js';

// Uneven shorelines break up the masonry along the lake. The skiff and
// the water lilies are modelled at pedestrian scale beside the promenade.
export function dressWaterside(k,plants){
    const {T,node,mesh,box,rod,pillar,sheet,root,random,tone}=k;
    const {boulder,grass,tree}=plants,tau=Math.PI*2;
    function shore(x,z,w,d,h){
        const group=node(root,x,0,z),pos=[],ind=[],outline=[];
        const n=25;
        for(let i=0;i<n;i++){
            const a=tau*i/n,r=.86+.13*random()+.09*Math.sin(3*a);
            outline.push([Math.cos(a)*w*r,Math.sin(a)*d*r]);
        }
        pos.push(0,h+.025,0);
        for(const [xx,zz] of outline)pos.push(xx*.92,h,zz*.92);
        for(let i=0;i<n;i++)ind.push(0,1+(i+1)%n,1+i);
        sheet(group,pos,ind,null,0x77855e);
        for(let i=0;i<n;i++){
            const [xx,zz]=outline[i],[nx,nz]=outline[(i+1)%n];
            const j=random();boulder(group,xx*.94,-.46,zz*.94,1.2+j*.70,h+.45+random()*.32,1.02+random()*.64,
                tone(0x888e86,0xb8b5a0,random()));
            boulder(group,(xx+nx)*.43,h-.13,(zz+nz)*.43,.87+random()*.47,.39+random()*.29,.77+random()*.42,
                tone(0x6c8361,0x8b9c65,random()));
            if(i%2===0)grass(x+xx*.87,z+zz*.87,.48+random()*.21,true,h-.10);
        }
        return group;
    }
    const skiff=node(root,-11.00,-.68,5.7,-.60);
    const sections=19;
    const coords=(i,level,side)=>{
        const u=i/sections,s=Math.sin(u*Math.PI),edge=.15*(1-s)**2;
        return [(u-.5)*4.26,.03+.12*level+.21*(1-s)**2,side*(s**.76*.57+.018)*(.42+.30*level)+side*edge*.04];
    };
    for(const side of [-1,1])for(let level=0;level<3;level++){
        const ps=[],ids=[];
        for(let i=0;i<=sections;i++){
            ps.push(...coords(i,level,side),...coords(i,level+1,side));
            if(i<sections){const n=2*i;ids.push(n,n+2,n+1,n+1,n+2,n+3);}
        }
        sheet(skiff,ps,ids,null,[p.darkWood,p.wood,p.warm][level]);
        k.curve(skiff,Array.from({length:sections+1},(_,i)=>coords(i,level+1,side)),.022,level===2?p.gold:p.darkWood,5);
    }
    for(const xx of [-1.34,-.83,-.32,.19,.70,1.22])box(skiff,xx,.32,0,.20,.055,.56+Math.sin((xx+2.13)/4.26*Math.PI)*.52,p.warm);
    // Woven bamboo canopy bends across the gunwales on four arched ribs.
    const aPoints=[],aIndex=[];
    for(let j=0;j<=8;j++)for(let i=0;i<=18;i++){
        const a=Math.PI*i/18,x=-1.14+j*.17;
        aPoints.push(x,.43+Math.sin(a)*.84,.58*Math.cos(a));
        if(j<8&&i<18){const n=j*19+i;aIndex.push(n,n+19,n+1,n+1,n+19,n+20);}
    }
    sheet(skiff,aPoints,aIndex,null,p.warm);
    for(const xx of [-1.15,-.70,-.24,.23])k.curve(skiff,Array.from({length:19},(_,i)=>[xx,.44+Math.sin(Math.PI*i/18)*.86,.59*Math.cos(Math.PI*i/18)]),.027,p.darkWood,5);
    for(let i=1;i<15;i++){const a=Math.PI*i/15;
        rod(skiff,[-1.13,.45+Math.sin(a)*.84,.58*Math.cos(a)],[.22,.45+Math.sin(a)*.84,.58*Math.cos(a)],.012,p.gold,.012,4);}
    rod(skiff,[-.03,.78,-.45],[1.89,.05,.70],.027,p.warm,.030);
    const shoreR=shore(16.5,-5.25,5.45,2.38,1.23);
    tree(16.67,-5.38,1.16,1.9,false,false,1.2);
    tree(18.8,-6.26,.76,3.1,false,true,1.16);
    shore(-16.5,-9.4,6.1,4.20,.17);
    shore(16.8,-26.0,8.32,4.7,.16);
    shore(-15,-25.9,8.35,4.80,.12);
    // Stone water spout and small cascade on the front of the reed island.
    const dropX=-2.45,dropZ=2.92;
    for(let i=0;i<6;i++)box(shoreR,dropX+(i-2.5)*.31,.38,dropZ-.15,.29,1.11,.75,tone(p.shade,p.stone,i/7));
    box(shoreR,dropX,1.01,dropZ,2.1,.16,.78,p.stone);
    const waterUniform={value:0};
    const falling=new T.Mesh(new T.PlaneGeometry(1.64,1.54),new T.ShaderMaterial({
        transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{clock:waterUniform},
        vertexShader:'varying vec2 coord;void main(){coord=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:`uniform float clock;varying vec2 coord;void main(){
            float streak=.5+.5*sin(coord.x*157.+sin(coord.x*43.)+sin(coord.y*23.+clock*6.)*.53);
            float sheet=.5+.5*sin(coord.x*56.+sin(coord.y*12.+clock*4.));
            float edge=smoothstep(0.,.07,coord.x)*smoothstep(0.,.07,1.-coord.x);
            gl_FragColor=vec4(mix(vec3(.43,.76,.74),vec3(.91,.98,.93),streak*.66),edge*(.22+.46*sheet+.25*streak));
            #include <colorspace_fragment>
        }`
    }));
    falling.position.set(16.5+dropX,.19,-5.25+dropZ+.41);falling.rotation.x=-.08;falling.renderOrder=3;
    const foam=new T.Group();foam.name='叠水与涟漪';foam.add(falling);
    const foamMat=new T.MeshBasicMaterial({color:0xdde5ce,transparent:true,opacity:.46,depthWrite:false,side:T.DoubleSide});
    const rings=new T.RingGeometry(.92,1,42);
    for(let i=0;i<5;i++){
        const o=new T.Mesh(rings,foamMat);o.rotation.x=-Math.PI/2;o.position.set(falling.position.x+(i-2)*.27,-.605,falling.position.z+i*.061);
        o.scale.set(.47+i*.12,.23+i*.074,1);o.renderOrder=3;foam.add(o);
    }
    function lotus(x,z,size,petals){
        const g=node(root,x,-.58,z);g.scale.setScalar(size);
        const pos=[0,.013,0],idx=[];
        for(let i=0;i<=18;i++){
            const a=.18+tau*.91*i/18,r=.26*(.82+.16*random());
            pos.push(r*Math.cos(a),.014+.012*Math.cos(a*3),r*Math.sin(a));
            if(i)idx.push(0,i+1,i);
        }
        sheet(g,pos,idx,null,tone(0x436c57,0x75956b,random()));
        if(!petals)return;
        rod(g,[.03,.03,0],[.07,.26,.03],.008,p.green);
        for(let j=0;j<2;j++)for(let i=0;i<7-j;i++){
            const a=i*tau/(7-j)+j*.4,cs=Math.cos(a),sn=Math.sin(a),r=.135-.046*j,h=.048+j*.048;
            const tip=[.07+cs*r,.26+h,.03+sn*r];
            sheet(g,[.07,.24,.03,.07+cs*r*.55-sn*.044,.26+h*.25,.03+sn*r*.55+cs*.044,
                ...tip,.07+cs*r*.55+sn*.044,.26+h*.25,.03+sn*r*.55-cs*.044],[0,1,2,0,2,3],null,j?p.ivory:0xe4c6ac);
        }
        pillar(g,.07,.03,.259,.28,.035,p.gold,.043,7);
    }
    for(const [cx,cz,extent,count] of [[-6.9,8.3,1.55,38],[6.1,8.7,2.1,51],[10.4,-3.0,1.56,31],[-13.3,-4.50,1.8,24],[-3.3,-12.75,1.08,18]]){
        for(let i=0;i<count;i++){
            const a=random()*tau,r=Math.sqrt(random())*extent;
            lotus(cx+Math.sin(a)*r,cz+Math.cos(a)*r,.66+random()*.82,i%6===0);
        }
    }
    return {attach(scene){scene.add(foam);},update(t,reduced){waterUniform.value=reduced?0:t;},dispose(){
        foam.removeFromParent();foamMat.dispose();rings.dispose();falling.geometry.dispose();falling.material.dispose();
    }};
}
