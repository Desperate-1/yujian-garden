// Timber frames and glazed, curved roof planes are assembled in metres. Meshes
// with the same finish are baked together after all the joinery is in place.
export function templeWorkshop(T,root){
    const stock=new Map(),textures=new Set(),paints=new Set(),parts=new Set(),batches=new Map();
    const cube=new T.BoxGeometry(1,1,1);
    const neutral=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});paints.add(neutral);
    // Granite grain, soft water stains and timber fibres follow the object in
    // world space across the assembled batches, including the small railings.
    neutral.onBeforeCompile=shader=>{
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 craftPoint;')
            .replace('#include <begin_vertex>','#include <begin_vertex>\ncraftPoint=position;');
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
           varying vec3 craftPoint;
           float grainHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
           float grain(vec3 pos){
              vec3 cell=floor(pos),a=fract(pos);a=a*a*(3.-2.*a);
              return mix(mix(mix(grainHash(cell),grainHash(cell+vec3(1,0,0)),a.x),
                         mix(grainHash(cell+vec3(0,1,0)),grainHash(cell+vec3(1,1,0)),a.x),a.y),
                     mix(mix(grainHash(cell+vec3(0,0,1)),grainHash(cell+vec3(1,0,1)),a.x),
                         mix(grainHash(cell+vec3(0,1,1)),grainHash(cell+vec3(1,1,1)),a.x),a.y),a.z);
           }`)
            .replace('#include <color_fragment>',`#include <color_fragment>
                vec3 pt=craftPoint;
                float timber=smoothstep(.12,.36,(vColor.r-vColor.b)/max(.1,vColor.r));
                float grains=grain(pt*41.)-.5,clouds=grain(pt*2.1+grain(pt*.63)*2.3)-.5;
                float fibres=grain(vec3(pt.x*37.,pt.y*.88,pt.z*32.));
                diffuseColor.rgb*=1.+clouds*.21+grains*.15+timber*(fibres-.5)*.34;
                diffuseColor.rgb*=1.-(1.-smoothstep(-.51,-.09,pt.y))*.29;
            `);
    };
    const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
    let state=99127;
    const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
    const tone=(a,b,f)=>new T.Color(a).lerp(new T.Color(b),f).getHex();
    function node(parent,x=0,y=0,z=0,angle=0){
        const g=new T.Group();g.position.set(x,y,z);g.rotation.y=angle;parent.add(g);return g;
    }
    function mesh(parent,geo,colour,x=0,y=0,z=0,finish=neutral){
        const m=new T.Mesh(geo,finish);m.position.set(x,y,z);m.userData.tint=colour;parent.add(m);parts.add(geo);return m;
    }
    function box(g,x,y,z,w,h,d,c){const o=mesh(g,cube,c,x,y,z);o.scale.set(w,h,d);return o;}
    function cylinder(rt,rb,n){
        const k=rt+','+rb+','+n;
        if(!stock.has(k))stock.set(k,new T.CylinderGeometry(rt,rb,1,n));
        return stock.get(k);
    }
    function rod(g,a,b,r,c,tip=r,n=7){
        const A=v(...a),B=v(...b),delta=B.clone().sub(A),len=delta.length();
        if(len<.0001)return;
        const m=mesh(g,cylinder(tip/r,1,n),c);
        m.position.copy(A.add(B).multiplyScalar(.5));m.scale.set(r,len,r);
        m.quaternion.setFromUnitVectors(v(0,1,0),delta.multiplyScalar(1/len));return m;
    }
    function pillar(g,x,z,y0,y1,r,c,rt=r,n=12){return rod(g,[x,y0,z],[x,y1,z],r,c,rt,n);}
    function curve(g,pts,r,c,n=6){
        for(let i=1;i<pts.length;i++)rod(g,pts[i-1],pts[i],r,c,r,n);
    }
    function sheet(g,positions,index,uv,c,finish=neutral){
        const geo=new T.BufferGeometry();
        geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
        if(uv)geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
        geo.setIndex(index);geo.computeVertexNormals();return mesh(g,geo,c,0,0,0,finish);
    }
    function surface(g,x,y,z,w,h,material,colour=0xffffff){
        return mesh(g,new T.PlaneGeometry(w,h),colour,x,y,z,material);
    }
    function finish(tex,settings={}){
        textures.add(tex);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
        const m=new T.MeshLambertMaterial({map:tex,vertexColors:true,side:T.DoubleSide,...settings});
        paints.add(m);return m;
    }
    function canvas(w,h,draw){
        const el=document.createElement('canvas');el.width=w;el.height=h;
        draw(el.getContext('2d'),w,h);return new T.CanvasTexture(el);
    }
    function asset(path){
        const texture=new T.TextureLoader().load(new URL(path,import.meta.url).href);
        textures.add(texture);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;return texture;
    }
    function bake(){
        root.updateMatrixWorld(true);
        const objects=[];root.traverse(m=>{if(m.isMesh)objects.push(m);});
        const point=v(),normal=v(),nm=new T.Matrix3();
        for(const m of objects){
            const geo=m.geometry,src=geo.getAttribute('position'),norm=geo.getAttribute('normal'),uv=geo.getAttribute('uv');
            const mat=m.material;
            if(!batches.has(mat))batches.set(mat,{positions:[],normals:[],uvs:[],colors:[],idx:[]});
            const b=batches.get(mat),base=b.positions.length/3,col=new T.Color(m.userData.tint);
            nm.getNormalMatrix(m.matrixWorld);
            for(let j=0;j<src.count;j++){
                point.fromBufferAttribute(src,j).applyMatrix4(m.matrixWorld);
                normal.fromBufferAttribute(norm,j).applyNormalMatrix(nm);
                b.positions.push(point.x,point.y,point.z);b.normals.push(normal.x,normal.y,normal.z);b.colors.push(col.r,col.g,col.b);
                if(mat.map)b.uvs.push(uv?uv.getX(j):0,uv?uv.getY(j):0);
            }
            const idx=geo.index;
            for(let j=0;j<(idx?idx.count:src.count);j++)b.idx.push(base+(idx?idx.getX(j):j));
        }
        root.clear();for(const geo of parts)geo.dispose();parts.clear();
        for(const [mat,b] of batches){
            const geo=new T.BufferGeometry();
            for(const [name,data,size] of [['position',b.positions,3],['normal',b.normals,3],['color',b.colors,3],['uv',b.uvs,2]]){
                if(data.length)geo.setAttribute(name,new T.Float32BufferAttribute(data,size));
            }
            geo.setIndex(b.idx);geo.computeBoundingSphere();parts.add(geo);
            const m=new T.Mesh(geo,mat);m.name=mat.name||'水庭木石';m.castShadow=true;m.receiveShadow=true;root.add(m);
        }
        batches.clear();
    }
    return {T,root,v,node,mesh,box,rod,pillar,curve,sheet,surface,canvas,asset,finish,tone,random,bake,
        dispose(){for(const g of parts)g.dispose();for(const m of paints)m.dispose();for(const t of textures)t.dispose();}};
}

export const courtPaint={
    tile:0x35575f,tileEdge:0x73949a,deep:0x273e44,wood:0x805637,darkWood:0x513e32,
    warm:0xad8052,gold:0xd8b56b,stone:0xb5b6a7,shade:0x8e9d98,pale:0xe2ddd0,
    green:0x557469,ivory:0xf4ead4,blue:0x587e89
};

export function gardenRoofs(k){
    const {box,pillar,rod,node,sheet,curve,surface,canvas,finish,random,tone}=k,p=courtPaint;
    // A barrel tile and its pan repeat with slightly different mineral marks
    // down each course. Real raised ribs carry the outline against the sky.
    const glaze=canvas(256,256,(c,w,h)=>{
        c.fillStyle='#677d80';c.fillRect(0,0,w,h);
        for(let n=0;n<3000;n++){
            c.fillStyle=random()<.5?'rgba(242,242,217,.085)':'rgba(16,35,46,.12)';
            c.fillRect(random()*w,random()*h,1+random()*4,1+random()*1.5);
        }
        for(let y=0;y<256;y+=64)for(let x=0;x<256;x+=32){
            const xx=x+(y%128?1:0);
            c.fillStyle='rgba(20,49,56,.38)';c.fillRect(xx,y,4,63);
            c.fillStyle='rgba(202,221,207,.38)';c.fillRect(xx+6,y,3,62);
            c.fillStyle='rgba(32,50,59,.52)';c.fillRect(xx+1,y+61,31,3);
            c.fillStyle='rgba(194,211,201,.40)';c.fillRect(xx+5,y+59,23,2);
        }
    });
    glaze.wrapS=glaze.wrapT=k.T.RepeatWrapping;const tileMat=finish(glaze);tileMat.name='青灰琉璃瓦';
    function roof(g,a,b,eave,rise,spine,grand=false){
        const lift=Math.min(.82,b*.25),rows=9,across=24;
        function at(face,u,t){
            const xh=a*(1-t)+spine*t,zh=b*(1-t),s=face%2===0?1:-1;
            const bend=lift*Math.pow(Math.abs(u),3.5)*Math.pow(1-t,1.12);
            const y=eave+rise*(.25*t+.75*t*t)+bend;
            return face<2?[xh*u,y,s*zh]:[s*xh,y,u*zh];
        }
        for(let f=0;f<4;f++){
            const pos=[],idx=[],uv=[];
            for(let j=0;j<=rows;j++)for(let i=0;i<=across;i++){
                const u=2*i/across-1,t=j/rows;pos.push(...at(f,u,t));uv.push(i/across*(f<2?a:b)*1.48,t*rise*1.8);
                if(j<rows&&i<across){const n=j*(across+1)+i;idx.push(n,n+1,n+across+2,n,n+across+2,n+across+1);}
            }
            // Outward-facing normals are required for the four independently curved roof planes.
            if(f===1||f===2)for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];
            sheet(g,pos,idx,uv,0xd0dfd9,tileMat);
            const count=Math.max(5,Math.floor((f<2?2*a:2*b)/.25));
            const edge=[];
            for(let i=0;i<=count;i++){
                const u=-1+2*i/count,point=at(f,u,0);edge.push(point);
                if(f<2 || i%2===0){
                    const next=at(f,u,.14);
                    rod(g,point,next,.040,p.tileEdge,.037,6);
                }
                if(i%2===0 && f<2){
                    const inside=at(f,u,.16);const lower=point.slice();lower[1]-=.094;
                    inside[1]-=.12;rod(g,lower,inside,.049,p.warm,.055,6);
                }
            }
            curve(g,edge,.074,p.deep,7);
            curve(g,edge.map(([x,y,z])=>[x,y-.065,z]),.047,p.gold,6);
            if(f<2){
                for(const side of [-1,1]){
                    const pts=Array.from({length:13},(_,i)=>at(f,side,i/12));
                    curve(g,pts.map(([x,y,z])=>[x,y+.068,z]),.101,p.tileEdge,8);
                    const tip=at(f,side,0);
                    const accent=[[tip[0]-side*.22,tip[1]+.02,tip[2]],[tip[0]+side*.09,tip[1]+.15,tip[2]+.04*(f? -1:1)],
                        [tip[0]+side*.21,tip[1]+.32,tip[2]+.08*(f?-1:1)],[tip[0]+side*.22,tip[1]+.48,tip[2]+.10*(f?-1:1)]];
                    for(let j=1;j<accent.length;j++)rod(g,accent[j-1],accent[j],.095-j*.017,p.deep,.076-j*.017,7);
                }
            }
        }
        box(g,0,eave+.02,0,2*a*.86,.20,2*b*.80,p.darkWood);
        if(spine>.06){
            rod(g,[-spine,eave+rise+.065,0],[spine,eave+rise+.065,0],.135,p.tileEdge,.135,10);
            for(const s of [-1,1]){
                const x=s*spine, y=eave+rise+.11;
                curve(g,[[x-.22*s,y,0],[x+.055*s,y+.11,0],[x+.14*s,y+.35,0],[x+.11*s,y+.54,0]],.081,p.deep);
                if(grand)rod(g,[x+.11*s,y+.48,0],[x-.06*s,y+.63,0],.086,p.gold,.024);
            }
        }else pillar(g,0,0,eave+rise,eave+rise+.56,.12,p.gold,.02);
    }
    function bracket(g,x,z,y,scale=1){
        const t=node(g,x,y,z);t.scale.setScalar(scale);
        box(t,0,0,0,.34,.155,.34,p.warm);
        for(const level of [0,1]){
            for(const s of [-1,1]){
                box(t,s*(.21+.16*level),.16+level*.15,0,.35,.117,.19,p.wood);
                box(t,s*(.36+.17*level),.235+level*.15,0,.19,.13,.235,p.warm);
                box(t,0,.16+level*.15,s*(.21+.16*level),.19,.117,.35,p.wood);
            }
        }
    }
    function post(g,x,z,y,h,r=.19){
        pillar(g,x,z,y,y+.13,r*1.69,p.shade,r*1.69);
        pillar(g,x,z,y+.13,y+.23,r*1.57,p.pale,r*1.29);
        pillar(g,x,z,y+.22,y+h-.30,r,p.wood,r*.92,14);
        pillar(g,x,z,y+.29,y+.33,r*1.04,p.warm);
        bracket(g,x,z,y+h-.40,r*4.3);
    }
    const brocade=finish(canvas(768,64,(c,W,H)=>{
        c.fillStyle='#45716b';c.fillRect(0,0,W,H);
        c.strokeStyle='#ccaa66';c.lineWidth=2;c.strokeRect(1,3,W-2,H-6);
        for(let i=0;i<W;i+=96){
            c.save();c.translate(i+47,H/2);c.strokeStyle='#c7a86c';c.lineWidth=2.4;
            for(const sx of [-1,1]){
                c.save();c.scale(sx,1);c.beginPath();c.moveTo(0,0);c.bezierCurveTo(10,-17,25,-22,36,-8);
                c.bezierCurveTo(45,2,27,15,24,5);c.bezierCurveTo(22,-4,31,-7,33,-1);c.stroke();c.restore();
            }
            c.fillStyle='#f0d499';c.rotate(Math.PI/4);c.fillRect(-3,-3,6,6);c.restore();
        }
    }));
    function beam(g,x,y,z,width){
        box(g,x,y,z,width,.29,.27,p.wood);box(g,x,y-.125,z+.025,width,.038,.29,p.gold);
        box(g,x,y+.17,z,width+.12,.110,.34,p.green);
        surface(g,x,y+.012,z+.139,width*.98,.178,brocade);
    }
    function lattice(g,x,y,z,w,h,style=0){
        box(g,x,y,z,w,h,.105,p.darkWood);
        box(g,x,y,z+.061,w-.10,h-.11,.023,style===2?p.blue:p.ivory);
        const nx=Math.max(3,Math.round(w/.28)),ny=Math.max(3,Math.round(h/.32));
        for(let i=0;i<=nx;i++)box(g,x+(i/nx-.5)*(w-.07),y,z+.096,.023,h-.08,.030,p.warm);
        for(let j=0;j<=ny;j++)box(g,x,y+(j/ny-.5)*(h-.06),z+.099,w-.06,.023,.035,p.wood);
        if(style===0){
            const dim=Math.min(w*.36,h*.35);
            curve(g,[[x-dim,y,z+.135],[x,y+dim,z+.135],[x+dim,y,z+.135],[x,y-dim,z+.135],[x-dim,y,z+.135]],.03,p.darkWood);
        }
    }
    const signs=new Map();
    function plaque(g,x,y,z,w,h,text){
        const tex=canvas(720,200,(c,W,H)=>{
            c.fillStyle='#214347';c.fillRect(0,0,W,H);
            for(const [pad,line] of [[5,5],[17,2]]){
                c.strokeStyle='#ddba72';c.lineWidth=line;c.strokeRect(pad,pad,W-2*pad,H-2*pad);
            }
            c.fillStyle='#f3d695';c.font='bold 118px "KaiTi","STKaiti","SimSun",serif';c.textBaseline='middle';c.textAlign='center';
            const stride=Math.min(145,(W-80)/text.length);[...text].forEach((s,i)=>c.fillText(s,W*.5+(i-(text.length-1)/2)*stride,H*.52));
        });
        if(!signs.has(text))signs.set(text,finish(tex));else tex.dispose();
        box(g,x,y,z,w+.07,h+.07,.09,p.darkWood);
        surface(g,x,y,z+.05,w,h,signs.get(text));
    }
    return {roof,post,beam,lattice,plaque};
}
