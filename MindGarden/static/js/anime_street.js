import {smallLettering} from './anime_lettering.js';
// Local coordinates are metres. The asphalt flares around the fountain island.
const beds=[[-7.2,10.2,1.04,2.1],[7.1,12.3,.92,2.28],[-6.72,-13.1,1.62,2.15],
    [6.4,3.8,.82,1.56],[-7.0,21.5,.9,2.2],[5.42,-23.5,.55,1.28]];
export const inStreetBed=(x,z)=>beds.some(([cx,cz,w,d])=>Math.abs(x-cx)<w-.12&&Math.abs(z-cz)<d-.18);
const edgeAt=z=>4.65+2.45*Math.exp(-Math.pow(z/6.9,2));

export function layShoppingStreet(kit,root) {
    const {T,mesh,block,ink,paper,sky,gold,leaf,blossom}=kit;
    const mix=(a,b,t)=>new T.Color(a).lerp(new T.Color(b),t).getHex();
    const tar=mix(mix(ink,sky,.17),paper,.065), cement=mix(paper,ink,.36),joint=mix(ink,cement,.26);
    const chalk=mix(paper,sky,.13),ochre=mix(gold,paper,.16), verge=mix(leaf,sky,.32);
    const steel=mix(ink,sky,.24),soil=mix(ink,leaf,.18);
    const uniqueMaterials=[],textures=[];
    let seed=19078;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    function groundStrip(f1,f2,y,material,from=-83,to=62){
        const points=[],idx=[],uv=[];
        const steps=Math.ceil((to-from)/.55);
        for(let i=0;i<=steps;i++){
            const z=from+(to-from)*i/steps;
            for(const getX of [f1,f2]){
                const x=getX(z);points.push(x,y,z);uv.push(x/4,z/4);
            }
            const k=i*2;if(i<steps)idx.push(k,k+2,k+1,k+2,k+3,k+1);
        }
        const geo=new T.BufferGeometry();
        geo.setAttribute('position',new T.Float32BufferAttribute(points,3));
        geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
        geo.setIndex(idx);geo.computeVertexNormals();
        return mesh(root,geo,material);
    }
    // Tiled aggregate has no directional brush marks, so adjacent lanes share a surface.
    function asphaltPrint(){
        const c=document.createElement('canvas');c.width=c.height=256;
        const ctx=c.getContext('2d'),pixels=ctx.createImageData(256,256);
        for(let y=0;y<256;y++)for(let x=0;x<256;x++){
            const grain=229+Math.floor(18*random()+6*Math.sin(x*Math.PI/64)*Math.cos(y*Math.PI/128));
            const i=(y*256+x)*4; pixels.data.set([grain,grain,grain+1,255],i);
        }
        ctx.putImageData(pixels,0,0);
        const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;
        tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;textures.push(tex);return tex;
    }
    const asphalt=groundStrip(z=>-edgeAt(z),z=>edgeAt(z),.011,tar);
    const roadStock=asphalt.material.clone();roadStock.map=asphaltPrint();asphalt.material=roadStock;uniqueMaterials.push(roadStock);
    for(const side of [-1,1]){
        const ordered=(one,two)=>side>0?[one,two]:[two,one];
        const offset=d=>z=>side*(edgeAt(z)+d);
        const strip=(a,b,y,color)=>groundStrip(...ordered(offset(a),offset(b)),y,color);
        strip(-.92,-.12,.018,verge);strip(-.165,-.10,.026,chalk);
        strip(0,.22,.115,cement);strip(.22,5.7,.093,mix(cement,paper,.24));
        strip(-.09,.005,.041,joint);
        // The west tactile route passes round the back of the journal's old cherry tree.
        const tactile=d=>z=>side*(edgeAt(z)+d+(side<0?3.22*(1-T.MathUtils.smoothstep(Math.abs(z+13.1),2.14,5.7)):0));
        const tactileStrip=(a,b,y,c)=>groundStrip(...ordered(tactile(a),tactile(b)),y,c);
        tactileStrip(1.00,1.22,.101,ochre);
        for(let k=0;k<3;k++)tactileStrip(1.018+k*.063,1.035+k*.063,.105,mix(ochre,joint,.20));
        for(let z=-45;z<36;z+=1.48){
            const e=edgeAt(z),xe=side*e;
            block(root,joint,xe+side*.119,.116,z,.218,.005,.018);
            block(root,mix(cement,ink,.15),xe+side*1.1,.096,z,1.73,.005,.013);
            if(Math.round(z*10)%3===0){
                block(root,steel,xe-side*.081,.048,z,.22,.021,.52);
                for(let j=0;j<6;j++)block(root,ink,xe-side*.083,.061,z-.21+j*.080,.165,.008,.023);
            }
        }
    }
    for(const [lo,hi] of [[-78,-7.4],[7.4,58]])
        groundStrip(()=>-.055,()=>.055,.023,ochre,lo,hi);
    for(const z of [-18.9,8.5]){
        for(let i=-4;i<=4;i++)block(root,chalk,i*.97,.025,z,.56,.007,1.7);
        block(root,chalk,-2.25,.025,z+1.73,3.9,.006,.13);
    }
    function pavingDisk(x,z,r,y,c){
        const m=mesh(root,new T.CylinderGeometry(r,r,.10,80),c,x,y-.05,z);return m;
    }
    pavingDisk(0,0,4.32,.125,joint);pavingDisk(0,0,4.22,.14,cement);
    for(let i=0;i<70;i++){
        const a=i*Math.PI/35, m=block(root,joint,Math.sin(a)*4.12,.141,Math.cos(a)*4.12,.015,.004,.21);
        m.rotation.y=a;
    }
    function printedDisk(){
        const c=document.createElement('canvas');c.width=c.height=256;
        const ctx=c.getContext('2d');ctx.translate(128,128);ctx.fillStyle='#797986';ctx.fillRect(-128,-128,256,256);
        ctx.lineWidth=5;ctx.strokeStyle='#424453';
        for(const r of [120,113,91,38]){ctx.beginPath();ctx.arc(0,0,r,0,2*Math.PI);ctx.stroke();}
        for(let i=0;i<24;i++){
            ctx.save();ctx.rotate(i*Math.PI/12);ctx.strokeRect(-3,48,6,i%2?42:49);ctx.restore();
        }
        ctx.fillStyle='#bbb9bb';
        for(let i=0;i<5;i++){ctx.save();ctx.rotate(i*2*Math.PI/5);ctx.beginPath();ctx.ellipse(0,-14,7,15,0,0,Math.PI*2);ctx.fill();ctx.restore();}
        return c;
    }
    function decal(c,x,y,z,w,h,rotation=0,circular=false){
        const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;textures.push(tex);
        const m=mesh(root,circular?new T.CircleGeometry(.5,40):new T.PlaneGeometry(1,1),paper,x,y,z);
        m.rotation.set(-Math.PI/2,0,rotation);m.scale.set(w,h,1);
        const paint=m.material.clone();paint.color.set(0xffffff);paint.map=tex;paint.alphaTest=.34;paint.side=T.DoubleSide;
        m.material=paint;uniqueMaterials.push(paint);
    }
    for(const [x,z] of [[2.3,13],[-2.6,-10],[2,-30]])decal(printedDisk(),x,.032,z,.71,.71,0,true);
    const c=document.createElement('canvas');c.width=256;c.height=640;
    const ctx=c.getContext('2d');ctx.fillStyle='#e4e3df';ctx.font='700 132px '+smallLettering;
    ctx.textAlign='center';['礼','让','行','人'].forEach((ch,i)=>ctx.fillText(ch,128,130+i*151));
    decal(c,2.05,.035,13.8,1.20,3.1);
    for(const [cx,cz,w,d] of beds){
        block(root,joint,cx,.115,cz,w*2+.15,.096,d*2+.15);
        block(root,soil,cx,.169,cz,w*2,.028,d*2);
        for(const s of [-1,1]){
            block(root,cement,cx+s*w,.183,cz,.10,.09,2*d+.12);
            block(root,cement,cx,.183,cz+s*d,2*w,.09,.1);
        }
    }
    // Swept-up petals collect by the kerbs, drain slots and the lip of the island.
    const verts=[],indices=[];
    for(let i=0;i<710;i++){
        const z=(random()*55)-28,side=random()<.5?-1:1;
        const x=side*(edgeAt(z)-.20-random()**2*1.55),a=random()*Math.PI*2;
        const w=.012+random()*.030,h=w*(1.15+random()*.66),at=verts.length/3;
        for(const [u,v] of [[-w,0],[-w*.65,h*.66],[0,h*.48],[w*.67,h*.73],[w,0],[0,-h]]){
            verts.push(x+u*Math.cos(a)-v*Math.sin(a),.036,z+u*Math.sin(a)+v*Math.cos(a));
        }
        indices.push(at,at+1,at+2,at,at+2,at+5,at+2,at+3,at+4,at+2,at+4,at+5);
    }
    const petals=new T.BufferGeometry();petals.setAttribute('position',new T.Float32BufferAttribute(verts,3));
    petals.setIndex(indices);petals.computeVertexNormals();mesh(root,petals,mix(blossom,paper,.38));
    return {dispose(){textures.forEach(t=>t.dispose());uniqueMaterials.forEach(m=>m.dispose());}};
}
