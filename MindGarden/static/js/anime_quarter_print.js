// Original shop lettering, window interiors and printed ephemera of Sakura-dori.
// Every printed panel shares a single draw, while its sill, fascia and mullions
// remain separate three-dimensional pieces that cast shadows across the print.
import {signLettering,smallLettering} from './anime_lettering.js';
const placements=new WeakMap();
export function printed(kit,parent,key,x,y,z,width,height,tilt=0){
    let panels=placements.get(kit);
    if(!panels){panels=[];placements.set(kit,panels);}
    panels.push({parent,key,x,y,z,width,height,tilt});
}

const cream='#f1ead6', blue='#38465e', pine='#385c55', rose='#92555e';
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(x,y,w,h);}
function line(c,pairs,color,width=1){
    c.beginPath();pairs.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));
    c.strokeStyle=color;c.lineWidth=width;c.stroke();
}
function shape(c,pairs,color){
    c.beginPath();pairs.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();
}
function label(c,s,x,y,size,color,font=smallLettering,weight=500){
    c.fillStyle=color;c.font=weight+' '+size+'px '+font;c.fillText(s,x,y);
}
function circle(c,x,y,r,color){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill();}
function sakura(c,x,y,r,petal,core){
    for(let n=0;n<5;n++){
        c.save();c.translate(x,y);c.rotate(n*2*Math.PI/5);c.fillStyle=petal;c.beginPath();
        c.moveTo(0,-r*.05);c.bezierCurveTo(-r*.68,-r*.36,-r*.58,-r*.90,-r*.21,-r);
        c.lineTo(0,-r*.83);c.lineTo(r*.19,-r);c.bezierCurveTo(r*.63,-r*.91,r*.57,-r*.35,0,-r*.05);c.fill();c.restore();
    }
    circle(c,x,y,r*.16,core);
}
function cafeSign(c,w,h){
    rect(c,0,0,w,h,cream);rect(c,0,h*.90,w,h*.023,'#b5a287');
    sakura(c,w*.095,h*.46,h*.34,rose,cream);
    label(c,'樱桃小屋',w*.19,h*.69,h*.64,pine,signLettering);
    label(c,'手作茶点',w*.74,h*.47,h*.22,rose,signLettering);
    label(c,'樱花茶与点心',w*.738,h*.69,h*.14,blue);
}
function photoSign(c,w,h){
    rect(c,0,0,w,h,cream);rect(c,0,0,w,h*.085,pine);rect(c,0,h*.91,w,h*.09,pine);
    const x=w*.095,y=h*.49;
    circle(c,x,y,h*.29,pine);circle(c,x,y,h*.17,cream);circle(c,x,y,h*.115,pine);
    label(c,'艺术回廊',w*.18,h*.69,h*.60,blue,signLettering);
    label(c,'樱通摄影馆',w*.65,h*.48,h*.22,pine,signLettering);
    label(c,'街坊作品展',w*.65,h*.72,h*.15,blue);
}
function interior(c,w,h,side){
    const g=c.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#4d535d');g.addColorStop(.50,'#a79d8e');g.addColorStop(1,'#686858');
    c.fillStyle=g;c.fillRect(0,0,w,h);
    rect(c,0,h*.04,w,h*.04,'#6a615b');
    for(let k=0;k<4;k++){
        const x=(k*.31-.07)*w;
        rect(c,x,h*.18,w*.205,h*.34,'#655c56');
        rect(c,x+w*.018,h*.20,w*.17,h*.30,k%2?'#d2cbb8':'#c1c6bd');
        rect(c,x+w*.037,h*.23,w*.133,h*.062,'#9b8176');
        for(let j=0;j<4;j++)rect(c,x+w*.038,h*(.335+j*.036),w*(.05+(j%3)*.026),h*.009,'#78776d');
    }
    for(let j=0;j<2;j++){
        const y=h*(.58+j*.22);
        rect(c,0,y,w,h*.026,'#675951');
        for(let i=0;i<10;i++){
            const x=((i+.35+(j%2)*.24)/10)*w,r=w*(.016+(i%3)*.002);
            if((i+j+side)%3===0){
                rect(c,x-r,y-h*.145,2*r,h*.145,'#d2c8aa');
                rect(c,x-r*.7,y-h*.18,1.4*r,h*.036,'#82796c');
                rect(c,x-r*.67,y-h*.084,1.35*r,h*.04,rose);
            }else{
                shape(c,[[x-r,y-h*.063],[x+r,y-h*.063],[x+r*.70,y],[x-r*.69,y]],(i+j)%2?'#d6d5c4':'#a0afa0');
                c.beginPath();c.arc(x+r,y-h*.044,r*.48,-Math.PI*.55,Math.PI*.60);
                c.strokeStyle=cream;c.lineWidth=2;c.stroke();
            }
        }
    }
    for(const f of [.25,.74]){
        const x=w*f;line(c,[[x,0],[x,h*.22]],blue,2);
        shape(c,[[x-w*.072,h*.26],[x-w*.022,h*.20],[x+w*.018,h*.20],[x+w*.075,h*.26]],'#8a765a');
        rect(c,x-w*.065,h*.26,w*.13,h*.010,'#fae4ad');
    }
}
function reflection(c,w,h){
    const ref=c.createLinearGradient(0,0,0,h);
    ref.addColorStop(0,'rgba(201,218,237,.29)');ref.addColorStop(.58,'rgba(184,202,224,.07)');
    ref.addColorStop(1,'rgba(125,140,163,.17)');c.fillStyle=ref;c.fillRect(0,0,w,h);
    shape(c,[[-.02*w,.48*h],[.36*w,0],[.47*w,0],[0,.65*h]],'rgba(242,240,232,.24)');
    shape(c,[[.67*w,h],[w,.53*h],[w,.60*h],[.73*w,h]],'rgba(227,240,245,.21)');
}
function upper(c,w,h,index){
    const g=c.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#66768c');g.addColorStop(.45,'#94a2ad');g.addColorStop(1,'#a4aaa5');c.fillStyle=g;c.fillRect(0,0,w,h);
    shape(c,[[0,0],[w*.26,0],[w*.205,h*.50],[w*.25,h],[0,h]],'#b6b8b3');
    shape(c,[[w,0],[w*.78,0],[w*.83,h*.53],[w*.82,h],[w,h]],index?'#c7bdac':'#9daab2');
    for(const f of [.04,.12,.18,.85,.91])line(c,[[w*f,0],[w*(f+.02),h*.50],[w*f,h]],'rgba(75,85,95,.20)',2);
    if(index){rect(c,.25*w,h*.58,w*.34,h*.14,'#c6b698');rect(c,.28*w,h*.72,w*.28,h*.22,'#576269');}
    reflection(c,w,h);
}
function poster(c,w,h,kind){
    rect(c,0,0,w,h,kind===0?'#e4dfce':'#d8ddd7');
    const x=w*.07,y=h*.10,iw=w*.86,ih=h*.65;
    const g=c.createLinearGradient(0,y,0,y+ih);
    g.addColorStop(0,kind===0?'#849bae':'#9ab0b3');g.addColorStop(1,'#ece0be');
    c.fillStyle=g;c.fillRect(x,y,iw,ih);
    if(kind===0){
        circle(c,w*.69,h*.26,w*.096,'#ede4cd');
        shape(c,[[x,h*.58],[w*.29,h*.43],[w*.41,h*.50],[w*.63,h*.32],[w*.80,h*.45],[x+iw,h*.41],[x+iw,h*.66],[x,h*.66]],'#8899a0');
        shape(c,[[x,h*.58],[w*.23,h*.51],[w*.46,h*.58],[w*.64,h*.45],[x+iw,h*.53],[x+iw,y+ih],[x,y+ih]],'#586b68');
        for(let i=0;i<16;i++)rect(c,x+((i*17)%33)/40*w,h*(.65+.008*(i%7)),w*(.03+.013*(i%5)),2,'#bdc5b1');
    }else{
        for(let i=0;i<14;i++){const xx=x+(i*37%89)/100*iw,hh=(.15+(i*17%30)/100)*ih;rect(c,xx,y+ih-hh,iw*.08,hh,i%2?'#738283':'#a69789');}
        line(c,[[x,y+ih],[w*.3,h*.51],[w*.56,h*.35],[w*.85,h*.18]],'#665357',5);
        for(let i=0;i<28;i++){const t=i/28; sakura(c,w*(.16+.68*t)+Math.sin(6*i)*w*.09,h*(.60-.41*t)+Math.cos(5*i)*h*.07,w*(.018+.015*(i%2)),'#c998a0','#ddc6a1');}
    }
    label(c,kind?'樱花来信':'水岸记忆',x,h*.85,w*.125,blue,signLettering);
    label(c,kind?'版画 · 之四':'风景 · 之三',x,h*.94,w*.060,pine);
}
function platform(c,w,h){
    rect(c,0,0,w,h,'#e6e1d3');const l=w*.07,r=w*.93,t=h*.10,b=h*.744;
    rect(c,l,t,r-l,b-t,'#96a6af');
    shape(c,[[l,b],[r,b],[r,h*.43],[w*.65,h*.45]],'#6c7e85');
    shape(c,[[l,h*.65],[w*.66,h*.44],[w*.48,h*.46],[l,h*.52]],'#c8c5ad');
    shape(c,[[l,t],[r,t],[w*.72,h*.18],[l,h*.34]],'#56616a');
    line(c,[[w*.24,h*.28],[w*.24,h*.56]],'#626b6c',5);
    line(c,[[w*.46,h*.23],[w*.46,h*.49]],'#626b6c',3);
    for(let i=0;i<19;i++){
        const x=l+((i*67)%79)/80*(r-l),y=t+((i*31)%61)/75*(b-t);
        line(c,[[x,y],[x-w*.024,y+h*.041]],'rgba(225,235,232,.55)',1.4);
    }
    label(c,'雨中站台',l,h*.85,w*.125,blue,signLettering);
    label(c,'街景 · 之二',l,h*.94,w*.060,pine);
}
function drinks(c,w,h){
    rect(c,0,0,w,h,'#d7e2df');const bottle=['#a1c3bd','#c6ac7c','#ab8692','#a8b6c7','#9aae82'];
    for(let row=0;row<3;row++){
        for(let i=0;i<6;i++){
            const x=w*(.095+i*.163),y=h*(.265+row*.309),bw=w*.085,bh=h*.154;
            rect(c,x-bw/2,y-bh,bw,bh,'#e4e3d6');
            rect(c,x-bw*.47,y-bh*.72,bw*.94,bh*.52,bottle[(i+row*3)%5]);
            rect(c,x-bw*.25,y-bh*1.17,bw*.5,bh*.19,'#8d9a97');
            rect(c,x-bw*.18,y-bh*.63,bw*.40,bh*.10,'#f9f6dd');
            circle(c,x,y+h*.053,w*.014,'#6a817e');
        }
        rect(c,0,h*(.28+row*.309),w,h*.05,'#f1f2df');
        rect(c,0,h*(.324+row*.309),w,h*.012,'#8f9f9e');
    }
}
function shopGlass(c,w,h,kind){
    const grad=c.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,kind==='books'?'#605c59':'#737b84');grad.addColorStop(1,kind==='florist'?'#b9bda5':'#a7a497');
    c.fillStyle=grad;c.fillRect(0,0,w,h);
    if(kind==='books'||kind==='chemist'){
        const tones=kind==='books'?['#ad7472','#bcb9a2','#778c91','#767a77','#c3ab82','#d2c7ae']:['#e1ddcd','#b1c4b9','#b4c1cd','#d4c4ad'];
        for(let j=0;j<3;j++){
            const base=h*(.35+j*.27);rect(c,0,base,w,h*.034,kind==='books'?'#7e6554':'#d3d7d0');
            for(let i=0;i<18;i++){
                if((i*7+j)%14===1)continue;
                const xx=(i+.22)*w/18,bw=w*(kind==='books'?.032:.040),hh=h*(.10+((i*13+j*5)%9)*.009);
                c.save();c.translate(xx,base);c.rotate(kind==='books'&&(i+j)%8===0?-.085:0);
                rect(c,0,-hh,bw,hh,tones[(i+3*j)%tones.length]);
                rect(c,bw*.12,-hh*.80,bw*.70,hh*.09,kind==='books'?'#d9d0bd':'#97ada6');
                rect(c,bw*.20,-hh*.58,bw*.46,hh*.06,kind==='books'?'#726a61':'#b5888a');
                if(kind==='chemist'&&i%3===0)rect(c,bw*.26,-hh-.022*h,bw*.48,h*.022,'#d0cac0');
                c.restore();
            }
        }
    }else if(kind==='laundry'){
        for(let i=0;i<3;i++){
            const xx=(i*.32+.015)*w;
            rect(c,xx,.25*h,w*.295,h*.51,'#d0d0c5');
            rect(c,xx+w*.023,.28*h,w*.25,h*.048,'#9caaa5');
            const cx=xx+w*.143,cy=h*.55,r=Math.min(w*.112,h*.149);
            circle(c,cx,cy,r,'#858e90');circle(c,cx,cy,r*.81,'#495b64');
            c.beginPath();c.arc(cx,cy,r*.65,-2.9,-1.5);c.lineWidth=3;c.strokeStyle='#b8c4c3';c.stroke();
        }
        rect(c,0,.77*h,w,.044*h,'#676e70');
    }else if(kind==='florist'){
        for(let i=0;i<10;i++){
            const xx=(i+.5)*w/10,base=h*(.75+(i%3)*.06);
            shape(c,[[xx-.025*w,base],[xx+.024*w,base],[xx+.035*w,base-.11*h],[xx-.035*w,base-.11*h]],i%2?'#758c86':'#a49b8e');
            for(let j=0;j<8;j++){
                const dx=Math.sin(i*15+j*6.5)*w*.038,yy=base-h*(.22+(j%3)*.060);
                line(c,[[xx,base-.095*h],[xx+dx,yy]],'#596c57',2);
                sakura(c,xx+dx,yy,w*(.012+.006*(j%2)),['#c59094','#dcbca4','#bbbe9b','#dbcbab'][(i+j)%4],'#c3a072');
            }
        }
    }else if(kind==='electric'){
        for(let i=0;i<3;i++){
            const xx=(i*.31+.05)*w,y=h*(.28+(i%2)*.08);
            rect(c,xx,y,w*.26,h*.26,'#4c535a');rect(c,xx+w*.014,y+h*.019,w*.23,h*.20,'#8b9faa');
            shape(c,[[xx+w*.015,y+h*.15],[xx+w*.10,y+h*.07],[xx+w*.163,y+h*.12],[xx+w*.212,y+h*.10],[xx+w*.238,y+h*.21],[xx+w*.015,y+h*.21]],'#829288');
            rect(c,xx+w*.106,y+h*.26,w*.057,h*.047,'#505759');
        }
        rect(c,0,h*.64,w,h*.057,'#8f7a67');
    }else{
        for(let i=0;i<4;i++){
            const xx=(.06+i*.235)*w;rect(c,xx,h*.23,w*.18,h*.41,i%2?'#c7b39c':'#d8d2b8');
            for(let j=0;j<4;j++)rect(c,xx+w*.027,h*(.29+j*.056),w*(.083+j%2*.031),h*.016,'#948d81');
        }
    }
    reflection(c,w,h);
}
function woven(c,w,h){
    rect(c,0,0,w,h,'#b09d7f');
    for(let y=2;y<h;y+=4){rect(c,0,y,w,1,y%3?'#8e806c':'#c4b297');}
    for(const x of [.09,.28,.52,.77,.93])rect(c,w*x,0,w*.006,h,'#706e5e');
    rect(c,0,h*.96,w,h*.04,'#756b58');
}
function price(c,w,h,id){
    rect(c,0,0,w,h,cream);rect(c,0,0,w,h*.105,id==='open'?pine:rose);
    if(id==='open'){
        label(c,'营业中',w*.15,h*.59,h*.36,pine,signLettering);
        label(c,'9:00 — 18:00',w*.16,h*.85,h*.16,blue);
    }else{
        label(c,id==='tagA'?'当季花束':'今日推荐',w*.10,h*.49,h*.32,blue,signLettering);
        label(c,id==='tagA'?'32 元':'18 元',w*.19,h*.87,h*.29,rose);
    }
}
function menu(c,w,h){
    rect(c,0,0,w,h,'#354c48');label(c,'今日茶单',w*.11,h*.19,w*.169,cream,signLettering);
    line(c,[[w*.10,h*.24],[w*.88,h*.24]],'#aab3a4',2);
    label(c,'小屋手作',w*.24,h*.36,w*.12,'#e2bf9b',signLettering);
    for(const [i,word] of ['手冲咖啡','樱花茶','莓果蛋糕'].entries()){
        label(c,word,w*.10,h*(.49+i*.105),w*.095,cream);
        label(c,['22元','16元','28元'][i],w*.64,h*(.49+i*.105),w*.092,cream);
    }
    line(c,[[w*.2,h*.80],[w*.26,h*.89],[w*.43,h*.89],[w*.49,h*.80],[w*.2,h*.80]],cream,2);
    sakura(c,w*.71,h*.84,w*.09,'#d2a7ad',cream);
}
const shopNames=[['青叶药房','街坊药店'],['弯月书屋','旧书换读'],['花音花店','鲜花与盆栽'],['井巷电器','家电维修'],['晴空洗衣店','洗衣与熨烫'],['樱街邮局','邮票与信笺']];
function sign(c,w,h,id){
    const item=shopNames[id%shopNames.length],dark=[pine,blue,pine,rose,blue,rose][id%6];
    rect(c,0,0,w,h,id%2?dark:cream);
    rect(c,0,h*.87,w,h*.035,id%2?'#c8bca3':dark);
    label(c,item[0],w*.055,h*.62,h*.54,id%2?cream:dark,signLettering);
    label(c,item[1],w*.065,h*.82,h*.15,id%2?cream:dark);
}
function blade(c,w,h,id){
    const bg=id==='cafeBlade'?rose:id==='galleryBlade'?blue:pine;
    const letters=id==='cafeBlade'?'樱桃茶屋':id==='galleryBlade'?'胶片冲印':'樱通花街';
    rect(c,0,0,w,h,bg);rect(c,w*.06,h*.024,w*.88,h*.952,cream);rect(c,w*.10,h*.036,w*.8,h*.928,bg);
    [...letters].forEach((s,i)=>label(c,s,w*.20,h*(.20+i*.75/letters.length),Math.min(w*.63,h*.71/letters.length),cream,signLettering));
}
const art={
    cafe:[640,110,cafeSign],gallery:[820,110,photoSign],
    windowL:[440,330,(c,w,h)=>{interior(c,w,h,0);reflection(c,w,h);}],
    windowR:[440,330,(c,w,h)=>{interior(c,w,h,1);reflection(c,w,h);}],
    upperA:[245,180,(c,w,h)=>upper(c,w,h,0)],upperB:[245,180,(c,w,h)=>upper(c,w,h,1)],
    landscape:[190,268,(c,w,h)=>poster(c,w,h,0)],exhibit:[190,268,(c,w,h)=>poster(c,w,h,1)],
    platform:[190,268,platform],
    menu:[164,224,menu],drinks:[220,268,drinks],
    shade:[250,168,woven],open:[156,96,(c,w,h)=>price(c,w,h,'open')],
    tagA:[148,74,(c,w,h)=>price(c,w,h,'tagA')],tagB:[148,74,(c,w,h)=>price(c,w,h,'tagB')],
    cafeBlade:[84,386,(c,w,h)=>blade(c,w,h,'cafeBlade')],galleryBlade:[84,386,(c,w,h)=>blade(c,w,h,'galleryBlade')],
    streetBlade:[84,336,(c,w,h)=>blade(c,w,h,'streetBlade')]
};
for(const kind of ['books','chemist','laundry','florist','electric','stationery'])
    art[kind]=[285,185,(c,w,h)=>shopGlass(c,w,h,kind)];
shopNames.forEach((_,index)=>{art['shop'+index]=[420,84,(c,w,h)=>sign(c,w,h,index)];});

export function finishQuarterPrint(kit,root){
    const panels=placements.get(kit)||[];placements.delete(kit);
    if(!panels.length || typeof document==='undefined')return {dispose(){}};
    const {T}=kit, atlas=document.createElement('canvas'),size=2048;
    atlas.width=atlas.height=size;
    const ctx=atlas.getContext('2d'),cells=new Map();
    let sx=2,sy=2,row=0;
    function paint(cell,draw){
        const {x,y,w,h}=cell;
        ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();draw(ctx,w,h);ctx.restore();
        // Extend the first and last texels into the mip-map gutter.
        ctx.drawImage(atlas,x,y,w,1,x,y-2,w,2);ctx.drawImage(atlas,x,y+h-1,w,1,x,y+h,w,2);
        ctx.drawImage(atlas,x,y,1,h,x-2,y,2,h);ctx.drawImage(atlas,x+w-1,y,1,h,x+w,y,2,h);
    }
    const keys=new Set(panels.map(p=>p.key));
    for(const key of [...keys].sort((a,b)=>art[b][1]-art[a][1])){
        const [w,h,painter]=art[key];
        if(sx+w+2>size){sx=2;sy+=row+5;row=0;}
        if(sy+h+2>size)throw Error('Shop print sheet overflow');
        const cell={x:sx,y:sy,w,h};cells.set(key,cell);paint(cell,painter);sx+=w+5;row=Math.max(row,h);
    }
    const pos=[],index=[],uv=[];
    for(const panel of panels){
        const {x,y,z,width:w,height:h,tilt,parent,key}=panel,b=pos.length/3,cell=cells.get(key);
        parent.updateWorldMatrix(true,false);
        for(const [side,top] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
            const v=new T.Vector3(x+side*w/2,y+top*h*.5*Math.cos(tilt),z+top*h*.5*Math.sin(tilt)).applyMatrix4(parent.matrixWorld);
            pos.push(v.x,v.y,v.z);
            uv.push((cell.x+.5+(side+1)*.5*(cell.w-1))/size,1-(cell.y+.5+(1-top)*.5*(cell.h-1))/size);
        }
        index.push(b,b+1,b+2,b,b+2,b+3);
    }
    const tex=new T.CanvasTexture(atlas);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(index);geo.computeVertexNormals();
    const night=document.documentElement.dataset.theme==='ugly';
    const stock=new T.MeshLambertMaterial({map:tex,emissive:0xffffff,emissiveMap:tex,
        emissiveIntensity:night?.35:.17,side:T.FrontSide});
    const print=new T.Mesh(geo,stock);print.name='Sakuramachi shop windows and signs';
    // Already in world space; architectural batching may now discard the local frames.
    root.parent.add(print);
    let disposed=false;
    const image=new Image();
    image.onload=()=>{
        if(disposed)return;
        for(const [side,key] of ['windowL','windowR'].entries()){
            const cell=cells.get(key);if(!cell)continue;
            paint(cell,(c,w,h)=>{
                const sliceW=image.width/2,aspect=w/h;
                const sourceH=Math.min(image.height,sliceW/aspect);
                const sourceW=sourceH*aspect;
                c.drawImage(image,sliceW*side+(sliceW-sourceW)/2,(image.height-sourceH)*.47,sourceW,sourceH,0,0,w,h);
                reflection(c,w,h);
            });
        }
        tex.needsUpdate=true;
    };
    image.src=new URL('../garden/quarter/shop-interior.webp',import.meta.url).href;
    return {dispose(){disposed=true;image.onload=null;print.removeFromParent();geo.dispose();stock.dispose();tex.dispose();}};
}
