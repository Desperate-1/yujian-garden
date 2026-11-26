import {signLettering,smallLettering} from './anime_lettering.js';
// A florist's kei van and a city bicycle anchor the foreground at everyday scale.
export function dressRoadside(k,root){
    const {T,group,mesh,rod,block,ink,paper,sky,leaf,gold,blossom}=k;
    const blend=(a,b,f)=>new T.Color(a).lerp(new T.Color(b),f).getHex();
    const navy=blend(ink,sky,.06), glass=blend(navy,sky,.40),chrome=blend(sky,paper,.32);
    const rubber=blend(ink,0x222631,.62),ivory=blend(paper,sky,.2);
    const materials=[],textures=[];
    function face(g,pts,c){
        const geom=new T.BufferGeometry(),idx=[];
        for(let i=1;i<pts.length-1;i++)idx.push(0,i,i+1);
        geom.setAttribute('position',new T.Float32BufferAttribute(pts.flat(),3));geom.setIndex(idx);geom.computeVertexNormals();
        return mesh(g,geom,c);
    }
    function sign(g,x,y,z,w,h,paint,nx=480,ny=240,yaw=0){
        const canvas=document.createElement('canvas');canvas.width=nx;canvas.height=ny;
        paint(canvas.getContext('2d'),nx,ny);
        const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;
        const m=mesh(g,new T.PlaneGeometry(w,h),paper,x,y,z);
        m.rotation.y=yaw;
        const mat=m.material.clone();mat.map=tex;mat.color.set(0xffffff);mat.alphaTest=.42;
        m.material=mat;materials.push(mat);textures.push(tex);
        return m;
    }
    const van=group(root,-4.06,.027,13.85,-.036);
    const glassPaint=new T.MeshLambertMaterial({color:blend(sky,navy,.38),side:T.DoubleSide,
        transparent:true,opacity:.28,depthWrite:false});
    materials.push(glassPaint);
    function pane(outer){
        const center=outer.reduce((v,p)=>v.add(new T.Vector3(...p)),new T.Vector3()).multiplyScalar(1/outer.length);
        const inner=outer.map(p=>new T.Vector3(...p).lerp(center,.089).toArray());
        for(let i=0;i<outer.length;i++){
            const j=(i+1)%outer.length;
            face(van,[outer[i],outer[j],inner[j],inner[i]],navy);
        }
        face(van,inner,glass).material=glassPaint;
    }
    // The body tapers upward in both axes. The pressed rear panel has a real inset glass lip.
    const rings=[[.36,.68,1.37,1.48],[.46,.785,1.57,1.59],[.96,.795,1.59,1.59],
        [1.10,.78,1.55,1.57],[1.72,.70,1.35,1.52],[1.80,.66,1.29,1.48]];
    function ring([y,x,front,back]){
        const b=.095;
        return [[-x+b,y,back],[x-b,y,back],[x,y,back-b],[x,y,-front+b],
            [x-b,y,-front],[-x+b,y,-front],[-x,y,-front+b],[-x,y,back-b]];
    }
    let lower=ring(rings[0]);
    for(let i=1;i<rings.length;i++){
        const top=ring(rings[i]);
        for(let j=0;j<8;j++){
            const t=(j+1)%8;
            if(i===4 && j%2===0)continue;
            face(van,[lower[j],lower[t],top[t],top[j]],i===1?navy:i===5?ivory:paper);
        }
        lower=top;
    }
    face(van,lower,ivory);
    for(const side of [-1,1]){
        const panel=(z1,z2)=>{
            const p0=[side*.786,1.08,z1],p1=[side*.786,1.08,z2],p2=[side*.711,1.673,z2*.93],p3=[side*.711,1.673,z1*.93];
            pane([p0,p1,p2,p3]);
        };
        panel(-1.35,-.53);panel(-.47,.51);panel(.57,1.40);
        for(const z of [-.50,.54]){
            rod(van,ivory,[side*.784,1.07,z],[side*.712,1.69,z*.93],.039);
        }
        for(const z of [-.50,.53])rod(van,navy,[side*.798,.51,z],[side*.795,1.07,z],.009);
        for(const z of [-.61,.46])block(van,navy,side*.802,.99,z,.021,.045,.145);
        block(van,navy,side*.793,.50,0,.03,.075,3.02);
        for(const z of [-.98,.97]){
            const tire=mesh(van,new T.CylinderGeometry(.315,.315,.163,22),rubber,side*.716,.315,z);
            tire.rotation.z=Math.PI/2;
            const rim=mesh(van,new T.CylinderGeometry(.192,.192,.171,22),chrome,side*.721,.315,z);
            rim.rotation.z=Math.PI/2;
            for(let j=0;j<6;j++){
                const a=j*Math.PI/3;
                const nut=mesh(van,new T.CylinderGeometry(.032,.032,.02,7),navy,side*.814,.315+Math.sin(a)*.119,z+.119*Math.cos(a));nut.rotation.z=Math.PI/2;
            }
        }
        rod(van,navy,[side*.75,1.15,-1.16],[side*.92,1.2,-1.23],.028);
        block(van,ivory,side*.93,1.23,-1.24,.12,.115,.13);
    }
    // Use the actual sloped hatch surface for the window, rubber gasket, defroster and wiper.
    const hz=y=>1.57-(y-1.1)*.05/.62+.015;
    function rear(points,c,offset=0){
        face(van,points.map(([x,y])=>[x,y,hz(y)+offset]),c);
    }
    pane([[-.694,1.09],[.694,1.09],[.635,1.684],[-.635,1.684]].map(([x,y])=>[x,y,hz(y)]));
    pane([[-.68,1.10,-1.566],[.68,1.10,-1.566],[.62,1.685,-1.36],[-.62,1.685,-1.36]]);
    rear([[-.59,1.60],[-.24,1.62],[-.43,1.54]],blend(glass,sky,.59),.014);
    block(van,navy,0,1.08,-1.22,1.33,.12,.38);
    block(van,ivory,0,1.034,.35,1.36,.055,2.1);
    for(const sx of [-.36,.36]){
        const seat=block(van,navy,sx,1.13,-.41,.51,.49,.14);seat.rotation.x=-.16;
        const head=block(van,blend(navy,paper,.17),sx,1.435,-.38,.30,.173,.14);head.rotation.x=-.10;
    }
    for(const [x,z,w,h] of [[-.29,.95,.61,.27],[.30,.82,.38,.41],[-.15,.37,.47,.32]]){
        const carton=group(van,x,1.07,z,x*.28);
        block(carton,blend(gold,paper,.50),0,h/2,0,w,h,.39);
        block(carton,blend(gold,ink,.29),0,h+.002,0,.038,.006,.38);
        block(carton,blend(gold,ink,.32),0,h-.055,.197,.039,.11,.007);
    }
    for(let j=0;j<5;j++){const y=1.18+j*.071;rod(van,blend(glass,navy,.43),[-.603,y,hz(y)+.021],[.603,y,hz(y)+.021],.0037);}
    rod(van,navy,[-.03,1.124,hz(1.124)+.029],[.47,1.232,hz(1.232)+.03],.012);
    block(van,navy,0,.453,1.587,1.45,.14,.086);
    for(const s of [-1,1]){
        block(van,navy,s*.708,.85,1.583,.12,.36,.052);
        block(van,blossom,s*.708,.900,1.619,.087,.211,.018);
        block(van,gold,s*.708,.742,1.619,.087,.070,.018);
    }
    sign(van,-.08,.684,1.613,.38,.19,(ctx,w,h)=>{
        ctx.fillStyle='#eac778';ctx.fillRect(0,0,w,h);ctx.textAlign='center';ctx.fillStyle='#42463e';
        ctx.font='53px '+smallLettering;ctx.fillText('樱街花运',w/2,68);
        ctx.font='bold 126px sans-serif';ctx.fillText('21-46',w/2,206);
    });
    sign(van,.01,.94,1.611,.80,.111,(ctx,w,h)=>{
        ctx.fillStyle='#45585b';ctx.textAlign='center';ctx.font='70px '+signLettering;ctx.fillText('花音花店',w/2,70);
    },512,90);
    // City bike: mudguards, wire basket and a step-through frame are readable from either side.
    function bicycle(x,z,yaw){
        const g=group(root,x,.100,z,yaw);
        const tyre=new T.TorusGeometry(.309,.024,6,32),rim=new T.TorusGeometry(.279,.009,5,32);
        for(const cx of [-.53,.56]){
            mesh(g,tyre,rubber,cx,.33,0);mesh(g,rim,chrome,cx,.33,0);
            for(let i=0;i<12;i++){
                const a=i*Math.PI/6;
                rod(g,chrome,[cx,.33,.024],[cx+Math.cos(a)*.284,.33+Math.sin(a)*.284,0],.0038);
            }
            const arc=new T.TorusGeometry(.352,.018,5,15,Math.PI*.84);
            const f=mesh(g,arc,ivory,cx,.33,0);f.rotation.z=.22;
        }
        const tubes=[[[-.53,.33,0],[-.12,.36,0]],[[-.12,.36,0],[-.23,.74,0]],[[-.23,.73,0],[-.53,.33,0]],
            [[-.15,.40,0],[.13,.45,0]],[[.13,.45,0],[.41,.78,0]],[[.34,.88,0],[.56,.33,0]]];
        for(const [a,b] of tubes)rod(g,blend(leaf,sky,.22),a,b,.023);
        rod(g,chrome,[.34,.79,0],[.31,.97,0],.018);rod(g,chrome,[.31,.97,0],[.23,.98,.16],.016);
        rod(g,navy,[-.23,.70,0],[-.24,.86,0],.014);block(g,navy,-.27,.86,0,.22,.055,.12);
        const cx=.53;
        for(const side of [-1,1]){
            for(const y of [.66,.85])rod(g,chrome,[cx-.14,y,side*.124],[cx+.15,y,side*.124],.008);
            for(let i=0;i<5;i++)rod(g,chrome,[cx-.115+i*.055,.66,side*.095],[cx-.142+i*.068,.85,side*.124],.005);
            rod(g,chrome,[cx+side*.15,.85,-.124],[cx+side*.15,.85,.124],.008);
        }
        rod(g,rubber,[-.17,.34,-.035],[-.25,.008,-.19],.011);
    }
    bicycle(5.65,8.65,1.30);bicycle(-7.1,-4.8,-.94);
    // A real two-sided enamel street plate, with a folded edge and its attachment bands.
    const blade=group(root,6.21,.098,6.54,-.24);
    rod(blade,blend(navy,chrome,.54),[0,0,0],[0,3.32,0],.036);
    block(blade,navy,.45,3.01,0,1.16,.56,.064);
    for(const y of [2.82,3.16])block(blade,chrome,.065,y,-.06,.21,.042,.084);
    sign(blade,.45,3.01,.039,1.12,.52,(ctx,w,h)=>{
        ctx.fillStyle='#3d5a84';ctx.fillRect(0,0,w,h);
        ctx.lineWidth=6;ctx.strokeStyle='#e8eef0';ctx.strokeRect(8,8,w-16,h-16);
        ctx.fillStyle='#f4f0df';ctx.textAlign='center';
        ctx.font='69px '+signLettering;ctx.fillText('樱通商店街',w/2,91);
        ctx.font='30px '+smallLettering;ctx.fillText('前往花园广场',w/2,136);
        ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(51,170);ctx.lineTo(w-48,170);ctx.lineTo(w-68,158);ctx.stroke();
    },480,206);
    return {dispose(){materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
