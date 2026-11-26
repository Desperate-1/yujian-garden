import {printed,finishQuarterPrint} from './anime_quarter_print.js';

// Sakura-dori is built at pedestrian scale. Local +Z is the pavement side
// of every building. The original door hinge, exhibition stand and clock
// mechanism stay in their landmark frames.
const paintCache=new WeakMap();
function paints(kit){
    if(paintCache.has(kit))return paintCache.get(kit);
    const {T,ink,leaf,paper,sky,blossom,gold}=kit;
    const mix=(base,tint,n)=>new T.Color(base).lerp(new T.Color(tint),n).getHex();
    const palette={
        plaster:mix('#d9d1be',paper,.11), ivory:mix('#eee8d7',paper,.12), stone:mix('#aea8a4',sky,.10),
        cedar:mix('#78635b',ink,.12), timber:mix('#504945',ink,.10), seam:mix('#3b4153',ink,.15),
        metal:mix('#89929e',sky,.12), steel:mix('#63717d',sky,.09), roof:mix('#51596d',sky,.07),
        blueWall:mix('#9dabb3',sky,.12), moss:mix('#47685d',leaf,.09), celadon:mix('#9baea1',leaf,.12),
        berry:mix('#9c5862',blossom,.12), blush:mix('#cfaaa5',blossom,.07), brass:mix('#ac8a60',gold,.09),
        darkGlass:mix('#526574',sky,.08), glass:mix('#92a3ab',sky,.15), lamp:mix('#ffe4a6',gold,.18)
    };
    paintCache.set(kit,palette);return palette;
}

function framedWindow(k,host,x,y,z,w,h,key='upperA',mullions=1,paint){
    const {block}=k,p=paints(k),trim=paint??p.steel;
    block(host,p.seam,x,y,z-.025,w+.10,h+.10,.10);
    block(host,p.darkGlass,x,y,z+.018,w,h,.035);
    printed(k,host,key,x,y,z+.042,w-.078,h-.078);
    for(const side of [-1,1]){
        block(host,trim,x+side*(w*.5-.022),y,z+.060,.052,h+.035,.062);
        block(host,trim,x,y+side*(h*.5-.020),z+.061,w,.048,.064);
    }
    for(let i=1;i<=mullions;i++){
        const xx=x+(i/(mullions+1)-.5)*w;
        block(host,trim,xx,y,z+.082,.035,h,.069);
    }
    block(host,p.ivory,x,y-h*.5-.026,z+.034,w+.13,.045,.155);
}

function signBoard(k,g,key,x,y,z,w,h,frame){
    const p=paints(k);
    k.block(g,frame??p.steel,x,y,z-.033,w+.070,h+.070,.086);
    printed(k,g,key,x,y,z+.014,w,h);
}

function fasciaBlade(k,g,key,x,y,z,w,h){
    const p=paints(k),blade=k.group(g,x,y,z);
    k.rod(blade,p.steel,[0,h*.34,-.43],[0,h*.34,.12],.036);
    k.rod(blade,p.steel,[0,-h*.27,-.43],[0,-h*.27,.12],.028);
    signBoard(k,blade,key,0,0,.15,w,h,p.timber);
    // The perpendicular face catches the lettering when walking up the street.
    const side=k.group(blade,-w*.53,0,.15-w*.33,-Math.PI/2);
    signBoard(k,side,key,0,0,0,w*.68,h,p.timber);
}

function awning(k,g,x,y,z,w,reach,drop,stripe){
    const p=paints(k),frame=k.group(g,x,y,z);
    const n=Math.max(5,Math.round(w/.34));
    const half=w/n*.5,edge=new k.T.Shape();
    edge.moveTo(-half,.017);edge.lineTo(half,.017);edge.lineTo(half,-.058);
    edge.quadraticCurveTo(half*.77,-.16,0,-.17);edge.quadraticCurveTo(-half*.83,-.163,-half,-.056);
    edge.closePath();const hem=k.cut(edge,.032);
    for(let i=0;i<n;i++){
        const xx=w*((i+.5)/n-.5);
        const color=i%2===0?stripe:p.ivory;
        const a=k.block(frame,color,xx,-drop/2,reach/2,w/n+.002,.043,Math.hypot(reach,drop));
        a.rotation.x=Math.atan2(drop,reach);
        k.mesh(frame,hem,color,xx,-drop,reach);
    }
    for(const side of [-1,1]){
        const xx=side*(w*.5-.11);
        k.rod(frame,p.steel,[xx,-.28,0],[xx,-drop-.06,reach-.02],.017);
        k.rod(frame,p.steel,[xx,-.49,0],[xx,-drop-.06,reach-.02],.017);
    }
    k.rod(frame,p.timber,[-w/2,-drop-.07,reach-.02],[w/2,-drop-.07,reach-.02],.022);
}

function airUnit(k,g,x,y,z,w=.64){
    const p=paints(k);
    k.block(g,p.ivory,x,y,z,w,.66*w,.39*w);
    k.block(g,p.stone,x,y,z+.201*w,w*.91,w*.55,.025);
    k.coin(g,p.steel,x-.14*w,y,z+.221*w,w*.213,w*.213,.027);
    k.coin(g,p.stone,x-.14*w,y,z+.242*w,w*.08,w*.08,.019);
    for(let i=-2;i<=2;i++){
        const extent=Math.sqrt(.21**2-(i*.068)**2)*w;
        k.block(g,p.stone,x-.14*w,y+i*.068*w,z+.255*w,2*extent,.014*w,.014);
    }
    for(let i=0;i<4;i++)k.block(g,p.steel,x+.20*w,y+(.13-i*.075)*w,z+.235*w,.19*w,.016*w,.013);
    for(const sign of [-1,1])k.block(g,p.steel,x+sign*.33*w,y-.37*w,z-.02*w,.08*w,.07*w,.58*w);
}

function drain(k,g,x,z,h){
    const p=paints(k);
    k.rod(g,p.metal,[x,h-.18,z+.12],[x,.33,z+.12],.040);
    k.rod(g,p.metal,[x,.34,z+.12],[x,.23,z+.23],.042);
    for(const t of [.21,.52,.84])k.block(g,p.steel,x,t*h,z+.116,.11,.037,.10);
}

function railing(k,g,x,y,z,w,h){
    const p=paints(k);
    k.block(g,p.steel,x,y,z,w+.05,.047,.046);
    k.block(g,p.metal,x,y-h*.80,z,w+.03,.038,.043);
    const count=Math.ceil(w/.25);
    for(let j=0;j<=count;j++)k.block(g,p.steel,x+w*(j/count-.5),y-h*.5,z,j%5===0?.040:.021,h,.032);
}

function roofPlane(k,g,w,d,eave,rise,baseColor,detailed){
    const p=paints(k);
    k.block(g,p.seam,0,eave-.08,0,w,.15,d);
    const half=d/2,slant=Math.hypot(half,rise);
    for(const side of [-1,1]){
        const s=k.block(g,baseColor,0,eave+rise*.50,side*half*.5,w+.12,.095,slant+.08);
        s.rotation.x=side*Math.atan2(rise,half);
        const count=Math.floor(w/(detailed?.47:.92));
        for(let i=1;i<count;i++){
            const x=w*(i/count-.5);
            k.rod(g,p.roof,[x,eave+rise+.042,0],[x,eave+.048,side*half],.018);
        }
        k.block(g,p.steel,0,eave-.095,side*half,w+.16,.067,.097);
    }
    k.block(g,p.steel,0,eave+rise+.055,0,w+.17,.11,.14);
}

function flowerBox(k,g,x,y,z,w,pink=true){
    const p=paints(k);
    k.block(g,p.cedar,x,y,z,w,.17,.25);
    k.block(g,p.timber,x,y+.094,z,w-.075,.036,.20);
    const count=Math.max(3,Math.round(w/.16));
    for(let i=0;i<count;i++){
        const t=i/(count-1),xx=x+(t-.5)*(w-.13),stalk=.19+.065*Math.sin(i*4.3);
        k.rod(g,p.moss,[xx,y+.105,z],[xx+.036,y+stalk+.05,z+.015],.014);
        k.foliage(g,p.moss,xx,y+.1,z,stalk,.76,2*i,.72);
        k.foliage(g,p.celadon,xx,y+.1,z,stalk*.78,-.89,1+i,.83);
        if(i%3!==1){
            const color=pink?(i%2?p.berry:p.blush):p.ivory;
            for(let j=0;j<3;j++){
                const a=j*2.1+i;
                k.coin(g,color,xx+.035+.032*Math.cos(a),y+stalk+.06+.026*Math.sin(a),z+.031,.040,.034,.032);
            }
        }
    }
}

function smallCafeTable(k,g,x,z){
    const p=paints(k);
    k.block(g,p.cedar,x,.70,z,.56,.050,.44);
    k.rod(g,p.seam,[x,.08,z],[x,.69,z],.028);
    for(const s of [-1,1]){
        k.rod(g,p.seam,[x,.18,z],[x+.21*s,.035,z+.17],.020);
        k.rod(g,p.seam,[x,.18,z],[x+.21*s,.035,z-.17],.020);
    }
    k.block(g,p.ivory,x-.09,.75,z,.13,.046,.13);
    k.coin(g,p.celadon,x+.11,.82,z,.054,.081,.062);
    k.rod(g,p.moss,[x+.11,.82,z],[x+.10,.97,z],.009);
    k.coin(g,p.blush,x+.10,.98,z,.043,.039,.025);
}

function shopLamp(k,g,x,y,z){
    const p=paints(k);
    k.block(g,p.timber,x,y+.045,z,.14,.14,.10);
    k.rod(g,p.steel,[x,y+.078,z+.02],[x,y+.15,z+.23],.022);
    k.rod(g,p.seam,[x,y+.15,z+.23],[x,y+.073,z+.23],.015);
    const shape=new k.T.LatheGeometry([[.052,-.17],[.082,-.12],[.098,.018],[.082,.067],[.041,.083]].map(([a,b])=>new k.T.Vector2(a,b)),10);
    k.mesh(g,shape,p.lamp,x,y,z+.23,true);
    k.block(g,p.steel,x,y+.079,z+.23,.14,.033,.14);
    for(const xx of [-.071,.071])k.rod(g,p.seam,[x+xx,y+.042,z+.27],[x+xx*.68,y-.125,z+.27],.007);
}

function bouquets(k,g,x,z,variant){
    const p=paints(k),b=k.group(g,x,.09,z);
    b.rotation.y=variant*.19;
    const tin=new k.T.LatheGeometry([[.13,.016],[.133,.044],[.161,.27],[.166,.32],[.158,.331],[.145,.326],[.143,.309]]
        .map(([r,y])=>new k.T.Vector2(r,y)),12);
    k.mesh(b,tin,variant%2?p.metal:p.celadon);
    k.rod(b,p.steel,[.01,.215,.105],[.01,.26,.174],.015);
    const head=new k.T.SphereGeometry(.045,7,5);
    const wrapperPaper=[p.ivory,p.blush,p.brass];
    for(let j=0;j<3;j++){
        const angle=j*2.1+variant*.30,tipX=.076*Math.cos(angle),tipZ=.072*Math.sin(angle);
        const packet=k.group(b,tipX,.278,tipZ,angle);
        packet.rotation.z=.19*Math.cos(angle);packet.rotation.x=.15*Math.sin(angle);
        // Folded, open florist's paper; the peaks rise behind the flower heads.
        const vertices=[],indices=[],n=7;
        for(let i=0;i<n;i++){
            const a=(i/(n-1)-.5)*Math.PI*1.61,r=.115;
            vertices.push(.029*Math.sin(a),0,.029*Math.cos(a),r*Math.sin(a),.18+.059*Math.sin(a*1.6+.48),r*Math.cos(a));
            if(i){const v=i*2;indices.push(v-2,v-1,v+1,v-2,v+1,v);}
        }
        const wrap=new k.T.BufferGeometry();
        wrap.setAttribute('position',new k.T.Float32BufferAttribute(vertices,3));wrap.setIndex(indices);wrap.computeVertexNormals();
        k.mesh(packet,wrap,wrapperPaper[(j+variant)%3]);
        const blooms=[p.berry,p.blush,p.ivory,p.brass];
        for(let i=0;i<5;i++){
            const a=i*2.4+j*.71,h=.257+.084*Math.sin(i*3.61+j*1.31+variant),ox=.11*Math.cos(a),oz=.089*Math.sin(a);
            k.rod(packet,p.moss,[0,.022,0],[ox,h,oz],.008);
            k.foliage(packet,i%2?p.moss:p.celadon,ox*.39,.135,oz*.55,.146,.91,i*.84,.82);
            for(let l=0;l<4;l++){
                const theta=l*Math.PI/2+.52*i;
                const pet=k.mesh(packet,head,blooms[(j+variant)%4],ox+.023*Math.sin(theta),h+.012*Math.cos(theta),oz+.022*Math.cos(theta));
                pet.scale.set(.76,.54,.71);
            }
            const centre=k.mesh(packet,head,p.brass,ox,h+.018,oz);centre.scale.setScalar(.31);
        }
    }
    k.rod(b,p.cedar,[.12,.18,.12],[.16,.62,.16],.011);
    const tag=k.group(b,.16,.63,.17,-.12);
    signBoard(k,tag,variant%2?'tagA':'tagB',0,0,0,.19,.10,p.brass);
}

function crate(k,g,x,y,z,w,h,d){
    const p=paints(k);
    for(const xx of [-1,1])for(const zz of [-1,1])
        k.block(g,p.cedar,x+xx*(w*.5-.025),y+h/2,z+zz*(d*.5-.025),.05,h,.05);
    for(let j=0;j<3;j++){
        const yy=y+(j+.55)*h/3;
        for(const sign of [-1,1]){
            k.block(g,p.cedar,x,yy,z+sign*d/2,w,h*.24,.029);
            k.block(g,p.cedar,x+sign*w/2,yy,z,.030,h*.24,d);
        }
    }
}

function noren(k,g,x,y,z,w,h,tint){
    const p=paints(k),frame=k.group(g,x,y,z);
    k.rod(frame,p.cedar,[-w*.53,.046,.023],[w*.53,.046,.023],.026);
    const n=3;
    for(let j=0;j<n;j++){
        const left=-w*.5+w*j/n+.015,right=left+w/n-.035;
        const mid=(left+right)/2;
        const geometry=new k.T.BufferGeometry();
        const y0=-h*(.96+.033*Math.sin(j*2.4));
        geometry.setAttribute('position',new k.T.Float32BufferAttribute([left,0,0,mid,0,0,right,0,0,
            left+.015,y0,.032,mid-.009,y0-.023,.082,right-.018,y0-.006,-.03],3));
        geometry.setIndex([0,3,4,0,4,1,1,4,5,1,5,2]);geometry.computeVertexNormals();k.mesh(frame,geometry,tint);
        k.coin(frame,p.ivory,mid,-h*.46,.038,.054,.056,.012);
    }
}

function bambooShade(k,g,x,y,z,w,h){
    const p=paints(k);
    k.block(g,p.cedar,x,y+h*.5,z,w+.09,.074,.093);
    printed(k,g,'shade',x,y,z+.036,w,h);
    k.rod(g,p.cedar,[x-w*.5,y-h*.5,z+.046],[x+w*.5,y-h*.5,z+.046],.022);
    k.rod(g,p.brass,[x+w*.35,y+.04,z+.055],[x+w*.35,y-h*.74,z+.055],.008);
}

export function dressAnimeCafe(k,house){
    const p=paints(k),front=1.79,w=5.68;
    k.block(house,p.stone,0,.11,.02,w+.14,.22,3.68);
    k.block(house,p.plaster,0,1.39,-.05,w,2.54,3.60);
    k.block(house,p.ivory,0,3.71,-.24,w-.06,2.17,3.45);
    k.block(house,p.cedar,0,.28,front,w,.28,.15);
    k.block(house,p.timber,0,2.52,front,w+.08,.16,.12);
    for(const x of [-2.77,-.74,.29,2.76])
        k.block(house,p.cedar,x,1.40,front,.09,2.42,.12);
    // The original hinged door occupies x=-.635..+.165 at z=1.965.
    k.block(house,p.timber,-.237,1.09,1.811,1.00,1.98,.16);
    k.block(house,p.cedar,-.237,2.03,1.853,.96,.105,.105);
    for(const sign of [-1,1])k.block(house,p.timber,-.237+sign*.463,1.05,1.870,.073,1.84,.074);
    for(const [x,ww,key] of [[-1.75,1.82,'windowL'],[1.53,2.31,'windowR']]){
        framedWindow(k,house,x,1.35,1.85,ww,1.73,key,1,p.timber);
        k.block(house,p.cedar,x,.429,1.905,ww+.07,.092,.19);
        for(let i=0;i<3;i++)k.block(house,p.timber,x+(i-1)*ww*.32,.307,1.915,.025,.15,.025);
    }
    k.block(house,p.stone,-.26,.101,2.00,1.24,.17,.48);
    k.block(house,p.ivory,-.26,.044,2.25,1.36,.08,.24);
    signBoard(k,house,'cafe',-.02,2.92,1.74,4.63,.66,p.cedar);
    awning(k,house,0,2.56,1.83,5.82,.80,.23,p.moss);
    framedWindow(k,house,-1.29,3.94,1.51,2.06,1.04,'upperB',2);
    framedWindow(k,house,1.31,3.94,1.51,1.55,1.03,'upperA',1);
    bambooShade(k,house,1.62,4.14,1.681,.73,.68);
    flowerBox(k,house,-1.29,3.32,1.65,1.79);
    k.block(house,p.stone,1.31,3.34,1.63,1.67,.10,.31);
    railing(k,house,1.31,3.67,1.76,1.52,.29);
    for(const x of [-2.64,2.60])drain(k,house,x,1.52,4.83);
    const side=k.group(house,2.82,0,-.12,Math.PI/2);
    framedWindow(k,side,.05,3.87,.016,1.69,.96,'upperA',1);
    airUnit(k,side,.34,1.03,.23,.84);airUnit(k,side,-.72,1.01,.23,.78);
    k.rod(side,p.metal,[.78,.93,.22],[.99,.93,.22],.027);
    k.rod(side,p.metal,[.99,.93,.22],[.99,2.52,.22],.027);
    const left=k.group(house,-2.83,0,-.14,-Math.PI/2);
    framedWindow(k,left,-.10,3.88,.016,1.63,1.00,'upperB',1);
    roofPlane(k,house,5.95,4.21,4.85,.47,p.roof,true);
    // The fine grooves continue into the window recesses and stop at their trim.
    for(let row=0;row<9;row++){
        const yy=3.36+row*.151;
        for(const [xx,ww] of [[-2.59,.32],[.16,.66],[2.47,.38]])
            k.block(house,p.stone,xx,yy,1.499,ww,.012,.016);
    }
    fasciaBlade(k,house,'cafeBlade',-2.90,3.38,1.87,.34,1.38);
    flowerBox(k,house,-2.38,.27,2.14,.71);
    flowerBox(k,house,2.40,.25,2.09,.73,false);
    crate(k,house,-1.78,.095,2.19,.59,.29,.39);
    bouquets(k,house,-1.81,2.31,1);bouquets(k,house,-2.12,2.49,2);
    const upperFlowers=k.group(house,1.92,.20,2.32,-.23);upperFlowers.scale.setScalar(1.18);
    bouquets(k,upperFlowers,0,0,3);
    bouquets(k,house,2.31,2.48,4);
    k.rod(house,p.seam,[.58,1.85,1.971],[.45,1.68,1.971],.006);
    k.rod(house,p.seam,[.58,1.85,1.971],[.71,1.68,1.971],.006);
    signBoard(k,house,'open',.58,1.61,1.978,.32,.16,p.cedar);
    shopLamp(k,house,-.754,2.12,1.92);shopLamp(k,house,2.62,2.10,1.91);
    const menu=k.group(house,-1.22,0,2.24,-.18);
    for(const s of [-1,1]){
        k.rod(menu,p.cedar,[s*.224,.035,.16],[s*.224,.93,-.03],.023);
        k.rod(menu,p.cedar,[s*.224,.035,-.24],[s*.224,.93,-.03],.023);
    }
    signBoard(k,menu,'menu',0,.55,.095,.413,.645,p.cedar);
    smallCafeTable(k,house,1.11,2.27);
}

function vending(k,g,x,y,z,tint){
    const p=paints(k),unit=k.group(g,x,y,z);
    k.block(unit,p.seam,0,.10,0,.76,.18,.54);
    k.block(unit,tint,0,1.01,0,.86,1.82,.61);
    k.block(unit,p.ivory,0,1.91,0,.85,.058,.59);
    signBoard(k,unit,'drinks',-.058,1.40,.321,.61,.75,p.metal);
    k.block(unit,p.steel,.30,.86,.328,.167,.32,.035);
    k.block(unit,p.lamp,.30,.92,.350,.112,.047,.012);
    k.block(unit,p.seam,.30,.83,.350,.095,.022,.012);
    k.block(unit,p.timber,-.059,.40,.322,.46,.22,.046);
    k.block(unit,p.steel,-.059,.464,.351,.43,.082,.046);
    for(let j=0;j<5;j++)k.block(unit,p.steel,-.185+j*.076,.186,.325,.043,.017,.018);
}

export function dressAnimeGallery(k,g){
    const p=paints(k),width=8.4;
    k.block(g,p.stone,0,.13,-.12,width+.08,.25,3.27);
    k.block(g,p.blueWall,0,1.51,-.21,width,2.78,3.12);
    // Upper storey is set back behind the station-style active street clock.
    k.block(g,p.plaster,0,3.97,-.43,width-.10,2.11,2.62);
    k.block(g,p.seam,0,2.83,-.20,width+.20,.13,3.36);
    k.block(g,p.ivory,0,3.00,-.19,width+.17,.20,3.31);
    const z=1.39;
    for(const [x,w] of [[-2.94,1.71],[-1.18,1.64],[1.55,1.83],[3.31,1.25]]){
        framedWindow(k,g,x,1.51,z,w,2.18,'upperA',0,p.steel);
        const key=x< -2?'landscape':x<0?'platform':x<2?'exhibit':'platform';
        const posterW=w*(x>2?.49:.54),posterH=posterW*1.38;
        k.block(g,p.ivory,x,1.48,z+.10,posterW+.09,posterH+.09,.035);
        printed(k,g,key,x,1.48,z+.128,posterW,posterH);
        k.block(g,p.steel,x,2.21,z+.11,w,.032,.025);
    }
    framedWindow(k,g,.18,1.39,z,.98,2.07,'upperB',1,p.seam);
    k.rod(g,p.ivory,[.46,1.19,1.53],[.46,1.59,1.53],.019);
    signBoard(k,g,'gallery',-.04,2.97,1.523,7.97,.66,p.steel);
    k.block(g,p.moss,0,2.594,1.56,8.43,.078,.32);
    for(const x of [-3.32,-1.16,1.44,3.40]){
        k.block(g,p.steel,x,3.367,1.47,.044,.21,.10);
        k.rod(g,p.steel,[x,3.42,1.48],[x,3.50,1.77],.019);
        k.block(g,p.steel,x,3.505,1.79,.21,.079,.117);
        k.block(g,p.ivory,x,3.462,1.79,.16,.021,.10);
    }
    for(const [x,w] of [[-2.96,1.42],[-1.05,1.71],[2.83,1.64]]){
        framedWindow(k,g,x,4.13,.903,w,1.10,'upperA',1);
        k.block(g,p.stone,x,3.52,.97,w+.17,.11,.30);
    }
    k.block(g,p.ivory,.68,4.23,.90,1.46,1.51,.16);
    k.block(g,p.steel,0,5.11,-.39,width+.25,.15,3.05);
    k.block(g,p.ivory,0,5.25,-.42,width+.15,.16,2.97);
    k.block(g,p.seam,0,5.33,-.42,width+.19,.045,3.01);
    for(const x of [-4.06,4.04])drain(k,g,x,.99,5.13);
    const right=k.group(g,4.16,0,-.39,Math.PI/2);
    framedWindow(k,right,0,3.96,.01,1.66,1.01,'upperB',1);
    const left=k.group(g,-4.16,0,-.39,-Math.PI/2);
    airUnit(k,left,.18,3.83,.15,.82);
    airUnit(k,left,1.08,3.83,.15,.76);
    bambooShade(k,g,-3.28,4.38,1.044,.65,.62);
    const wallEdge=k.group(g,4.09,0,1.37,Math.PI/2);
    for(let i=0;i<3;i++){
        const pipeX=-.31-.12*i;
        k.rod(wallEdge,p.metal,[pipeX,.26,.035],[pipeX,1.56+.17*i,.035],.022);
        k.block(wallEdge,p.stone,pipeX,1.59+.17*i,.065,.145,.19,.09);
        k.coin(wallEdge,p.steel,pipeX,1.62+.17*i,.125,.043,.043,.018);
    }
    fasciaBlade(k,g,'galleryBlade',-4.11,3.53,1.53,.39,1.60);
    vending(k,g,3.37,.02,1.89,p.ivory);
    flowerBox(k,g,-3.31,.25,1.83,1.34);
    k.block(g,p.stone,-.08,.078,1.81,2.72,.15,.59);
}

// Frontages turn out toward the street. The central gap beyond the square
// stays open all the way to the distant bend in the road.
// x, z, width along frontage, depth, eave, yaw, façade finish, shop sign
export const quarterLots=[
    [-14.38,14.5,6.8,5.3,6.8,1.56,'timber',1],
    [15.15,14.6,7.0,5.5,7.8,-1.50,'tile',0],
    [-14.20,6.0,6.2,5.5,5.7,1.34,'tile',2],
    [13.40,5.75,5.8,5.4,5.8,-1.43,'plaster',4],
    [-18.03,-7.61,5.9,5.1,6.0,.58,'timber',2],
    [17.08,-5.54,7.2,5.6,7.0,-.97,'tile',3],
    [-15.34,-15.85,6.35,5.4,7.7,.57,'plaster',0],
    [-11.83,-23.3,5.05,4.7,5.9,.60,'timber',1],
    [14.72,-21.51,6.28,5.4,7.8,-.67,'plaster',2],
    [12.68,-24.74,5.14,4.1,5.5,-.82,'tile',0],
    [-12.13,-30.15,5.41,5.15,7.0,1.35,'tile',3],
    [11.81,-31.87,6.14,5.16,6.9,-1.47,'timber',5],
    [-12.53,-37.53,6.18,5.15,6.0,1.48,'plaster',2],
    [12.00,-40.16,6.72,4.88,5.3,-1.36,'tile',3],
    [-7.18,-45.86,6.40,5.12,6.7,1.52,'timber',1],
    [5.85,-49.25,6.64,4.9,6.7,-1.28,'plaster',4],
    [-4.16,-57.46,5.81,4.70,5.5,.42,'tile',0],
    [5.02,-58.46,6.01,4.69,7.3,-.53,'timber',2],
    [-24.80,-25.8,9.21,6.3,8.4,.21,'timber',4],
    [21.45,-32.2,9.27,6.3,9.2,-.22,'tile',1],
    [-18.04,-40.8,8.3,7.1,8.0,.26,'plaster',0],
    [18.21,-46.8,8.8,6.5,6.9,-.18,'timber',3],
    [20.84,-14.0,5.83,4.64,5.75,-.55,'timber',1],
    [26.93,-18.72,6.82,5.20,7.26,-.32,'tile',3],
    [-22.8,-15.08,7.12,4.96,5.8,.45,'plaster',5],
    [1.84,-72.2,7.12,5.20,6.7,-.18,'timber',1]
];

// Modest residential lanes at the back of the shops, including what is
// visible when the visitor looks away from the fountain and back home.
const homeLots=[
    [-24.82,-4.89,6.30,4.32,5.48,.95],[-24.55,2.36,5.94,4.29,6.21,1.21],
    [-31.85,-10.85,6.68,4.55,6.18,.51],[-30.60,-1.55,6.04,4.33,5.10,1.39],
    [-31.31,7.22,5.44,4.70,5.93,.96],[-22.71,13.82,7.21,4.65,5.75,1.41],
    [-12.02,25.37,6.32,4.40,5.45,1.70],[13.04,26.66,6.20,4.60,6.57,-1.65],
    [-11.17,34.08,5.92,4.69,5.19,1.84],[10.25,35.72,5.86,4.74,5.84,-1.65],
    [-6.84,47.39,6.40,4.80,5.52,2.87],[3.15,49.24,6.83,4.66,5.83,-2.98],
    [26.65,-5.52,5.96,4.66,6.36,-.78],[27.33,2.58,6.80,4.36,5.56,-1.14]
];

// Include the café, gallery, projecting eaves and shop awnings in the
// planting setback. Distance is measured perpendicular to each rotated lot.
const buildingEnvelopes=[...quarterLots,...homeLots,[-9.9,-4.7,5.82,3.78,5.3,.34],[8,-12.7,8.48,3.3,5.4,-.23]];
export function quarterTreeClearance(x,z){
    let nearest=Infinity;
    for(const [bx,bz,w,d,,yaw] of buildingEnvelopes){
        const dx=x-bx,dz=z-bz,c=Math.cos(yaw),s=Math.sin(yaw);
        const along=c*dx-s*dz,front=s*dx+c*dz;
        const a=Math.max(0,Math.abs(along)-w/2-.22);
        const b=Math.max(0,front-d/2-.84,-d/2-.35-front);
        nearest=Math.min(nearest,Math.hypot(a,b));
    }
    return nearest;
}

function shutters(k,group,x,y,z,w,h){
    const p=paints(k);
    k.block(group,p.steel,x,y,z,w,h,.068);
    k.block(group,p.stone,x,y,z+.044,w-.09,h-.07,.052);
    const n=Math.ceil(h/.13);
    for(let j=1;j<n;j++)k.block(group,p.metal,x,y+h*(j/n-.5),z+.081,w-.11,.017,.017);
}
function residential(k,root,lot,index){
    const [x,z,w,d,h,yaw,skin,shop]=lot,p=paints(k),g=k.group(root,x,0,z,yaw),f=d*.5;
    const far=z< -33 || Math.abs(x)>20, high=h>7.4;
    const wall=skin==='tile'?p.blueWall:skin==='timber'?p.plaster:p.ivory;
    k.block(g,p.stone,0,.22,0,w+.10,.43,d+.08);
    k.block(g,wall,0,(h+.33)/2,0,w,h-.33,d);
    k.block(g,p.seam,0,.41,f+.021,w,.065,.084);
    k.block(g,skin==='timber'?p.timber:p.steel,0,2.56,f+.08,w+.14,.12,.27);
    // The wall that faces the square is still a complete elevation at its end.
    const end=k.group(g,(index%2?-1:1)*(w*.5+.018),0,0,index%2?-Math.PI/2:Math.PI/2);
    for(const xx of [-.23*d,.23*d]){
        framedWindow(k,end,xx,h-.98,.010,d*.30,1.07,index%3?'upperB':'upperA',1);
        if(high)framedWindow(k,end,xx,h-3.03,.010,d*.30,.99,'upperA',1);
    }
    const backEnd=k.group(g,(index%2?1:-1)*(w*.5+.018),0,0,index%2?Math.PI/2:-Math.PI/2);
    framedWindow(k,backEnd,0,h-1.21,.008,d*.51,1.10,'upperA',2);
    if(!far && index%3!==2){airUnit(k,backEnd,-d*.17,1.03,.22,.87);drain(k,end,d*.4,.02,h-.10);}
    if(skin==='tile'){
        const courses=Math.floor((h-3.05)/.31);
        for(let i=0;i<courses;i++){
            const yy=3.09+i*.31;
            k.block(g,p.metal,0,yy,f+.017,w-.03,.014,.022);
            k.block(end,p.metal,0,yy,.036,d,.014,.019);
        }
    }else if(skin==='timber'){
        for(const xx of [-.48*w,0,.48*w])k.block(g,p.cedar,xx,(h+2.65)*.5,f+.040,.071,h-2.65,.081);
        k.block(g,p.cedar,0,h-.22,f+.03,w,.092,.10);
    }
    const bays=w>6.4?3:2;
    const floors=high?2:1;
    for(let floor=0;floor<floors;floor++){
        const yy=h-1.10-floor*1.92;
        for(let i=0;i<bays;i++){
            const xx=w*((i+.5)/bays-.5),ww=w/bays*.68;
            framedWindow(k,g,xx,yy,f+.052,ww,high?1.06:1.31,(i+index)%3?'upperA':'upperB',1);
            if((i+floor+index)%4===0){
                k.block(g,p.stone,xx,yy-.70,f+.279,ww+.26,.10,.54);
                railing(k,g,xx,yy-.22,f+.50,ww+.20,.44);
                for(const s of [-1,1])k.rod(g,p.steel,[xx+s*(ww+.16)*.5,yy-.22,f+.07],[xx+s*(ww+.16)*.5,yy-.22,f+.50],.028);
                if(index%4===1&&!far){
                    const towel=k.block(g,p.ivory,xx-.18,yy-.41,f+.522,.31,.40,.023);towel.rotation.z=.026;
                    k.block(g,p.celadon,xx+.20,yy-.39,f+.521,.22,.32,.025);
                }
            }
        }
    }
    if((index%4===1 || index%5===0) && !far){
        const a=k.group(g,w*.31,0,-d*.19);
        k.rod(a,p.metal,[0,h+.1,0],[0,h+1.51,0],.023);
        k.rod(a,p.steel,[-.63,h+1.20,0],[.64,h+1.20,0],.022);
        for(let j=0;j<6;j++){
            const xx=(j-2.5)*.19,len=.32-j*.018;
            k.rod(a,p.steel,[xx,h+1.20,-len],[xx,h+1.20,len],.014);
        }
    }
    const glass=['chemist','books','florist','electric','laundry','stationery'][shop];
    const doorX=-w*.31;
    if(index%4===2){
        shutters(k,g,w*.08,1.41,f+.08,w*.47,2.02);
        framedWindow(k,g,-w*.32,1.31,f+.08,.96,1.93,'upperB',0);
    }else{
        framedWindow(k,g,doorX,1.37,f+.07,w*.19,1.96,'upperA',1,p.timber);
        framedWindow(k,g,w*.15,1.39,f+.07,w*.58,1.64,glass,shop===0?3:1,skin==='timber'?p.timber:p.steel);
    }
    const signW=w*(index%3===2?.74:.85);
    signBoard(k,g,'shop'+shop,0,2.89,f+.14,signW,.47,skin==='timber'?p.cedar:p.steel);
    if(shop===2){
        awning(k,g,0,2.49,f+.12,w*.94,.64,.145,p.moss);
        if(!far){
            crate(k,g,w*.14,.11,f+.43,.78,.30,.51);
            bouquets(k,g,w*.14,f+.69,1);bouquets(k,g,w*.27,f+.51,3);
        }
    }else if(shop===1||shop===5){
        k.block(g,p.timber,0,2.49,f+.31,w*.95,.095,.65);
        if(!far){
            noren(k,g,doorX,2.35,f+.26,w*.231,.41,shop===1?p.berry:p.moss);
            bambooShade(k,g,w*.31,h-.91,f+.164,w*.30,.72);
        }
    }else if(shop===0){
        k.block(g,p.ivory,0,2.62,f+.34,w*.98,.27,.70);
        k.block(g,p.moss,0,2.68,f+.693,w*.98,.058,.036);
        k.block(g,p.brass,0,2.499,f+.693,w*.98,.032,.036);
        if(!far){
            k.block(g,p.moss,-w*.415,3.47,f+.20,.53,.56,.12);
            k.block(g,p.ivory,-w*.415,3.47,f+.273,.31,.099,.022);
            k.block(g,p.ivory,-w*.415,3.47,f+.277,.099,.31,.021);
        }
    }else{
        k.block(g,shop===4?p.steel:p.cedar,0,2.55,f+.26,w*.94,.091,.57);
        if(!far && shop===4){
            noren(k,g,doorX,2.33,f+.31,w*.20,.52,p.steel);
            k.rod(g,p.steel,[w*.427,3.14,f+.05],[w*.427,3.14,f+.47],.031);
            k.coin(g,p.steel,w*.427,2.94,f+.46,.26,.26,.104);
            k.coin(g,p.ivory,w*.427,2.94,f+.528,.211,.211,.032);
            k.coin(g,p.metal,w*.427,2.94,f+.55,.122,.122,.023);
        }
    }
    if(!far){
        drain(k,g,-w*.48,f+.044,h-.12);
        if(index%3===0)flowerBox(k,g,w*.27,.25,f+.33,1.21,false);
        if(index%4===1)vending(k,g,w*.42,.02,f+.39,p.celadon);
    }
    if(index%3!==0){
        roofPlane(k,g,w+.34,d+.42,h,.49+(index%3)*.20,index%5===1?p.cedar:p.roof,!far);
    }else{
        k.block(g,p.steel,0,h+.01,0,w+.24,.14,d+.19);
        k.block(g,wall,0,h+.13,0,w+.16,.14,d+.12);
        k.block(g,p.seam,0,h+.228,0,w+.21,.054,d+.18);
        k.block(g,p.stone,-w*.19,h+.46,-d*.18,1.15,.46,.79);
    }
}

function sagWire(k,root,a,b,sag,radius,color){
    const dx=b[0]-a[0],dz=b[2]-a[2];
    const segments=Math.max(4,Math.ceil(Math.hypot(dx,dz)/3.5));
    let prev=a;
    for(let j=1;j<=segments;j++){
        const t=j/segments;
        const p=[a[0]+dx*t,a[1]+(b[1]-a[1])*t-sag*4*t*(1-t),a[2]+dz*t];
        k.rod(root,color,prev,p,radius);prev=p;
    }
}

function utilityPole(k,root,x,z,h,index){
    const p=paints(k),pole=k.group(root,x,0,z);
    k.rod(pole,p.stone,[0,0,0],[0,h+.38,0],.13);
    k.rod(pole,p.metal,[0,h-.75,0],[0,h+.39,0],.085);
    for(const yy of [h-.13,h-1.06])k.block(pole,p.steel,0,yy,0,1.53,.108,.12);
    k.rod(pole,p.steel,[-.62,h-.16,0],[-.07,h-.76,0],.040);
    for(const dx of [-.65,0,.65]){
        for(let j=0;j<3;j++)k.coin(pole,p.ivory,dx,h-.054+j*.059,0,.076-.010*j,.045,.092);
    }
    k.block(pole,p.steel,.23,h-1.51,0,.28,.41,.31);
    if(index%3===1){
        k.rod(pole,p.steel,[.07,h-1.8,0],[.68,h-1.8,.06],.044);
        k.rod(pole,p.metal,[.43,h-1.58,.06],[.43,h-.77,.06],.216);
        for(let j=0;j<4;j++)k.rod(pole,p.steel,[.43,h-1.27+j*.115,.06],[.43,h-1.24+j*.115,.06],.225);
    }
    if(index%3===0){
        const fixture=k.group(pole,0,h-2.10,0);
        k.rod(fixture,p.steel,[0,0,0],[.82,.26,.03],.043);
        k.block(fixture,p.steel,.84,.256,.03,.40,.10,.21);
        k.block(fixture,p.lamp,.87,.198,.03,.32,.023,.15);
    }
    if(index<5){
        for(let i=0;i<5;i++)k.rod(pole,i%2?p.seam:p.brass,[0,.32+i*.145,0],[0,.46+i*.145,0],.143);
        const marker=k.group(pole,.01,1.86,.139);
        signBoard(k,marker,'streetBlade',0,0,.013,.20,.72,p.steel);
        for(const y of [2.95,h-2.10])k.rod(pole,p.steel,[0,y,0],[0,y+.056,0],.136);
    }
}

function powerLines(k,root){
    const p=paints(k);
    const west=[[-7.77,22.1,8.15],[-8.45,5.4,7.84],[-9.35,-9.50,7.96],[-7.01,-21.32,7.66],[-5.68,-33.32,7.10],[-5.30,-46.21,7.35],[-3.11,-58.08,6.79]];
    const east=[[8.34,22.9,7.86],[8.72,7.80,7.98],[11.08,-3.04,8.11],[11.21,-18.25,7.72],[5.91,-27.44,7.49],[5.21,-39.19,7.27],[3.34,-51.69,6.92]];
    for(const [side,row] of [west,east].entries()){
        row.forEach(([x,z,h],i)=>utilityPole(k,root,x,z,h,i+side));
        for(let j=1;j<row.length;j++){
            const [ax,az,ah]=row[j-1],[bx,bz,bh]=row[j];
            const span=Math.hypot(ax-bx,az-bz);
            for(const offset of [-.65,0,.65]){
                sagWire(k,root,[ax+offset,ah+.126,az],[bx+offset,bh+.126,bz],span*(.024+(offset+.65)*.005),.016,p.seam);
            }
            sagWire(k,root,[ax-.45,ah-1.02,az],[bx-.45,bh-1.02,bz],span*.042,.025,p.seam);
            sagWire(k,root,[ax+.27,ah-.99,az],[bx+.27,bh-.99,bz],span*.038,.014,p.steel);
        }
    }
    // Narrow service drops cross the street high overhead, at different depths.
    for(const [i,j] of [[0,1],[2,2],[4,4],[5,5]]){
        const [ax,az,ah]=west[i],[bx,bz,bh]=east[j];
        sagWire(k,root,[ax+.34,ah-1.02,az],[bx-.59,bh-.97,bz],.69,.017,p.seam);
    }
    for(const [ax,ay,az,bx,by,bz] of [
        [-8.45,6.75,5.4,-10.85,5.63,7.7],[-9.35,6.87,-9.50,-11.8,4.68,-7.7],
        [8.72,6.87,7.80,11.07,5.69,7.0],[11.21,6.65,-18.25,10.5,4.88,-14.1],
        [-7.01,6.59,-21.32,-10.08,5.80,-20.86]
    ])sagWire(k,root,[ax,ay,az],[bx,by,bz],.35,.014,p.seam);
}

function sideGarden(k,root){
    const p=paints(k),garden=k.group(root,15.24,0,-13.51,-.28);
    k.block(garden,p.stone,0,.055,-.24,4.7,.115,2.64);
    // A low block fence, open at the gate. Each pierced block casts a
    // separate shadow through its two vents.
    for(const side of [-1,1]){
        const width=side<0?1.55:1.47,centre=side*1.45;
        k.block(garden,p.stone,centre,.31,1.00,width,.56,.19);
        for(let row=1;row<=2;row++)k.block(garden,p.metal,centre,row*.18,1.102,width,.013,.012);
        for(let n=0;n<4;n++){
            const x=centre+width*((n+.5)/4-.5);
            k.block(garden,p.metal,x,.28,1.105,.011,.46,.011);
            k.block(garden,p.stone,x,.65,1.00,width/4-.014,.045,.185);
            k.block(garden,p.stone,x,.78,1.00,width/4-.014,.046,.185);
            for(const s of [-1,0,1])k.block(garden,p.stone,x+s*width/19,.716,1,.038,.096,.18);
        }
        k.block(garden,p.roof,centre,.833,1,width+.085,.061,.265);
    }
    for(const x of [-.61,.61])k.block(garden,p.timber,x,.62,.99,.12,1.20,.12);
    for(let j=0;j<8;j++)k.block(garden,p.cedar,(j-3.5)*.14,.54,1.00,.092,.87,.071);
    k.block(garden,p.timber,0,.70,.958,1.20,.059,.064);
    const shrubs=new k.T.SphereGeometry(1,13,8);
    for(const [x,y,z,w,h,d] of [[-1.55,.48,.49,.61,.53,.42],[-1.84,.66,.19,.51,.48,.41],
        [1.48,.66,.21,.62,.61,.54],[1.18,.89,-.12,.72,.68,.61],[.86,1.07,-.40,.65,.43,.52]]){
        const shrub=k.mesh(garden,shrubs,p.moss,x,y,z);shrub.scale.set(w,h,d);
        const tip=k.mesh(garden,shrubs,p.celadon,x-.18*w,y+.65*h,z+.02);tip.scale.set(w*.64,h*.44,d*.66);
    }
    for(const [x,z] of [[-.10,.60],[.08,.21],[-.10,-.17],[.14,-.55]])
        k.block(garden,p.ivory,x,.132,z,.43,.062,.29).rotation.y=x*.9;
    const mailbox=k.group(garden,-.60,1.06,1.13,.07);
    k.block(mailbox,p.berry,0,0,0,.26,.27,.155);k.block(mailbox,p.seam,0,.013,.082,.183,.021,.017);
}

function dwelling(k,root,lot,index){
    const [x,z,w,d,h,yaw]=lot,p=paints(k),g=k.group(root,x,0,z,yaw),f=d*.5;
    const walls=[p.ivory,p.blueWall,p.stone,p.plaster],wood=index%3!==1;
    k.block(g,p.stone,0,.20,0,w+.05,.39,d+.06);
    k.block(g,walls[index%4],0,(h+.34)*.50,0,w,h-.34,d);
    const ground=index%2?p.timber:p.cedar;
    k.block(g,ground,0,2.51,f+.06,w+.10,.10,.19);
    k.block(g,p.steel,0,2.56,f+.25,w+.23,.075,.52);
    const door=-w*.32;
    k.block(g,ground,door,1.27,f+.035,.91,1.95,.105);
    k.block(g,p.glass,door,1.39,f+.096,.68,1.40,.037);
    for(let i=0;i<5;i++)k.block(g,ground,door+(i-2)*.14,1.40,f+.123,.033,1.47,.023);
    framedWindow(k,g,w*.17,1.50,f+.06,w*.41,1.19,'upperB',2,ground);
    const windows=index%3===0?3:2;
    for(let i=0;i<windows;i++){
        const xx=w*((i+.5)/windows-.5),ww=w/windows*.61;
        framedWindow(k,g,xx,h-1.02,f+.048,ww,1.09,(i+index)%3?'upperA':'upperB',1,wood?p.timber:p.steel);
        if(i===0&&index%3===1)bambooShade(k,g,xx-.18,h-.84,f+.162,ww*.66,.59);
    }
    for(const sign of [-1,1]){
        const side=k.group(g,sign*(w*.5+.014),0,0,sign*Math.PI/2);
        framedWindow(k,side,-d*.10,h-.99,.02,d*.43,1.01,'upperA',1);
        if(index%3===0)framedWindow(k,side,d*.23,1.45,.02,d*.20,.79,'upperB',0);
        else if(sign>0)airUnit(k,side,-.39,1.10,.17,.66);
    }
    if(wood){
        k.block(g,p.timber,0,h-.26,f+.01,w,.079,.089);
        for(const xx of [-w*.48,w*.01,w*.48])k.block(g,p.cedar,xx,(h+2.59)*.5,f+.014,.069,h-2.58,.083);
    }else{
        for(let j=1;j<10;j++)k.block(g,p.metal,0,h-.24-j*.16,f+.011,w,.012,.015);
    }
    drain(k,g,w*.48,f+.046,h);
    roofPlane(k,g,w+.38,d+.44,h,.68+(index%4)*.105,index%4===2?p.cedar:p.roof,index<4);
    if(index%2===1){
        k.block(g,p.stone,w*.20,h+.53,-d*.16,.54,.45,.47);
        k.block(g,p.roof,w*.20,h+.78,-d*.16,.66,.065,.60);
    }
    // Low street wall and the private front garden are interrupted at the door.
    k.block(g,p.stone,0,.06,f+.39,w-.04,.11,.76);
    k.block(g,p.stone,w*.12,.40,f+.69,w*.68,.68,.17);
    k.block(g,p.roof,w*.12,.765,f+.69,w*.68+.10,.075,.22);
    const span=w*.68;
    for(let j=0;j<3;j++)k.block(g,p.metal,w*.12,.19+j*.195,f+.782,span,.014,.011);
    for(let j=0;j<7;j++)k.block(g,p.metal,w*.12+span*(j/7-.46),.48,f+.784,.011,.17,.011);
    for(const dx of [-.51,.51])k.block(g,p.stone,door+dx,.48,f+.65,.125,.86,.18);
    if(index%3===0){
        const hedge=new k.T.SphereGeometry(1,12,7);
        for(let j=0;j<5;j++){
            const xx=w*.14+span*(j/6-.34),hh=.42+.102*Math.cos(2*j);
            const mass=k.mesh(g,hedge,p.moss,xx,.74,f+.32);
            mass.scale.set(span*.16,hh,.36);
        }
    }else{
        for(let j=0;j<11;j++)k.block(g,ground,w*.12+span*(j/11-.45),.90,f+.60,.076,.32,.039);
        k.block(g,p.cedar,w*.12,.93,f+.59,span,.043,.045);
    }
}

export function buildAnimeQuarter(kit,root){
    for(const [i,lot] of quarterLots.entries())residential(kit,root,lot,i);
    for(const [i,lot] of homeLots.entries())dwelling(kit,root,lot,i);
    sideGarden(kit,root);
    powerLines(kit,root);
    return finishQuarterPrint(kit,root);
}
