const wood=['#c3c7ba','#b7bdab','#b1b3aa','#ccccb9'];
const leaf=['#bad9ac','#ccdec4','#d0dfca','#b8cec2'];
const nearBough=['#c5d5cb','#e0e8c9','#cadccc','#e5efe1'];
const rock=['#9b998e','#a7a498','#928f88','#9a9c94'];
const tau=Math.PI*2;

export function ivy(k,f,x,y,z,length,width=1){
    const {between,beam,spray}=k;
    const sway=between(.4,2.6),bend=between(-.40,.4);
    let last=[x,y,z];
    for(let j=1;j<=5;j++){
        const t=j/5,next=[x+bend*t+Math.sin(sway+t*4)*.11,y-length*t,z+.06*Math.sin(t*3+sway)];
        beam(f,last,next,.023*(1-t*.5),.016*(1-t*.65),'#7c8266');
        if(j%2===1)spray(f,next[0]-.06,next[1]-.21*length,next[2]+.03,width*(.7-t*.34),length*.47,
            between(-.6,.6),.04,3,'flora',j%3?'#e6edd7':'#c0d7a6');
        last=next;
    }
}

export function tree(k,f,size,orientation,hollow=false,detail=true) {
    const {face,beam,spray,between,rand}=k;
    const variation=Math.sin(f.x*.79+f.z*.47),skew=Math.cos(f.x*.39+f.z*.73);
    const wide=hollow?1:1+.25*variation,tall=hollow?1:1-.17*variation;
    const scal=p=>{
        const crown=Math.max(0,p[1]-(hollow?1.3:.37))**1.25;
        return [(p[0]*wide+crown*variation*.18)*size,p[1]*tall*size,
            (p[2]*(1-.10*variation)+crown*skew*.13)*size];
    };
    const B=(a,b,r,R,c)=>beam(f,scal(a),scal(b),r*size,R*size,c,'bark',detail?9:6);
    const bole=[[0,0,0],[.12,1.07,-.04],[-.10,2.1,-.1],[.15,3.09,-.14],[.38,3.95,-.14]];
    if(!hollow){
        for(let j=1;j<bole.length;j++)B(bole[j-1],bole[j],[.48,.31,.25,.15][j-1],[.31,.25,.15,.07][j-1],wood[j%4]);
    }else{
        // A round, three-dimensional trunk with the front left open around the real letter.
        const levels=[[0,.82],[.16,.74],[.83,.61],[1.21,.48],[1.9,.43],[2.50,.37],[3.28,.22],[3.90,.08]];
        const sides=28;
        const at=(j,a)=>{
            const [h,w]=levels[j],r=w*(1+.105*Math.sin(a*5+h)+.05*Math.sin(a*9+.4));
            return scal([Math.sin(a)*r+.075*Math.sin(h*1.6),h,Math.cos(a)*r-.03*h]);
        };
        for(let j=0;j<levels.length-1;j++)for(let i=0;i<sides;i++){
            const a=i/sides*tau-Math.PI,b=(i+1)/sides*tau-Math.PI;
            if(j<2 && Math.abs((a+b)/2)<.64)continue;
            face(f,[at(j,a),at(j,b),at(j+1,b),at(j+1,a)],wood[(i*7+j)%5===0?3:i%3],'bark',
                [[i/6,j*.51],[(i+1)/6,j*.51],[(i+1)/6,(j+1)*.51],[i/6,(j+1)*.51]]);
        }
        const opening=[[-.42,.018,.54],[-.43,.33,.56],[-.37,.65,.53],[-.21,.82,.49],[.01,.91,.45],[.24,.83,.48],[.37,.66,.51],[.46,.34,.53],[.43,.016,.54]];
        for(let i=1;i<opening.length;i++){
            B(opening[i-1],opening[i],.078,.073,'#cbc0a5');
            const a=opening[i-1],b=opening[i];
            face(f,[scal(a),scal(b),scal([b[0]*.83,b[1]*.82,.18]),scal([a[0]*.83,a[1]*.82,.18])],'#493f49');
        }
        face(f,opening.map(a=>scal([a[0]*.86,a[1]*.87,.20])),'#292936');
    }
    for(let j=0;j<(detail?7:4);j++){
        const a=orientation+j*.95,spread=(hollow?.84:1.08)*(j%3===0?1.08:.83);
        if(hollow&&Math.cos(a)>.76)continue;
        B([Math.sin(a)*.24,.28,Math.cos(a)*.24],[Math.sin(a)*spread,-.09,Math.cos(a)*spread],.15,.026,wood[j%3]);
    }
    const limbs=detail?8:6;
    for(let i=0;i<limbs;i++){
        const angle=orientation+i*2.39996+between(-.18,.18),h=1.65+i*.17,d=between(1.08,1.59);
        const x=Math.cos(angle),z=Math.sin(angle);
        const p=[x*.06,h,-.07],q=[x*d*.79,h+between(.48,.90),z*d*.75],r=[x*d*1.31,h+between(1.03,1.48),z*d*1.26];
        const joint=[p[0]*.46+q[0]*.54-.06*z,p[1]*.58+q[1]*.42,p[2]*.46+q[2]*.54+.08*x];
        B(p,joint,.204-.009*i,.162-.004*i,wood[i%4]);B(joint,q,.162-.004*i,.107,wood[i%4]);B(q,r,.108,.052,wood[(i+1)%4]);
        if(detail||i%2===0){
            const arc=angle+(i%2?-.84:.91);
            const g=[q[0]+Math.cos(arc)*.56,q[1]+.18,q[2]+Math.sin(arc)*.50];
            const h=[g[0]+Math.cos(arc+.16)*.55,g[1]+.29,g[2]+Math.sin(arc+.16)*.42];
            B(q,g,.079,.04,wood[i%4]);B(g,h,.043,.012,wood[(i+1)%4]);
            for(let j=0;j<4;j++){
                const ax=h[0]+.22*Math.cos(j*1.9),az=h[2]+.28*Math.sin(j*1.9);
                spray(f,...scal([ax,h[1]-.16+.06*j,az]),.83*size,(.71+j*.08)*size,
                    arc+j*.85,-.11,(i+j)%4,'leaf',leaf[(i+j)%4]);
            }
        }
        for(let fork=0;fork<(detail?4:2);fork++){
            const a=angle+between(-1.1,1.1),span=between(.53,1.04);
            const v=[r[0]+Math.cos(a)*span,r[1]+between(.28,.77),r[2]+Math.sin(a)*span];
            B(r,v,.052,.012,'#c9c8ac');
            for(let j=0;j<(detail?4:3);j++){
                const b=a+j*2.2,reach=between(.18,.59);
                const t=scal([v[0]+Math.cos(b)*reach,v[1]-.25+between(-.18,.19),v[2]+Math.sin(b)*reach]);
                spray(f,...t,between(1.10,1.62)*size,between(.85,1.32)*size,b+rand(),between(-.12,.28),
                    (i+j+fork)%4,'leaf',nearBough[(i+j)%4]);
            }
        }
    }
    if(hollow){
        // Silver shelf fungi trail up the side, leaving the note accessible from the front.
        for(let j=0;j<5;j++){
            const a=1.1+j*.13,r=.52,h=.38+j*.16;
            const base=scal([Math.sin(a)*r,h,Math.cos(a)*r]),tip=scal([Math.sin(a)*(r+.19),h+.02,Math.cos(a)*(r+.19)]);
            beam(f,base,tip,.07*size,.02*size,'#b7b19b','plain',7);
        }
    }
}

export function flowerBorder(k,f,centres,width,kind,scale=1){
    const {spray,beam,between,rand}=k;
    // Drifts change character along a border: low hydrangeas, roses, then bell spikes.
    for(let n=1;n<centres.length;n++){
        const [ax,az,ay=0]=centres[n-1],[bx,bz,by=0]=centres[n],dx=bx-ax,dz=bz-az;
        const length=Math.hypot(dx,dz),rows=Math.ceil(length*1.96),px=-dz/length,pz=dx/length;
        for(let i=0;i<rows;i++){
            const t=(i+rand()*.6)/rows,base=ay+(by-ay)*t;
            const repeats=width>1?4:3;
            for(let j=0;j<repeats;j++){
                const off=(j/(repeats-1)-.5)*width+between(-.26,.26);
                const x=ax+dx*t+px*off,z=az+dz*t+pz*off;
                const yaw=between(-1.15,1.15)+(j%2?0:Math.PI);
                const season=Math.sin(t*4.1+n*.91)+Math.cos(n*1.45+kind);
                const species=rand()<.72?(season>.6?2:season<-.55?0:1):(kind+i+j)%3;
                const nearEdge=j===0||j===repeats-1;
                const size=scale*between(.48,1.00)*(nearEdge?.79:1.17);
                const pale=['#ece3ff','#f4e2e3','#f8f3dd'][species];
                if(nearEdge || rand()<.35){
                    spray(f,x,base+.02,z,size*1.28,size*.73,yaw+.35,-.15,(n+i)%4,'leaf',leaf[i%4]);
                }
                const accent=Math.sin(t*8.52+kind*2.03+n*1.16)+Math.cos(j*.93+n*.85);
                if(accent>.28||nearEdge&&rand()<.41){
                    const cell=nearEdge && rand()<.56?3:(i+j+kind)%3;
                    const height=[.88,1.32,.77,.60][cell]*size;
                    const width=[1,.63,1.16,1.36][cell]*size;
                    spray(f,x,base,z,width,height,yaw,between(-.22,.20),cell,'white');
                    continue;
                }
                const h=size*(species===2?1.12:species===1?.88:.66);
                if(species===0){
                    beam(f,[x,base,z],[x+.04,base+.28*size,z],.023*size,.014*size,'#77876f');
                    spray(f,x,base+.12*size,z,size*.78,h,yaw,between(-.20,.16),species,'flora',pale);
                }else spray(f,x,base,z,size*(species===2?.60:1.05),h,yaw,between(-.15,.20),species,'flora',pale);
            }
        }
    }
}

export function fieldstone(k,f,x,y,z,w,h,d,shade=0){
    const {face,between}=k,low=[],top=[];
    for(let i=0;i<8;i++){
        const a=i*Math.PI/4+.06,sp=between(.82,1.08);
        low.push([x+Math.cos(a)*w*sp,y-h*.43,z+Math.sin(a)*d*sp]);
        top.push([x+Math.cos(a)*w*sp*.74,y+h*between(.20,.51),z+Math.sin(a)*d*sp*.79]);
    }
    for(let i=0;i<8;i++){
        const j=(i+1)%8;
        face(f,[low[j],low[i],top[i],top[j]],rock[(shade+i%2)%4],'stone');
        face(f,[top[j],top[i],[x-.06*w,y+h*.53,z+.08*d]],rock[(shade+1)%4],'stone');
    }
}

export function woodlandFloor(k,f){
    const {face,spray,between,rand}=k;
    const ground=(x,z)=>{
        const apron=Math.max(0,Math.min(1,(z-9)/10))*.53;
        const beyond=Math.max(0,Math.min(1,(Math.hypot(x,z)-24)/22));
        const rise=Math.max(0,Math.min(3.50,(-6.9-z)*.1735));
        const rim=Math.max(0,Math.min(1,(6.35-Math.abs(x-.4*Math.sin((-z-7)*.18)))/2.45));
        const farEnd=Math.max(0,Math.min(1,(z+39)/7));
        return -.103-apron+.032*Math.sin(x*.81+z*.43)*Math.cos(z*.71)+rise*rim*farEnd+
            beyond*(1.24+1.92*Math.sin(x*.12+z*.068)**2+1.16*Math.cos(z*.14-x*.065)**2);
    };
    const spacing=1.7;
    for(let i=-39;i<39;i++)for(let j=-39;j<39;j++){
        const x=i*spacing,z=j*spacing,pts=[[x,z],[x,z+spacing],[x+spacing,z+spacing],[x+spacing,z]];
        face(f,pts.map(([u,v])=>[u,ground(u,v),v]),'#b3beb0','turf',pts.map(([u,v])=>[u*.36,v*.36]));
    }
    // A lower woodland storey closes the horizon between tree trunks.
    for(let i=0;i<160;i++){
        const a=i*2.39996,r=between(21,39),x=r*Math.sin(a),z=r*Math.cos(a),h=ground(x,z);
        if(Math.abs(x)<5.3&&z<0)continue;
        for(let j=0;j<7;j++){
            const u=between(-1.65,1.65),v=between(-1.22,1.22);
            const height=between(1.50,3.20)-Math.abs(v)*.30;
            spray(f,x+u,h-.12,z+v,between(2.4,4.1),height,a+j*.7,between(-.24,.05),j%4,'leaf',leaf[(i+j)%4]);
        }
    }
    for(const [cx,cz,reach] of [[-6.55,-11.38,1.3],[-5.26,-12,1.1],[-8.54,-8.6,1.1],[6.01,-11.36,1.1],
        [10.7,-9.4,1.2],[-3.98,15.5,1.4],[2.78,12.6,1.4],[-4.55,8.36,1.55],[4.68,7.47,1.25],[-11.14,-1.12,1.05]]){
        for(let q=0;q<11;q++){
            const x=cx+between(-reach,reach),z=cz+between(-.64,.64);
            if(Math.hypot(x+6.74,z+11.94)<.79)continue;
            const size=between(.38,.85),yaw=rand()*Math.PI;
            for(let j=0;j<2;j++)spray(f,x,ground(x,z)+.02,z,size*1.25,size*.57,
                yaw+j*1.32,-.24,3,'white',leaf[(q+j)%4]);
        }
    }
}
