import {mergeGeometries} from '../vendor/mediapipe/BufferGeometryUtils.js';

// Each cast side is cut through. Slats span both supports, with the bevel
// continuing around the ends instead of stopping at the front of the seat.
export function buildParkBench(kit,parent) {
    const {T,ink,leaf,paper,gold,mesh,rod}=kit;
    const side=new T.Shape();
    side.moveTo(-.33,.025);side.lineTo(-.18,.025);
    side.quadraticCurveTo(-.17,.20,-.07,.35);side.quadraticCurveTo(.06,.40,.15,.28);
    side.lineTo(.23,.025);side.lineTo(.365,.025);
    side.bezierCurveTo(.28,.23,.24,.39,.275,.56);
    side.quadraticCurveTo(.283,.72,.14,.78);side.lineTo(-.12,.80);
    side.quadraticCurveTo(-.235,.80,-.245,.89);side.lineTo(-.265,1.125);
    side.quadraticCurveTo(-.29,1.17,-.33,1.12);side.lineTo(-.285,.61);
    side.quadraticCurveTo(-.24,.36,-.33,.025);
    const opening=new T.Path();
    opening.moveTo(-.183,.70);opening.bezierCurveTo(-.10,.755,.17,.74,.192,.62);
    opening.quadraticCurveTo(.20,.53,.115,.535);opening.lineTo(-.145,.543);
    opening.quadraticCurveTo(-.21,.605,-.183,.70);side.holes.push(opening);
    function cut(shape,depth,bevel) {
        const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:7});
        g.translate(0,0,-depth/2);return g;
    }
    function plank(length,width){
        const s=new T.Shape(),l=length/2,w=width/2,r=.027;
        s.moveTo(-l+r,-w);s.lineTo(l-r,-w);s.quadraticCurveTo(l,-w,l,-w+r);
        s.lineTo(l,w-r);s.quadraticCurveTo(l,w,l-r,w);s.lineTo(-l+r,w);
        s.quadraticCurveTo(-l,w,-l,w-r);s.lineTo(-l,-w+r);s.quadraticCurveTo(-l,-w,-l+r,-w);
        return cut(s,.036,.009);
    }
    const bracket=cut(side,.05,.008), seat=plank(1.90,.115);
    const foot=new T.CylinderGeometry(.113,.136,.044,14),button=new T.SphereGeometry(.022,8,5);
    for(const x of [-.72,.72]){
        mesh(parent,bracket,ink,x,0,0).rotation.y=-Math.PI/2;
        for(const z of [-.255,.29])mesh(parent,foot,ink,x,.036,z).scale.set(.72,1,.89);
        const armPoints=[[.17,.737],[.12,.779],[-.025,.799],[-.18,.817],[-.248,.868]];
        const cap=new T.CatmullRomCurve3(armPoints.map(([z,y])=>new T.Vector3(x,y,z)));
        mesh(parent,new T.TubeGeometry(cap,14,.024,7,false),gold);
    }
    for(let i=0;i<4;i++){
        const z=-.205+i*.145;
        const slat=mesh(parent,seat,i%2?gold:paper,0,.54-.023*Math.cos((i-1.4)*.92),z);
        slat.rotation.x=-Math.PI/2;
        for(const x of [-.72,.72])mesh(parent,button,ink,x,slat.position.y+.026,z).scale.set(.72,.33,.72);
    }
    for(const [y,w] of [[.82,.115],[.99,.18]]){
        const z=-.261-(y-.82)*.15;
        mesh(parent,plank(1.92,w),paper,0,y,z).rotation.x=-.14;
        for(const x of [-.72,.72])mesh(parent,button,gold,x,y,z+.026).scale.z=.44;
    }
    rod(parent,leaf,[-.70,.29,-.17],[.70,.29,-.17],.022);
}

// Treat each moving joint as a small physical assembly. The two print faces,
// translucent glass, hit areas and articulated children remain separate.
export function batchHardware(T,root,paints,geometries,materials) {
    const painted=new Set(paints.values());
    const material=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
    materials.push(material);
    const joints=[];
    root.traverse(o=>{if(o.isGroup)joints.push(o);});
    for(const joint of joints) {
        const fixed=joint.children.filter(o=>o.isMesh && o.visible && painted.has(o.material));
        if(fixed.length<2)continue;
        const cuts=[];
        for(const part of fixed) {
            const shape=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();
            for(const attr of Object.keys(shape.attributes)) {
                if(attr!=='normal' && attr!=='position')shape.deleteAttribute(attr);
            }
            if(!shape.getAttribute('normal'))shape.computeVertexNormals();
            part.updateMatrix();shape.applyMatrix4(part.matrix);
            const {r,g,b}=part.material.color;
            const rgb=new Float32Array(shape.getAttribute('position').count*3);
            for(let i=0;i<rgb.length;i+=3){rgb[i]=r;rgb[i+1]=g;rgb[i+2]=b;}
            shape.setAttribute('color',new T.BufferAttribute(rgb,3));cuts.push(shape);
        }
        const geometry=mergeGeometries(cuts);
        for(const piece of cuts)piece.dispose();
        if(!geometry)continue;
        joint.remove(...fixed);joint.add(new T.Mesh(geometry,material));geometries.add(geometry);
    }
    const kept=new Set();
    root.traverse(o=>{if(o.isMesh)kept.add(o.geometry);});
    for(const g of geometries)if(!kept.has(g)){g.dispose();geometries.delete(g);}
}

export function dressMechanisms(T,kit,door,latch,letter,flap,stand,frame) {
    const {mesh,silhouette,rod}=kit;
    const V=(x,y,z)=>new T.Vector3(x,y,z);
    function wire(parent,color,points,radius) {
        const path=new T.CatmullRomCurve3(points.map(p=>V(...p)));
        return mesh(parent,new T.TubeGeometry(path,Math.max(10,points.length*3),radius,6,false),color);
    }
    function rivet(parent,x,y,z,r) {
        const head=mesh(parent,new T.SphereGeometry(r,10,6),'gold',x,y,z);
        head.scale.z=.50;
    }
    // Cast, pierced backplate and teardrop handle. The handle moves on the hinge pin.
    const escutcheon=new T.Shape();
    escutcheon.moveTo(0,.235);escutcheon.bezierCurveTo(.052,.17,.145,.18,.14,.096);
    escutcheon.bezierCurveTo(.123,.056,.085,.05,.09,-.015);
    escutcheon.bezierCurveTo(.085,-.107,.15,-.14,.07,-.205);
    escutcheon.quadraticCurveTo(.035,-.205,0,-.242);
    escutcheon.quadraticCurveTo(-.045,-.203,-.075,-.20);
    escutcheon.bezierCurveTo(-.15,-.134,-.083,-.07,-.09,-.012);
    escutcheon.bezierCurveTo(-.085,.054,-.14,.061,-.14,.101);
    escutcheon.bezierCurveTo(-.14,.17,-.043,.166,0,.235);
    for(const sign of [-1,1]){
        const hole=new T.Path(),x=sign*.083;
        hole.absellipse(x,.103,.017,.035,0,Math.PI*2,false,sign*.55);
        escutcheon.holes.push(hole);
    }
    const plate=new T.ExtrudeGeometry(escutcheon,{depth:.019,bevelEnabled:true,bevelSize:.009,bevelThickness:.006,bevelSegments:2,curveSegments:9});
    mesh(door,plate,'gold',.53,.88,.067);
    rivet(door,.53,1.055,.10,.019);rivet(door,.53,.69,.10,.017);
    const pull=new T.CatmullRomCurve3([[0,0,.055],[-.065,-.026,.068],[-.104,-.125,.084],[-.087,-.195,.092],
        [0,-.24,.094],[.087,-.195,.092],[.104,-.125,.084],[.065,-.026,.068]].map(p=>V(...p)),true);
    mesh(latch,new T.TubeGeometry(pull,42,.019,9,true),'gold');
    rod(latch,'ink',[-.075,-.007,.058],[.075,-.007,.058],.028);
    for(const x of [-.077,.077])rivet(latch,x,-.007,.067,.026);
    for(const y of [.27,1.25])for(const x of [.052,.156])rivet(door,x,y,.078,.015);

    // Thin folded side gussets and an irregular wax medallion with a raised leaf.
    for(const side of [-1,1]){
        const x=side*.605;
        silhouette(letter,'gold',[[x,-.3],[side*.646,-.245],[side*.648,.238],[x,.20]],.056,0,0,.004);
        wire(letter,'paper',[[x,-.28,.045],[side*.626,-.14,.050],[side*.618,.12,.05]],.008);
    }
    const sealShape=new T.Shape();
    for(let i=0;i<=48;i++){
        const a=i*Math.PI/24,r=.097+.007*Math.sin(3*a+.4)+.005*Math.cos(5*a);
        const x=Math.cos(a)*r,y=Math.sin(a)*r*.93;
        if(i===0)sealShape.moveTo(x,y);else sealShape.lineTo(x,y);
    }
    const sealGeo=new T.ExtrudeGeometry(sealShape,{depth:.022,bevelEnabled:true,bevelThickness:.006,bevelSize:.006,bevelSegments:2});
    mesh(flap,sealGeo,'gold',.025,-.276,.038);
    const rim=mesh(flap,new T.TorusGeometry(.074,.006,6,32),'ink',.025,-.276,.066);rim.scale.y=.94;
    silhouette(flap,'leaf',[[-.048,-.034],[-.021,.014],[.048,.039],[.021,-.019],[-.018,-.033]],.007,.025,-.276,.071);
    rod(flap,'gold',[-.011,-.298,.081],[.057,-.250,.081],.005);

    // A continuous mitred moulding, with an outer bead, hollow and gilt sight edge.
    // The frame has the same profile on the back since it rotates around its shaft.
    const section=[[.986,.711,.035,'ink'],[.981,.706,.079,'gold'],[.963,.688,.096,'paper'],
        [.951,.676,.093,'gold'],[.941,.666,.078,'ink'],[.927,.652,.071,'leaf'],
        [.911,.636,.086,'gold'],[.899,.624,.096,'paper'],[.884,.609,.090,'gold'],[.878,.603,.078,'ink']];
    function rectangle(w,h,z){return [[-w,-h,z],[w,-h,z],[w,h,z],[-w,h,z]];}
    for(const face of [-1,1]){
        for(let j=1;j<section.length;j++){
            const [outerW,outerH,outerZ]=section[j-1],[w,h,z,ink]=section[j];
            const a=rectangle(outerW,outerH,face*outerZ),b=rectangle(w,h,face*z),verts=[];
            for(let i=0;i<4;i++){const k=(i+1)%4;verts.push(...a[i],...a[k],...b[k],...a[i],...b[k],...b[i]);}
            const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));geo.computeVertexNormals();mesh(frame,geo,ink);
        }
        for(const sx of [-1,1])for(const sy of [-1,1]){
            const x=.946*sx,y=.67*sy,z=face*.101;
            wire(frame,'gold',[[x-.135*sx,y,z],[x-.05*sx,y-.017*sy,z],[x-.013*sx,y-.047*sy,z],[x,y-.127*sy,z]],.008);
            rivet(frame,x-.023*sx,y-.024*sy,z,.013);
        }
    }
    for(const side of [-1,1]){
        const x=side*.993;
        const boss=mesh(stand,new T.LatheGeometry([[.045,-.075],[.079,-.064],[.08,-.038],[.096,-.027],[.10,0],[.081,.024],[.073,.036],[.044,.057]]
            .map(([r,h])=>new T.Vector2(r,h)),18),'gold',x,1.51,0);
        boss.rotation.z=side*Math.PI/2;
        rod(stand,'ink',[side*1.15,.29,-.37],[side*1.10,.51,.43],.029);
        const toe=mesh(stand,new T.SphereGeometry(.085,12,8),'ink',side*1.11,.11,.56);toe.scale.set(1.3,.48,1.40);
    }
}
