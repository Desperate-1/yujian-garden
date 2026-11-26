import {barkSurface} from './anime_botany_bark.js';

// The old flowering cherry has an open hollow in its actual trunk.
export function dressTree(tree, kit) {
    const {T,ink,gold,leaf,paper,sky,mesh,group,rod,coin,cut,polygon}=kit;
    const bark=new T.Color(ink).lerp(new T.Color('#66515b'),.64).getHex();
    const darkBark=new T.Color(ink).lerp(new T.Color('#443742'),.58).getHex();
    const sapwood=new T.Color(bark).lerp(new T.Color(paper),.28).getHex();
    const tau=Math.PI*2;
    const v=(x,y,z)=>new T.Vector3(x,y,z);
    const mix=(a,b,t)=>a+(b-a)*t;
    const batches=new Map();
    const skin=barkSurface(kit,tree);
    function tri(color,a,b,c) {
        if(!batches.has(color))batches.set(color,[]);
        batches.get(color).push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
    }
    function quad(color,a,b,c,d){tri(color,a,b,d);tri(color,b,c,d);}
    function patchRing(a,b,color){
        for(let i=0;i<a.length;i++){
            const j=(i+1)%a.length;
            quad(typeof color==='function'?color(i):color,a[i],a[j],b[j],b[i]);
        }
    }

    // Polar coordinates keep the bark, growth ridges and the lip of the hollow
    // on the same rounded surface. A bend through the stem continues into the arms.
    const segments=56, delta=tau/segments, half=7*delta;
    function center(y){return -.068*Math.exp(-2.8*y)+.046*Math.sin(2.8*y+.3)-.063*y+.022*Math.max(0,y-1.5);}
    function trunk(a,y,lift=0) {
        const base=Math.exp(-y*4.9);
        const fluting=.021*Math.cos(7*a-1.3*y)+.012*Math.sin(11*a+2*y)+.010*Math.sin(3*a+5*y);
        const flare=base*(.027+.068*(.52+.48*Math.cos(5*a-.7)));
        const taper=Math.max(.045,.49-.092*y-.046*T.MathUtils.smoothstep(y,1.10,2.20));
        const r=taper+fluting+flare+lift;
        // Widen the flanks and the rear of the ancient trunk. Keep the front
        // sill at the same depth as the letter mechanism fixed inside the hollow.
        const breadth=1.14-.20*T.MathUtils.smoothstep(Math.abs(a),half-.03,1.7);
        return v(center(y)+Math.sin(a)*r*breadth,y,Math.cos(a)*r*(.91+.13*(1-Math.cos(a)))+.005+.014*Math.cos(y*3.3));
    }
    const lipBottom=s=>.125+.045*s+.014*Math.sin(s*3.7);
    const lipTop=s=>.48+.472*Math.sqrt(Math.max(0,1-s*s))-.057*s+.032*Math.sin((s+.35)*3.2);
    function barkLevels(a){
        const s=T.MathUtils.clamp(a/half,-1,1);
        return [-.025,lipBottom(s),lipTop(s),1.10,1.28,1.53,1.82,2.07,2.30,2.55];
    }
    function skinVertex(a,y){
        const around=trunk(a+.006,y).sub(trunk(a-.006,y));
        const vertical=trunk(a,y+.006).sub(trunk(a,y-.006));
        skin.vertex(trunk(a,y),around.cross(vertical).normalize(),a/tau+.5,y*1.24);
    }
    for(let i=0;i<segments;i++){
        const a=-Math.PI+i*delta,b=a+delta, la=barkLevels(a),lb=barkLevels(b);
        for(let j=0;j<la.length-1;j++){
            // The entire front face is absent here. The lower sill is a piece of the trunk.
            if(j===1 && Math.abs((a+b)/2)<half)continue;
            skinVertex(a,la[j]);skinVertex(b,lb[j]);skinVertex(b,lb[j+1]);
            skinVertex(a,la[j]);skinVertex(b,lb[j+1]);skinVertex(a,la[j+1]);
        }
    }
    const rim=[];
    for(let i=-7;i<=7;i++)rim.push(trunk(i*delta,lipTop(i/7)));
    for(let i=1;i<5;i++)rim.push(trunk(half,mix(lipTop(1),lipBottom(1),i/5)));
    for(let i=7;i>=-7;i--)rim.push(trunk(i*delta,lipBottom(i/7)));
    for(let i=1;i<5;i++)rim.push(trunk(-half,mix(lipBottom(-1),lipTop(-1),i/5)));
    const recessCenter=v(.026,.43,.01);
    function inset(sx,sy,depth,wobble) {
        return rim.map((p,i)=>v(
            recessCenter.x+(p.x-recessCenter.x)*(sx+.016*Math.sin(i*.87)*wobble)+.025*(1-sx),
            recessCenter.y+(p.y-recessCenter.y)*(sy+.012*Math.cos(i*.72)*wobble),
            p.z-depth+.009*Math.sin(i*.79)*wobble));
    }
    const torn=inset(.94,.945,.031,1),reveal=inset(.84,.87,.091,1.5);
    const inner=inset(.74,.77,.185,1.6),chamber=inset(.53,.58,.33,1.3),rear=inset(.20,.28,.385,.8);
    patchRing(rim,torn,i=>i<13&&i%7!==1?sapwood:bark);
    patchRing(torn,reveal,i=>i<=3||i>=20&&i<=27?darkBark:bark);
    patchRing(reveal,inner,i=>i<=5||i>=25?bark:darkBark);
    patchRing(inner,chamber,ink);patchRing(chamber,rear,ink);
    for(let i=0;i<rear.length;i++)tri(ink,rear[i],rear[(i+1)%rear.length],v(.046,.42,-.045));
    for(let i=1;i<rim.length;i+=3){
        const j=(i+1)%rim.length;
        const p=rim[i].clone().lerp(torn[i],.70),q=reveal[i].clone().lerp(inner[i],.35);
        tri(sapwood,p,q,q.clone().lerp(reveal[j],.09));
    }

    // Tapered limbs and roots follow three-dimensional curves. Every section
    // twists slightly with the grain, all the way into the contact with the soil.
    function branch(points,radii,color,facets=10,seed=0) {
        const curve=new T.CatmullRomCurve3(points.map(p=>v(...p)));
        const steps=(points.length-1)*3;
        const frames=curve.computeFrenetFrames(steps,false);
        const timber=radii[0]>.062,circum=Math.max(.24,radii[0]*3.4);
        const length=curve.getLength();
        let ring,previousNormals;
        for(let i=0;i<=steps;i++){
            const t=i/steps,p=curve.getPointAt(t),u=t*(radii.length-1);
            const r=mix(radii[Math.floor(u)],radii[Math.min(radii.length-1,Math.ceil(u))],u%1);
            const next=[],normals=[];
            for(let j=0;j<facets;j++){
                const a=j/facets*tau+.048*Math.sin(t*4+seed);
                const d=r*(1+.055*Math.sin(a*3+seed+t));
                const n=frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i],Math.sin(a));
                normals.push(n);next.push(p.clone().addScaledVector(n,d));
            }
            if(ring){
                if(timber){
                    const vv=t*length*1.16,v=(i-1)/steps*length*1.16;
                    for(let j=0;j<facets;j++){
                        const k=(j+1)%facets,u=j/facets*circum,uu=(j+1)/facets*circum;
                        skin.vertex(ring[j],previousNormals[j],u,v);
                        skin.vertex(ring[k],previousNormals[k],uu,v);
                        skin.vertex(next[k],normals[k],uu,vv);
                        skin.vertex(ring[j],previousNormals[j],u,v);
                        skin.vertex(next[k],normals[k],uu,vv);
                        skin.vertex(next[j],normals[j],u,vv);
                    }
                }else patchRing(ring,next,color);
            }
            ring=next;previousNormals=normals;
        }
        return ring;
    }
    branch([[-.10,1.65,-.005],[-.43,2.01,-.05],[-.77,2.17,-.14],[-1.11,2.52,-.09]],[.34,.27,.185,.067],bark);
    branch([[-.17,1.89,.04],[.06,2.33,.015],[.24,2.75,-.08],[.63,3.08,-.09]],[.32,.29,.205,.061],bark);
    branch([[.10,2.39,-.02],[.34,2.59,.14],[.49,2.63,.28],[.71,2.87,.40]],[.20,.14,.089,.034],darkBark);
    // The east curb is closer to the bole than the west one. Thick roots
    // begin inside the trunk, then turn down into the bed before the kerb.
    const rootAngles=[-2.72,-1.98,-1.31,-.88,1.08,1.75,2.44,2.99];
    const rootY=tree.rotation.y,scale=tree.scale.x;
    function rootReach(a){
        const x=Math.sin(a+rootY)*scale,z=Math.cos(a+rootY)*scale;
        return Math.min(.93,
            (x>0?1.04:1.69)/Math.max(.0001,Math.abs(x)),
            (z>0?1.73:2.03)/Math.max(.0001,Math.abs(z)));
    }
    for(const [i,theta] of rootAngles.entries()){
        const turn=.12*Math.sin(i*3.1+.5),reach=rootReach(theta+turn);
        const ground=(r,a,y)=>[Math.sin(a)*r,y,Math.cos(a)*r];
        const front=Math.cos(theta)>.42;
        const route=[ground(front?.44:.30,theta,front?.055:.33),ground(front?.45:.38,theta,front?.057:.22),
            ground(mix(.38,reach,.52),theta+turn*.38,front?.043:.108),
            ground(reach,theta+turn,-.030),ground(reach+.14,theta+turn,-.115)];
        branch(route,[front?.046:.15,front?.059:.14,front?.040:.090,.032,.012],bark,13,i);
    }

    // The snipped side branch has true end grain on its angled cut face.
    const stub=branch([[.18,1.26,-.04],[.35,1.36,.02],[.45,1.42,.09],[.51,1.45,.15]],[.15,.12,.085,.073],bark,18);
    function face(p){return p.reduce((a,b)=>a.add(b),v(0,0,0)).divideScalar(p.length);}
    const tip=face(stub);
    for(let i=0;i<stub.length;i++)tri(sapwood,tip,stub[i],stub[(i+1)%stub.length]);
    for(const [i,r] of [[0,.91],[1,.70],[2,.46],[3,.25]]){
        const ring=s=>stub.map((pt,j)=>tip.clone().lerp(pt,s*(1+.038*Math.sin(3*j+i))).add(v(.003*i,.001*i,.004+i*.0005)));
        patchRing(ring(r),ring(r-.034),i%3?bark:darkBark);
    }

    // A wren assembled as a small rounded paper sculpture. Overlapping wings,
    // embroidered eye ring, two primaries and an upturned tail survive a side view.
    const twig=[[.34,.85,.20],[.47,.94,.28],[.66,.998,.35],[.88,1.03,.35]];
    branch(twig,[.040,.030,.019,.007],ink,7);
    branch([twig[1],[.52,1.01,.28],[.55,1.08,.25]],[.021,.013,.004],gold,6);
    const bird=group(tree,.651,1.014,.355,-.12);
    bird.scale.setScalar(.56);
    function ellipsoid(color,x,y,z,rx,ry,rz,tilt=0) {
        const m=mesh(bird,new T.SphereGeometry(1,18,11),color,x,y,z);
        m.scale.set(rx,ry,rz);m.rotation.z=tilt;return m;
    }
    ellipsoid(leaf,-.016,.148,0,.146,.091,.088,.22);
    ellipsoid(paper,.029,.132,.016,.104,.074,.081,.34);
    ellipsoid(ink,.079,.206,0,.077,.077,.069,.06);
    ellipsoid(sky,.097,.191,.026,.061,.052,.060,.06);
    const feather=cut(polygon([[0,0],[-.022,.014],[-.12,.027],[-.18,.057],[-.187,.042],[-.12,.004],[-.044,-.015]]),.012);
    for(let i=0;i<3;i++){
        const tail=mesh(bird,feather,i===1?leaf:ink,-.097,.159,-.014+i*.014);
        tail.rotation.z=-.24-i*.065;tail.scale.set(1-i*.09,1,1);
    }
    for(const side of [-1,1]){
        ellipsoid(ink,-.034,.162,side*.071,.100,.045,.021,.27);
        for(let i=0;i<3;i++){
            const f=mesh(bird,feather,i===1?leaf:ink,.007-i*.018,.159+i*.012,side*(.087+.002*i));
            f.scale.set(.55+.09*i,.41,1);f.rotation.z=.16+i*.055;
        }
        const brow=mesh(bird,cut(polygon([[-.015,.001],[0,.010],[.036,.008],[.051,.005],[.014,.001]]),.005),paper,.065,.229,side*.083);
        brow.rotation.z=.02;
        coin(bird,paper,.106,.212,side*.084,.016,.016,.009);
        coin(bird,ink,.107,.212,side*.090,.012,.012,.006);
        coin(bird,paper,.110,.216,side*.094,.0038,.0038,.004);
    }
    const quill=cut(polygon([[-.055,.001],[0,.006],[.016,.003],[-.037,-.002]]),.004);
    for(const side of [-1,1])for(let i=0;i<3;i++){
        const mark=mesh(bird,quill,i===1?paper:gold,-.032-i*.010,.146+i*.013,side*(.094+.001*i));
        mark.rotation.z=.15+i*.06;
    }
    mesh(bird,cut(polygon([[0,.014],[.061,-.007],[.013,-.015],[-.008,-.002]]),.024),gold,.141,.199,0);
    for(const x of [-.045,.039]){
        rod(bird,ink,[x,.082,0],[x+.009,.018,.006],.0045);
        for(const j of [-1,0,1])rod(bird,ink,[x+.009,.018,.006],[x+.024+.012*j,.002,.016+j*.011],.0032);
    }
    function fern(x,z,height,bend,yaw){
        const base=v(x,.028,z), direction=v(Math.cos(yaw),0,Math.sin(yaw));
        const cross=v(-direction.z,0,direction.x);
        const at=t=>base.clone().addScaledVector(direction,bend*t*t).add(v(0,height*(1.47*t-.56*t*t),0));
        let before=at(0);
        for(let i=1;i<=9;i++){
            const t=i/10, p=at(t);
            rod(tree,leaf,before.toArray(),p.toArray(),.007*(1-.55*t));before=p;
            const length=height*.31*Math.pow(Math.sin(Math.PI*Math.pow(t,.7)),.75);
            for(const side of [-1,1]){
                const origin=at(t+side*.013),tip=origin.clone().addScaledVector(cross,length*side).addScaledVector(direction,length*.34);
                tip.y+=length*.43;
                const spine=origin.clone().lerp(tip,.45);spine.y+=.018;
                const edge=spine.clone().addScaledVector(direction,length*.23),back=spine.clone().addScaledVector(direction,-length*.19);
                tri(leaf,origin,spine,edge);tri(leaf,edge,spine,tip);
                tri(i%4?leaf:gold,origin,back,spine);tri(leaf,spine,back,tip);
            }
        }
    }
    for(const [x,z,side] of [[-.52,.25,-1],[.38,.22,1],[-.51,-.18,-1]]){
        for(let j=0;j<5;j++)fern(x+.012*Math.sin(j),z+.014*Math.cos(j),
            .17+.11*Math.sin((j+1)*.63),.10+.11*(.5+.5*Math.cos(j)),(side===1?.12:Math.PI)+.48*(j-2.5));
    }
    // Just-unfurling fiddleheads at the edge of the fern bank.
    for(const [x,z,s,flip] of [[-.52,.32,.48,-1],[.38,.29,.40,1]]){
        const points=[[x,.034,z],[x-.035*flip,.21*s,z+.025],[x-.045*flip,.37*s,z+.057]];
        const h=.38*s,r=.066*s;
        for(let i=0;i<=17;i++){
            const a=Math.PI-i*1.66*Math.PI/17,rad=r*(1-.73*i/17);
            points.push([x+.018*flip+Math.cos(a)*rad*flip,h+Math.sin(a)*rad,z+.06]);
        }
        branch(points,points.map((_,i)=>.009*s*(1-.4*i/points.length)),leaf,5);
    }
    skin.finish();
    for(const [color,positions] of batches){
        const geo=new T.BufferGeometry();
        geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.computeVertexNormals();
        mesh(tree,geo,color);
    }
    return rim.map(p=>[p.x,p.y,p.z+.012]);
}
