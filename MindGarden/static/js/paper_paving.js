// Broad limestone leaves laid in offset courses. Every flag has an upper face,
// a thin bevel and a vertical return; the original continuous path remains the hit surface.
export function layGardenStone(kit,root,path) {
    const {T,mesh,paper,gold}=kit;
    const upper=[],edges=[];
    const tri=(list,a,b,c)=>list.push(...a,...b,...c);
    function flag(loop,height){
        // Annular and straight courses arrive with opposite windings in the XZ plane.
        let area=0;
        for(let i=0;i<loop.length;i++){
            const a=loop[i],b=loop[(i+1)%loop.length];
            area+=a[0]*b[1]-b[0]*a[1];
        }
        if(area<0)loop=loop.slice().reverse();
        const cx=loop.reduce((s,p)=>s+p[0],0)/loop.length;
        const cz=loop.reduce((s,p)=>s+p[1],0)/loop.length;
        const base=[],shoulder=[],face=[];
        for(const [x,z] of loop){
            const dx=cx-x,dz=cz-z,n=Math.max(.18,Math.hypot(dx,dz));
            base.push([x,.055,z]);shoulder.push([x,height-.014,z]);
            face.push([x+.017*dx/n,height,z+.017*dz/n]);
        }
        for(let i=0;i<loop.length;i++){
            const j=(i+1)%loop.length;
            tri(upper,[cx,height,cz],face[j],face[i]);
            tri(upper,face[i],face[j],shoulder[j]);tri(upper,face[i],shoulder[j],shoulder[i]);
            tri(edges,shoulder[i],shoulder[j],base[j]);tri(edges,shoulder[i],base[j],base[i]);
        }
    }
    // Build slightly chipped corners by clipping each outline locally. This
    // preserves a consistent gap even when neighbouring stones have different sizes.
    function clipped(points,amount){
        const loop=[];
        for(let j=0;j<points.length;j++){
            const corner=points[j];
            for(const k of [(j+points.length-1)%points.length,(j+1)%points.length]){
                const dx=points[k][0]-corner[0],dz=points[k][1]-corner[1];
                const t=Math.min(.16,amount/Math.hypot(dx,dz));
                loop.push([corner[0]+t*dx,corner[1]+t*dz]);
            }
        }
        return loop;
    }
    for(const [inner,outer,count,offset] of [[3.52,4.13,27,.05],[4.15,5.17,22,.15],[5.19,6.13,26,-.058]]){
        const angle=i=>i*2*Math.PI/count+offset+.023*Math.sin(i*2*Math.PI/count*5);
        for(let i=0;i<count;i++){
            const a=angle(i)+.0027,b=angle(i+1)-.0027;
            const polar=(r,t)=>[r*Math.cos(t),r*Math.sin(t)];
            // Keep the long outer edge concentric instead of cutting through the adjacent course.
            const m=(a+b)/2,skew=.014*Math.sin(2.02*i+offset);
            const corners=[polar(inner,a),polar(inner,m),polar(inner,b),polar(outer,b+skew),polar(outer,m+skew),polar(outer,a+skew)];
            flag(clipped(corners,.025+.012*(1+Math.sin(i*2.30))),.088+.005*Math.sin(i*4.02));
        }
    }
    // The path widens on bends. Use the same cross-section as its clickable ribbon.
    function point(t,across){
        const p=path.getPointAt(t),f=path.getTangentAt(t);
        const width=1.45*(1+.12*Math.sin(t*4)+.055*Math.sin(t*18));
        return [p.x+f.z*across*width,p.z-f.x*across*width];
    }
    for(let side=0;side<2;side++){
        const bounds=[0];
        const offset=side ? .42 : 0;
        for(let i=1;i<21;i++)bounds.push((i+offset)*.044+.003*Math.sin(i*2.65+.2*side));
        for(let i=0;i+1<bounds.length;i++){
            const a=bounds[i]+.0008,b=bounds[i+1]-.0008;
            const centre=t=>.14*Math.sin(t*18)+.08*Math.cos(t*36);
            const left=t=>side?centre(t)+.006:-.977;
            const right=t=>side ? .977 : centre(t)-.006;
            const outline=[point(a,left(a)),point(a,right(a)),point(b,right(b)),point(b,left(b))];
            if(outline.some(([x,z])=>Math.hypot(x,z)<6.30))continue;
            flag(clipped(outline,.048),.083+.004*Math.cos(i*1.76+side));
        }
    }
    for(const [positions,color] of [[upper,paper],[edges,gold]]){
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
        g.computeVertexNormals();mesh(root,g,color);
    }
}
