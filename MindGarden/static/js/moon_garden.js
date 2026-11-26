import {gardenWorkshop} from './moon_garden_mesh.js';
import {ivy,tree,flowerBorder,fieldstone,woodlandFloor} from './moon_garden_flora.js';

const tau=2*Math.PI;
const masonry=['#b8b3ac','#c5c3b6','#a9aaa6','#c4bcae','#a6aba3','#c5c3b8'];
const metal='#526565',bronze='#94836e',pale='#ddd5b3',bloom='#ffce82';
const stone=(i)=>masonry[(i%masonry.length+masonry.length)%masonry.length];

function arch(k,f,cx,y,cz,rx,ry,spring,rim,d,rich=true){
    const {box,face,beam,spray,between}=k;
    const rings=rich?23:15;
    for(const s of [-1,1]){
        const x=cx+s*(rx+rim*.50);
        const rows=Math.max(4,Math.round(spring/.42));
        for(let j=0;j<rows;j++){
            const ht=spring/rows,w=rim+((j===0||j===rows-1)?.15:0);
            box(f,x,y+(j+.5)*ht,cz,w,ht-.012,d+(j%4===0?.052:0),stone(j*3+(s+1)*2),'stone');
        }
        box(f,x,y+.114,cz,rim+.30,.228,d+.26,stone(1),'stone');
        box(f,x,y+spring-.075,cz,rim+.19,.125,d+.19,stone(2),'stone');
        box(f,x,y+spring+.030,cz,rim+.27,.066,d+.23,stone(1),'stone');
    }
    const at=(a,outer,front,extra=0)=>[cx+Math.cos(a)*(rx+outer*rim),
        y+spring+Math.sin(a)*(ry+outer*rim)+extra,cz+front*d*.5];
    for(let i=0;i<rings;i++){
        const a=i*Math.PI/rings+.0018,b=(i+1)*Math.PI/rings-.0018,keystone=i===Math.floor(rings/2);
        const ke=keystone?rim*.21:0,c=stone(i*13+1);
        for(const s of [-1,1]){
            const A=at(a,0,s),B=at(b,0,s),C=at(b,1,s,ke),D=at(a,1,s,ke);
            face(f,s>0?[A,D,C,B]:[A,B,C,D],c,'stone');
        }
        face(f,[at(a,0,1),at(b,0,1),at(b,0,-1),at(a,0,-1)],stone(i%3),'stone');
        face(f,[at(a,1,-1,ke),at(b,1,-1,ke),at(b,1,1,ke),at(a,1,1,ke)],stone(1),'stone');
        if(rich){
            for(const s of [-1,1])beam(f,at(a,0,s),at(b,0,s),.048,.048,'#d5cec0','stone',5);
        }
    }
    if(rich){
        // Six petals are cut into the keystone with raised edges catching the moon.
        const xx=cx,yy=y+spring+ry+rim*.53,zz=cz+d*.5+.018;
        for(let i=0;i<6;i++){
            const a=i*tau/6+.12,X=Math.cos(a),Y=Math.sin(a),r=rim*.36;
            const stalk=[xx+X*r*.09,yy+Y*r*.09,zz+.014];
            const l=[xx+X*r*.51-Y*r*.21,yy+Y*r*.51+X*r*.21,zz+.044];
            const tip=[xx+X*r,yy+Y*r,zz+.019],rr=[xx+X*r*.51+Y*r*.21,yy+Y*r*.51-X*r*.21,zz+.044];
            const ridge=[xx+X*r*.63,yy+Y*r*.63,zz+.074];
            face(f,[stalk,rr,tip,ridge],stone(3),'stone');face(f,[stalk,ridge,tip,l],stone(1),'stone');
        }
        // A living mantle grows over the crown; its weight pulls unevenly at the ends.
        for(let i=0;i<Math.ceil(rx*12);i++){
            const a=between(.12,Math.PI-.12),p=at(a,.88,between(-1,1));
            spray(f,p[0],p[1]-.17,p[2],between(.59,1.16),between(.46,.83),between(-.9,.9),
                -.12,i%4,'leaf',i%3?'#c1cca5':'#93af91');
        }
        for(let i=0;i<Math.ceil(rx*7);i++){
            const a=between(.10,Math.PI-.10),p=at(a,.99,1.21);
            if(i%4)ivy(k,f,p[0],p[1]+.13,p[2]+.02,between(.25,.84),between(.48,.91));
        }
        for(const side of [-1,1]){
            for(let i=0;i<5;i++){
                const a=side<0?Math.PI-between(.08,.76):between(.10,.76),p=at(a,.76,1.15);
                ivy(k,f,p[0],p[1],p[2],between(.6,1.75),between(.62,.90));
            }
        }
    }
}

function wornSlab(k,f,x,top,z,w,d,c){
    const {face,between}=k;
    const l=x-w/2,r=x+w/2,n=z-d/2,s=z+d/2;const safe=Math.min(.14,w*.16,d*.19);
    const v=()=>between(safe*.23,safe);
    const points=[[l+v(),s],[r-v(),s],[r,s-v()],[r,n+v()],
        [r-v(),n],[l+v(),n],[l,n+v()],[l,s-v()]];
    const rim=points.map(([a,b])=>[a,top-.037,b]);
    const cap=points.map(([a,b])=>[x+(a-x)*.976,top+between(-.007,.007),z+(b-z)*.978]);
    face(f,cap,c,'stone');
    for(let i=0;i<8;i++){
        const j=(i+1)%8;
        face(f,[rim[j],cap[j],cap[i],rim[i]],c,'stone');
        if(i===0)face(f,[rim[i],rim[j],[rim[j][0],top-.086,rim[j][2]],[rim[i][0],top-.086,rim[i][2]]],c,'stone');
    }
}

function lamp(k,f,x,y,z,size=1){
    const {box,beam,face}=k;
    const S=(a)=>a*size;
    box(f,x,y+S(.12),z,S(.39),S(.24),S(.39),stone(2),'stone');
    beam(f,[x,y+S(.22),z],[x,y+S(.85),z],S(.065),S(.043),metal,'plain',8);
    box(f,x,y+S(.85),z,S(.32),S(.064),S(.30),bronze);
    box(f,x,y+S(1.027),z,S(.213),S(.31),S(.211),bloom,'glow');
    for(const sx of [-1,1])for(const sz of [-1,1])beam(f,[x+S(sx*.115),y+S(.86),z+S(sz*.115)],
        [x+S(sx*.140),y+S(1.24),z+S(sz*.139)],S(.013),S(.016),metal);
    for(let i=0;i<4;i++){
        const A=i*Math.PI/2+Math.PI/4,B=A+Math.PI/2;
        face(f,[[x+S(.237*Math.sin(A)),y+S(1.24),z+S(.237*Math.cos(A))],
            [x+S(.237*Math.sin(B)),y+S(1.24),z+S(.237*Math.cos(B))],[x,y+S(1.42),z]],bronze);
    }
    beam(f,[x,y+S(1.38),z],[x,y+S(1.49),z],S(.038),S(.006),bronze);
    k.lampPoints.push(k.transform(f,[x,y+S(1.035),z]));
}

function stoneWall(k,f,cx,y,z,w,h,d,salt=0){
    const {box,between}=k;
    const courses=Math.max(1,Math.round(h/.42)),th=h/courses;
    box(f,cx,y+h*.5,z,w,h,d,'#838b86','stone');
    for(let j=0;j<courses;j++){
        let x=-w/2;const stop=w/2;
        for(let i=0;x<stop-.014;i++){
            const wide=Math.min(stop-x,(i===0 && j%2?.53:1)*between(.74,1.25));
            box(f,cx+x+wide*.5,y+(j+.5)*th,z,Math.max(.03,wide-.018),th-.015,d+between(.018,.066),stone(i+2*j+salt),'stone');
            x+=wide;
        }
    }
    box(f,cx,y+h+.052,z,w+.13,.104,d+.18,stone(1),'stone');
}

function flowerHouse(k){
    const {frame,box,beam,face,spray}=k,f=frame(-9.9,0,-4.7,.34);
    const left=-2.46,right=2.36,front=1.76,back=-2.06;
    // Glasshouse has a real hollow entry and recessed benches behind a pair of windows.
    box(f,0,.07,-.12,4.92,.13,4.00,stone(2),'stone');
    stoneWall(k,f,0,.12,back,4.82,2.73,.20,3);
    const span=(a,b)=>stoneWall(k,f,(a+b)/2,.12,front,b-a,.52,.21,1);
    span(left,-.73);span(.36,right);
    for(const [a,b] of [[left,-.73],[.36,right]]){
        const w=b-a,c=(a+b)*.5;
        box(f,c,1.16,front-.68,w-.13,.091,.91,'#867d6e');
        box(f,c,.76,front-.91,w-.18,.59,.12,metal);
        for(let j=0;j<6;j++){
            const x=a+.16+j*(w-.3)/5,h=.76+(j%3)*.145;
            box(f,x,1.28,front-.51+(j%2)*.13,.17,.24,.185,j%3?pale:bronze);
            spray(f,x,1.30,front-.51+(j%2)*.13,.58,h,.06+j*.19,.11,j%3,'flora','#fff8e5');
        }
        box(f,c,2.56,front-.77,w-.22,.065,.37,bronze);
        for(let j=0;j<4;j++)beam(f,[a+.19+j*(w-.35)/3,.65,front+.015],[a+.19+j*(w-.35)/3,2.68,front+.015],.032,.033,metal);
        for(const yy of [.66,1.61,2.64])box(f,c,yy,front+.023,w,.064,.095,metal);
        // Reflections are sparse; the flower tables occupy the actual volume behind the glass.
        face(f,[[a+.08,2.44,front+.028],[a+w*.42,2.54,front+.028],[a+w*.71,2.54,front+.028],[a+.101,2.30,front+.028]],'#bccdcf');
    }
    for(const x of [left,right]){
        for(let i=0;i<=4;i++){
            const z=back+(front-back)*i/4;
            box(f,x,1.39,z,.085,2.70,.09,metal);
            if(i<4){
                const zm=z+(front-back)/8;
                box(f,x,.38,zm,.18,.56,(front-back)/4,stone(i),'stone');
                box(f,x,1.70,zm,.022,2.02,(front-back)/4-.075,'#819b9f');
                box(f,x,1.64,zm,.08,.045,(front-back)/4,metal);
            }
        }
    }
    for(const x of [left,-.75,.37,right])box(f,x,1.41,front,.125,2.72,.165,metal);
    for(const z of [front,back]){
        box(f,-.05,2.72,z,5.10,.145,.18,metal);
        for(const side of [-1,1]){
            const xx=side<0?left:right;
            beam(f,[xx,2.74,z],[0,4.29,z],.077,.066,metal,'plain',8);
            for(let i=1;i<=5;i++){
                const x=xx*i/6,hh=4.25-1.53*i/6;
                beam(f,[x,2.76,z],[x,hh,z],.028,.029,metal);
            }
        }
        face(f,[[left,2.79,z-.012],[right,2.79,z-.012],[0,4.23,z-.012]],'#9cadac');
        // A fan window and a pale floral medallion sit above the arched door.
        for(let j=0;j<=8;j++){
            const a=j*Math.PI/8,pt=[.56*Math.cos(a),2.86+.56*Math.sin(a),z+.064];
            beam(f,[0,2.86,z+.064],pt,.018,.018,bronze);
            if(j<8){const b=(j+1)*Math.PI/8;beam(f,pt,[.56*Math.cos(b),2.86+.56*Math.sin(b),z+.064],.024,.024,metal);}
        }
    }
    for(const side of [-1,1]){
        const x=side<0?left-.13:right+.13;
        for(let j=0;j<7;j++){
            const z=back-.16+j*.613,zz=z+.60;
            const col=['#9caeaf','#a9bab6','#82999d'][j%3];
            face(f,[[x,2.72,z],[x,2.72,zz],[0,4.31,zz],[0,4.31,z]],col);
            beam(f,[x,2.72,z],[0,4.31,z],.035,.039,metal);
        }
    }
    beam(f,[0,4.31,back-.19],[0,4.31,front+.22],.08,.08,bronze);
    k.plaque(f,'星灯花房',-.11,2.50,front+.12,1.39,.30);
    for(const side of [-1,1]){
        const x=side===-1?-1.56:1.54;
        box(f,x,.38,front+.32,1.32,.43,.48,stone(3),'stone');
        for(let i=0;i<8;i++)spray(f,x-.61+i*.17,.56,front+.30+.07*Math.sin(i),.60,.47+i%3*.14,i*.39,0,(i+1)%3,'flora');
        lamp(k,f,x,1.76,front+.172,.50);
        ivy(k,f,side*2.29,2.88,front+.087,1.50,.73);
    }
    for(const side of [-1,1]){
        const x=side*(side>0?2.49:2.61);
        for(let j=0;j<4;j++){
            const z=-1.61+j*.79;
            beam(f,[x,.64,z],[x,2.61,z+.67],.020,.020,bronze);
            beam(f,[x,.64,z+.67],[x,2.61,z],.018,.018,bronze);
            for(let i=0;i<3;i++)spray(f,x+.018*side,.39+i*.49,z+Math.sin(j+i)*.16,.69,.87,
                side*Math.PI/2+.17*j,.11,(i+j)%2===0?1:2,(i+j)%2===0?'flora':'white','#e5f1db');
        }
    }
    return f;
}

function gallery(k){
    const {frame,box,beam,spray}=k,f=frame(8,0,-12.7,-.23);
    stoneWall(k,f,0,.08,-1.46,7.84,2.74,.27);
    box(f,0,.067,-.18,8.17,.134,3.44,stone(1),'stone');
    for(let i=0;i<3;i++){
        const x=(i-1)*2.51;
        arch(k,f,x,.13,.81,.98,.69,1.77,.28,.64,false);
        for(let j=0;j<3;j++){
            box(f,x+(j-1)*.46,1.40,-1.265,.383,1.34,.095,bronze);
            box(f,x+(j-1)*.46,1.40,-1.20,.334,1.275,.045,'#9da99f');
            spray(f,x+(j-1)*.44,1.06,-1.15,.40,.82,j*.21,0,j%3,'white');
        }
    }
    for(const y of [2.86,3.07])box(f,-.02,y,-.10,8.03,.16,3.10,stone(y>3?1:3),'stone');
    const turret=.68;
    stoneWall(k,f,turret,3.09,.26,1.71,1.99,1.30);
    k.plaque(f,'月影画廊',-.04,2.935,1.50,1.40,.29);
    box(f,turret,5.13,.26,1.97,.15,1.66,stone(1),'stone');
    for(const sx of [-1,1])for(const sz of [-1,1]){
        beam(f,[turret+sx*.68,5.18,.26+sz*.50],[turret+sx*.68,5.57,.26+sz*.50],.038,.038,metal);
        beam(f,[turret+sx*.92,5.59,.26+sz*.72],[turret,6.31,.26],.036,.036,bronze);
    }
    for(let i=0;i<4;i++){
        const a=i*Math.PI/2+Math.PI/4,b=a+Math.PI/2;
        k.face(f,[[turret+1.30*Math.cos(a),5.59,.26+1.02*Math.sin(a)],
            [turret+1.30*Math.cos(b),5.59,.26+1.02*Math.sin(b)],[turret,6.31,.26]],i%2?'#83908c':'#596765');
    }
    for(let j=0;j<12;j++){
        const x=-3.74+j*.67;
        spray(f,x,3.04,-.05+.32*Math.sin(j),.92,.68,j*.37,0,j%4,'leaf');
        if(j%3===0)ivy(k,f,x,3.13,1.21,.72+j%2*.39,.56);
    }
    lamp(k,f,-3.45,.16,1.58,.82);lamp(k,f,3.44,.16,1.59,.82);
}

function terrace(k,f){
    const {box,beam,between,face}=k;
    // The upper walk is a second flight beyond the fountain, with a loggia at its head.
    for(let i=0;i<25;i++){
        const z=-6.9-i*.83,cy=.02+i*.144,cx=Math.sin(i*.14)*.65;
        box(f,cx,.5*cy,z,4.12,Math.max(cy,.02),.86,stone(i),'stone');
        for(let j=0;j<3;j++){
            const w=4.12/3;
            wornSlab(k,f,cx+(j-1)*w,cy+.060,z,w-.017,.818,stone(i*3+j));
        }
        for(const side of [-1,1])fieldstone(k,f,cx+side*2.17,cy+.035,z,.39,.38,.47,i%4);
        if(i%5===0)lamp(k,f,cx+2.48*(i%2?-1:1),cy,z,.67);
    }
    arch(k,f,.55,1.46,-15.25,1.94,1.13,2.06,.51,.76,true);
    arch(k,f,-.03,2.72,-22.04,1.78,1.19,1.98,.43,.68,true);
    const top=3.53;
    for(const side of [-1,1]){
        box(f,side*6.4,top*.5,-29,7.6,top,6.1,'#898f86','stone');
        stoneWall(k,f,side*6.4,top,-26.18,7.66,.62,.50);
    }
    box(f,0,top*.5,-29.55,6.18,top,6.8,stone(1),'stone');
    const pavilion=k.frame(.15,top,-30.43,.06);
    for(let i=0;i<8;i++){
        const a=i*tau/8,b=(i+1)*tau/8;
        const x=2.45*Math.sin(a),z=2.45*Math.cos(a),xx=2.45*Math.sin(b),zz=2.45*Math.cos(b);
        box(pavilion,x,.12,z,.50,.24,.50,stone(1),'stone');
        beam(pavilion,[x,.19,z],[x,3.33,z],.17,.138,stone(2),'stone',12);
        box(pavilion,x,3.29,z,.53,.21,.53,stone(1),'stone');
        beam(pavilion,[x,3.44,z],[xx,3.44,zz],.14,.14,stone(3),'stone');
        face(pavilion,[[x*1.16,3.50,z*1.16],[xx*1.16,3.50,zz*1.16],[xx*.62,4.72,zz*.62],[x*.62,4.72,z*.62]],i%2?'#8b9d97':'#788c8a');
        face(pavilion,[[x*.62,4.72,z*.62],[xx*.62,4.72,zz*.62],[0,5.25,0]],i%2?'#93a49e':'#80968e');
        beam(pavilion,[x*1.16,3.51,z*1.16],[x*.62,4.74,z*.62],.035,.03,bronze);
    }
    beam(pavilion,[0,5.15,0],[0,5.71,0],.10,.018,bronze);
    for(let i=0;i<8;i++)lamp(k,pavilion,between(-1.3,1.3),.05,between(-1.1,.1),.68);
}

export function buildMoonGarden(T,scene,palette){
    const k=gardenWorkshop(T,scene);
    const f=k.frame(),{box,between,rand,spray}=k;
    k.lampPoints=[];
    // Eye-level gardens enclose the visitor; the upper leaves leave an open patch of sky.
    const pathCentre=z=>-.10-z*.070+.19*Math.sin(z*.42);
    for(let i=0;i<25;i++){
        const z=22-i*.79,t=Math.max(0,Math.min(1,(19-z)/10)),h=-.53+.53*t;
        const width=3.73+.24*Math.sin(i*.58)+.35*t;
        box(f,pathCentre(z),h-.16,z,width,.32,.85,'#92958c','stone');
        const pieces=i%3===0?2:3;
        for(let j=0;j<pieces;j++){
            const w=width/pieces;
            wornSlab(k,f,pathCentre(z)-width*.5+w*(j+.5),h+.052,z,w-.012,.78,stone(i+j*2));
        }
        for(const side of [-1,1])fieldstone(k,f,pathCentre(z)+side*(width/2+.065),h,z,.21,.18,.40,(i+1)%4);
    }
    const floor=(cx,cz,rx,rz)=>{
        const pieces=96;
        for(let j=0;j<pieces;j++){
            const a=j*tau/pieces,b=(j+1)*tau/pieces;
            k.face(f,[[cx,.035,cz],[cx+rx*Math.cos(b),.035,cz+rz*Math.sin(b)],[cx+rx*Math.cos(a),.035,cz+rz*Math.sin(a)]],stone(2),'stone');
        }
    };
    floor(0,0,7.9,7.8);
    for(let i=0;i<54;i++){
        const a=i*tau/54,b=(i+1)*tau/54-.0028;
        for(const [r,R,s] of [[3.23,4.1,0],[4.14,5,2],[5.05,5.96,1],[6.00,6.9,4]]){
            k.face(f,[[r*Math.cos(a),.050,r*Math.sin(a)],[r*Math.cos(b),.050,r*Math.sin(b)],
                [R*Math.cos(b),.050,R*Math.sin(b)],[R*Math.cos(a),.050,R*Math.sin(a)]],stone((i%4)+s),'stone');
        }
    }
    function walk(points,w){
        for(let seg=1;seg<points.length;seg++){
            const [ax,az]=points[seg-1],[bx,bz]=points[seg],n=Math.ceil(Math.hypot(bx-ax,bz-az)/.72);
            const yaw=Math.atan2(bx-ax,bz-az);
            for(let i=0;i<n;i++){
                const t=(i+.5)/n;
                const slab=k.frame(ax+(bx-ax)*t,0,az+(bz-az)*t,yaw);
                box(slab,0,-.065,0,w+.11*Math.sin(i),.18,Math.hypot(bx-ax,bz-az)/n-.035,stone(i+seg),'stone');
            }
        }
    }
    walk([[-3.8,4.3],[-5.65,.65],[-6.6,-1.04],[-9.04,-2.81]],2.16);
    walk([[-5.65,.65],[-5.35,-5.36],[-6.30,-10.9]],1.93);
    walk([[4.9,2.04],[5.52,-4.07],[7.54,-10.37]],2.12);
    terrace(k,f);
    arch(k,f,-1.50,-.09,13.10,3.46,1.36,2.57,.59,.94,true);
    for(const side of [-1,1]){
        stoneWall(k,f,-1.5+side*6.13,-.15,13.1,4.28,1.34,.79,side+2);
        lamp(k,f,-1.5+side*3.83,1.03,13.71,.82);
    }
    flowerHouse(k);gallery(k);
    const hollow=k.frame(-6.4,0,-13,-.32);
    tree(k,hollow,1.79,-.14,true,true);
    for(const side of [-1,1])for(let j=0;j<5;j++){
        const a=side*(.56+j*.23);
        fieldstone(k,hollow,Math.sin(a)*1.21,-.016,Math.cos(a)*1.21,.19+j*.015,.17,.19,j%4);
        if(j%2===1)spray(hollow,Math.sin(a)*1.33,.035,Math.cos(a)*1.34,
            .68,.53,side*.64,-.23,3,'white','#c0ddc8');
    }
    const rimTrees=[[-7.08,16.3,2.05,.15],[5.63,17.55,1.93,1.45],[-10.1,8.3,1.54,.7],
        [10.42,8.85,1.64,.3],[-15.2,-2.7,1.66,.58],[13.78,-8.01,1.63,1.3],[-11.85,-20,1.73,-1.7],
        [13.75,-20.54,1.53,.25],[6.7,-25.64,1.54,.395],[-7.4,-29.2,1.40,.1]];
    for(const [x,z,s,yaw] of rimTrees)tree(k,k.frame(x,-.40,z,yaw),s,yaw,false,true);
    for(let i=0;i<45;i++){
        const a=i*tau/45,r=between(26,39);
        if(Math.abs(Math.sin(a)*r)<6&&Math.cos(a)<0)continue;
        tree(k,k.frame(Math.sin(a)*r,-.50,Math.cos(a)*r,between(0,tau)),between(1.25,2.10),a,false,false);
    }
    for(const s of [-1,1]){
        const bank=[[s*3.16-1.35,21.7,-.43],[s*3.25-1.20,16.7,-.29],[s*3.05-.8,13.25,-.18],
            [s*3.75-.4,9.0,-.03],[s*5.5,6.9,0]];
        flowerBorder(k,f,bank,1.83,s+1,1.20);
        flowerBorder(k,f,[[s*3.04,-7,.02],[s*3.21+.51,-12.0,1.0],[s*3.28+.38,-17,1.85],
            [s*3.38,-22,2.63],[s*3.6,-26.6,3.49]],2.14,s+2,1.07);
        flowerBorder(k,f,[[s*10.14,11.9,-.20],[s*11.82,5.7,-.08],[s*12.76,-1.4,-.08]],2.34,s+1,1.35);
        flowerBorder(k,f,[[s*11.98,-16,.06],[s*13.5,-20,.14],[s*14.0,-26,.14]],2.29,s+2,1.12);
    }
    flowerBorder(k,f,[[-13,-1.4,0],[-11.5,-1.20,0],[-10.7,-1.81,0]],1.19,0,.75);
    flowerBorder(k,f,[[-8.33,-9.22,0],[-8.64,-11.84,0],[-9.16,-14.56,0]],1.45,1,1.03);
    flowerBorder(k,f,[[10.54,-7.23,0],[11.61,-8.98,0],[12.56,-12.08,0]],1.47,2,.95);
    for(const [x,z,s] of [[-3.98,18.54,.91],[2.09,15.10,.84],[-3.75,8.30,.85],
        [4.65,6.42,.88],[-6.62,-2.0,.81],[5.13,-6.22,.85],[-7.63,-9.72,.73]])lamp(k,f,x,-.02,z,s);
    // Partially buried boulders and asymmetric drifts break the ground plane beyond each turn.
    for(let i=0;i<160;i++){
        const a=rand()*tau,r=between(13.5,30),x=Math.sin(a)*r,z=Math.cos(a)*r;
        if(Math.abs(x)<4.5||Math.hypot(x+9.9,z+4.7)<4.3||Math.hypot(x-8,z+12.7)<5.4||Math.hypot(x+6.4,z+13)<3.65)continue;
        fieldstone(k,f,x,-.37,z,between(.4,1.25),between(.44,1.03),between(.42,1.09),i%4);
        if(i%3===0)spray(f,x,-.1,z,1.39,.94,a,.17,i%4,'leaf');
    }
    woodlandFloor(k,f);
    k.finish();
    const lamps=[
        [-9.43,2.64,-2.18,10,7,'#ffe2a8'],[.15,7.6,-30.43,23,11,'#ffddad'],
        [-3.82,.97,18.34,11,5.0,'#ffcc88'],[2.09,1.08,15.10,8.8,4.8,'#ffd197'],
        [-7.45,1.06,-9.80,13,5.5,'#ffd69a'],[2.75,2.45,-14.87,13,5.8,'#ffe2a7'],
        [5.10,1.27,-9.96,8.3,4.9,'#ffcf8d']
    ];
    const lights=lamps.map(([x,y,z,power,reach,tone])=>{
        const l=new T.PointLight(tone,power,reach,2);l.position.set(x,y,z);scene.add(l);return l;
    });
    const moonFill=new T.DirectionalLight('#b0cafa',.30);
    moonFill.position.set(-16,14,17);scene.add(moonFill);lights.push(moonFill);
    const moonEdge=new T.DirectionalLight('#a4c8fc',.54);
    moonEdge.position.set(15,9,-25);scene.add(moonEdge);lights.push(moonEdge);
    const glowGeometry=new T.BufferGeometry();
    glowGeometry.setAttribute('position',new T.Float32BufferAttribute(k.lampPoints.flat(),3));
    const lampGlows=new T.ShaderMaterial({
        transparent:true,depthWrite:false,blending:T.AdditiveBlending,
        vertexShader:`void main(){vec4 v=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*v;
            gl_Position.z-=.0007*gl_Position.w;gl_PointSize=clamp(450./max(1.,-v.z),4.,90.);}`,
        fragmentShader:`void main(){float d=length(gl_PointCoord*2.-1.);if(d>=1.)discard;
            gl_FragColor=vec4(1.,.72,.34,.24*pow(1.-d,2.7));}`
    });
    const glows=new T.Points(glowGeometry,lampGlows);glows.name='石径灯雾';scene.add(glows);
    const fireflyGeo=new T.BufferGeometry(),spots=[];
    for(let i=0;i<60;i++){
        const s=i%2?-1:1;spots.push(s*between(2.2,9.0),between(.7,2.8),between(-24,19));
    }
    fireflyGeo.setAttribute('position',new T.Float32BufferAttribute(spots,3));
    const glints=new T.ShaderMaterial({
        transparent:true,depthWrite:false,blending:T.AdditiveBlending,
        uniforms:{clock:{value:0}},
        vertexShader:`uniform float clock;varying float alpha;
            void main(){vec3 p=position;float a=p.x*.83+p.z*.41;p.x+=.24*sin(clock*.48+a);p.y+=.13*cos(clock*.8-a);
            vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(36./max(.4,-v.z),1.,4.);
            alpha=.25+.72*pow(.5+.5*sin(a+clock*1.39),2.);}`,
        fragmentShader:`varying float alpha;void main(){float d=length(gl_PointCoord*2.-1.);if(d>1.)discard;
            gl_FragColor=vec4(1.,.85,.42,alpha*(1.-d*d));}`
    });
    const flies=new T.Points(fireflyGeo,glints);flies.name='花间流萤';scene.add(flies);
    return {update(t,reduced,pointer){k.update(t,reduced,pointer);flies.visible=!reduced;glints.uniforms.clock.value=t;},
        dispose(){k.dispose();for(const l of lights)l.removeFromParent();flies.removeFromParent();glints.dispose();fireflyGeo.dispose();
            glows.removeFromParent();lampGlows.dispose();glowGeometry.dispose();}};
}
