// Architectural parts are drawn in the local frame of the original building. The
// existing world batches them by paper stock, including the returns of each moulding.
function archMoulding(kit, parent, color, x, spring, z, border, steps=20) {
    const vertices=[], indices=[];
    for(let i=0;i<=steps;i++){
        const a=Math.PI*i/steps;
        for(const [radius,offset] of border){
            vertices.push(radius*Math.cos(a),radius*Math.sin(a),offset);
        }
        if(i===steps)continue;
        for(let j=0;j<border.length-1;j++){
            const n=i*border.length+j,m=n+border.length;
            indices.push(n,m,n+1,n+1,m,m+1);
        }
    }
    const geo=new kit.T.BufferGeometry();
    geo.setAttribute('position',new kit.T.Float32BufferAttribute(vertices,3));
    geo.setIndex(indices);geo.computeVertexNormals();
    return kit.mesh(parent,geo,color,x,spring,z);
}

function turned(kit,parent,color,x,y,z,profile,facets=16) {
    const {T,mesh}=kit;
    const points=profile.map(([r,h])=>new T.Vector2(r,h));
    return mesh(parent,new T.LatheGeometry(points,facets),color,x,y,z);
}

function lineBoard(kit,parent,paper,outline,z,depth){
    return kit.mesh(parent,kit.cut(kit.polygon(outline),depth),paper,0,0,z);
}

// Per-pane dados and a carved fanlight sit proud of the glass. The moving warm
// glass layer from the doorway interaction remains visible behind the mullions.
function fanlight(kit,parent,cx,base,z,wide,tall){
    const {paper,leaf,ink,block,rod}=kit;
    const r=wide/2, spring=base+tall-r;
    archMoulding(kit,parent,paper,cx,spring,z,[[r+.085,-.06],[r+.085,0],[r+.056,.045],[r+.024,.047],[r+.01,.018]]);
    archMoulding(kit,parent,ink,cx,spring,z+.01,[[r+.014,.008],[r-.009,.027],[r-.025,.019]]);
    for(const sign of [-1,1]){
        block(parent,paper,cx+sign*(r+.051),base+(tall-r)/2,z+.005,.068,tall-r,.095);
        block(parent,leaf,cx+sign*(r+.075),base+(tall-r)/2,z-.006,.025,tall-r,.091);
    }
    block(parent,ink,cx,spring,z+.036,wide,.04,.038);
    for(const a of [Math.PI/4,Math.PI/2,Math.PI*3/4]){
        rod(parent,paper,[cx+Math.cos(a)*r*.30,spring+Math.sin(a)*r*.30,z+.043],
            [cx+Math.cos(a)*(r-.014),spring+Math.sin(a)*(r-.014),z+.043],.014);
    }
    archMoulding(kit,parent,ink,cx,spring,z+.039,[[r*.34,0],[r*.32,.017],[r*.27,.012]],12);
}

// A folded hood throws a real shadow onto the entry. Its supporting brackets
// have an open, pierced quarter-circle between the timber and the wall.
function doorHood(kit,house){
    const {T,leaf,paper,gold,ink,mesh,cut,group,block,rod,coin}=kit;
    const porch=group(house,-.23,0,1.77);
    const roofProfile=[[-.98,2.30],[-.77,2.37],[-.45,2.51],[-.10,2.60],[.13,2.60],[.47,2.49],[.79,2.35],[.98,2.31]];
    const arch=kit.polygon([...roofProfile,...roofProfile.slice().reverse().map(([x,y])=>[x,y-.085])]);
    mesh(porch,cut(arch,.64),leaf,0,0,.29);
    const trim=kit.polygon([...roofProfile,...roofProfile.slice().reverse().map(([x,y])=>[x,y-.040])]);
    mesh(porch,cut(trim,.048),gold,0,-.041,.622);
    for(const [x,y] of roofProfile.slice(1,-1))rod(porch,paper,[x,y+.004,-.02],[x,y+.004,.605],.014);
    const bracket=new T.Shape();
    bracket.moveTo(0,0);bracket.lineTo(.48,0);bracket.lineTo(.48,-.095);
    bracket.quadraticCurveTo(.17,-.08,.115,-.38);
    bracket.lineTo(0,-.38);bracket.closePath();
    for(const side of [-1,1]){
        const b=mesh(porch,cut(bracket,.085),ink,side*.77,2.32,.005);
        b.rotation.y=-Math.PI/2;
        block(porch,paper,side*.77,2.17,.022,.13,.35,.103);
        coin(porch,gold,side*.77,2.07,.082,.038,.038,.030);
    }
    // A small hexagonal lantern hangs out from the left jamb.
    const lantern=group(porch,-.84,1.89,.33);
    rod(lantern,ink,[0,.18,0],[0,.40,0],.016);
    turned(kit,lantern,ink,0,0,0,[[0,.14],[.068,.18],[.129,.062],[.12,.035],[0,.035]],6);
    turned(kit,lantern,gold,0,0,0,[[.116,.042],[.088,-.138],[.052,-.164]],6);
    turned(kit,lantern,ink,0,0,0,[[.091,-.126],[.098,-.143],[.053,-.180],[0,-.184]],6);
    for(let i=0;i<6;i++){
        const a=i*Math.PI/3;
        rod(lantern,ink,[.118*Math.sin(a),.04,.118*Math.cos(a)],
            [.088*Math.sin(a),-.14,.088*Math.cos(a)],.008);
    }
}

export function cottageJoinery(house,kit){
    const {T,paper,ink,gold,leaf,sky,group,mesh,block,rod,coin,cut,polygon,foliage}=kit;
    const front=1.77;
    // One five-lobed folded blossom per sprig. Cut valleys between petals
    // stay visible at the scale of the window, even from an oblique angle.
    const corolla=new T.Shape();
    const polar=(rad,t)=>[rad*Math.cos(t),rad*Math.sin(t)];
    for(let i=0;i<5;i++){
        const a=i*Math.PI*2/5;
        if(!i)corolla.moveTo(...polar(.047,a-.628));
        corolla.bezierCurveTo(...polar(.118,a-.48),...polar(.128,a-.16),...polar(.095,a));
        corolla.bezierCurveTo(...polar(.138,a+.18),...polar(.103,a+.54),...polar(.047,a+.628));
    }
    corolla.closePath();
    const flower=cut(corolla,.027);
    for(const [x,y,w,h] of [[-1.55,1.03,.82,.97],[1.32,.97,.85,1.01]]){
        fanlight(kit,house,x,y+.055,1.925,w,h);
        // The box has four sloping sides and visible top soil between the flowers.
        const basin=polygon([[-.53,.10],[.53,.10],[.45,-.14],[.40,-.17],[-.42,-.17]]);
        mesh(house,cut(basin,.23),leaf,x,.942,1.98);
        block(house,ink,x,1.015,1.987,1.01,.037,.27);
        block(house,paper,x,1.047,2.104,1.10,.044,.111);
        for(const off of [-.33,.33])block(house,gold,x+off,.923,2.106,.031,.18,.028);
        for(const [j,off] of [-.39,-.22,-.03,.13,.34].entries()){
            const high=1.29+.13*Math.sin(j*1.7+x),left=x+off;
            rod(house,leaf,[left+.05,1.04,2.041],[left,high,2.066],.012);
            foliage(house,leaf,left+.025,high-.13,2.055,.17,j%2?-.92:.93,.17,.81);
            const head=mesh(house,flower,j===2?sky:paper,left,high,2.078);
            head.rotation.set(-.14*j+.22,.23*Math.sin(j),j*.83);
            head.scale.setScalar(.80+.19*Math.cos(j+1));
            coin(house,gold,left,high,2.096,.025,.027,.019);
        }
    }
    // Two footings of ashlar follow both sides of the steps. Narrow mortar
    // joints, chipped lower corners and overhanging coping make the plinth legible.
    for (const [x0,x1] of [[-2.51,-1.02],[.58,2.51]]) {
        block(house,ink,(x0+x1)/2,.271,1.811,x1-x0,.299,.066);
        for(let row=0;row<2;row++){
            let left=x0,blockNo=0;
            while(left<x1-.045){
                const right=Math.min(x1,left+.37+(row===1 && blockNo===0?-.16:.08*Math.cos(1.8*blockNo)));
                const y=.128+row*.147,chip=.032+.009*Math.sin(blockNo+row);
                lineBoard(kit,house,paper,[[left+.009,y+.012],[right-chip,y+.010],[right-.006,y+.036],
                    [right-.007,y+.126],[right-.036,y+.142],[left+.015,y+.141],[left+.004,y+.105]],1.850,.042);
                left=right;blockNo++;
            }
        }
        block(house,leaf,(x0+x1)/2,.441,1.868,x1-x0+.045,.056,.168);
    }
    const timber=group(house,0,0,front-.006);
    lineBoard(kit,timber,leaf,[[-2.39,2.27],[-1.66,2.40],[-.43,3.88],[-.49,3.98],[-1.75,2.54],[-2.39,2.39]],0,.105);
    lineBoard(kit,timber,leaf,[[.28,3.93],[.22,3.84],[1.57,2.40],[2.38,2.30],[2.38,2.39],[1.68,2.53]],0,.105);
    for(const side of [-1,1]){
        const half=group(timber,-.14,0,.014);
        half.scale.x=side;
        lineBoard(kit,half,leaf,[[.78,2.42],[1.15,2.45],[1.46,2.57],[1.26,2.66],[1.04,2.55],[.78,2.51]],0,.080);
        lineBoard(kit,half,leaf,[[.53,3.02],[.55,3.30],[.84,3.56],[.76,3.63],[.47,3.33],[.47,3.06]],0,.08);
    }
    // Flower-shaped leaded glass. Every lobe has its own foil edge and a slender
    // coloured core; the tracery masks the older frame and keeps the glazed opening.
    const wheel=group(house,-.14,3.03,1.925);
    coin(wheel,leaf,0,0,0,.464,.472,.085);
    coin(wheel,paper,0,0,.033,.425,.431,.071);
    coin(wheel,ink,0,0,.069,.377,.382,.044);
    const petal=new T.Shape();
    petal.moveTo(0,.068);petal.bezierCurveTo(-.074,.114,-.116,.245,-.020,.328);
    petal.quadraticCurveTo(.005,.355,.030,.321);petal.bezierCurveTo(.119,.226,.067,.120,0,.068);petal.closePath();
    const glass=cut(petal,.024);
    for(let i=0;i<7;i++){
        const cell=mesh(wheel,glass,i%3===0?gold:i%3===1?sky:paper,0,0,.109);
        cell.rotation.z=i*Math.PI*2/7+.08;
    }
    coin(wheel,paper,0,0,.127,.083,.083,.027);
    coin(wheel,gold,0,0,.145,.046,.046,.025);
    doorHood(kit,house);

    // A rolled ridge, stepped chimney and open rafter tails establish the roof
    // thickness in the low-angle approach and again on the return trip.
    const cap=new T.Shape();
    cap.moveTo(-.153,0);cap.absarc(0,0,.153,Math.PI,0,true);
    cap.lineTo(.110,0);cap.absarc(0,0,.110,0,Math.PI,false);cap.closePath();
    const ridge=cut(cap,.56);
    for(let i=0;i<8;i++){
        const piece=mesh(house,ridge,i%4===0?paper:kit.blossom,-.06,4.43,-1.86+i*.52);
        piece.rotation.z=-.04;
    }
    for(const sign of [-1,1]){
        for(let i=0;i<7;i++){
            const z=-1.73+i*.55;
            rod(house,ink,[sign*2.32,2.40,z],[sign*3.06,2.38,z],.044);
            rod(house,paper,[sign*2.46,2.12,z],[sign*2.87,2.39,z],.035);
        }
    }
    for(const [y,w] of [[4.08,.53],[4.19,.61],[4.43,.62]]){
        block(house,y<4.41?gold:ink,-1.51,y,-.56,w,.075,w);
    }
    for(const x of [-1.65,-1.37]){
        turned(kit,house,gold,x,4.46,-.55,[[.113,0],[.112,.055],[.092,.095],[.099,.304],[.131,.325],[.126,.374],[.073,.374],[.077,.308]],10);
    }
    // The side bay projects beyond the wall. Three sashes have independent
    // planes, outside sills and junction posts rather than a flat painted window.
    const bay=group(house,2.47,0,.10,Math.PI/2);
    const bayPlan=[[-.84,0],[-.57,.37],[.51,.37],[.82,0]];
    const shelf=(low,high,color,scale)=>{
        const v=[],idx=[];
        for(let i=0;i<bayPlan.length;i++){
            const [x,z]=bayPlan[i];v.push(x*scale,low,z*.70,x,high,z);
            if(i<bayPlan.length-1){const j=i*2;idx.push(j,j+2,j+1,j+1,j+2,j+3);}
        }
        const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setIndex(idx);geo.computeVertexNormals();mesh(bay,geo,color);
    };
    shelf(.74,.96,leaf,.84);shelf(1.96,2.14,gold,.84);
    for(let i=0;i<bayPlan.length-1;i++){
        const [x,z]=bayPlan[i],[x2,z2]=bayPlan[i+1];
        const width=Math.hypot(x2-x,z2-z), face=group(bay,(x+x2)/2,0,(z+z2)/2,-Math.atan2(z2-z,x2-x));
        block(face,ink,0,1.47,0,width,.99,.074);
        block(face,sky,0,1.47,.045,width-.094,.86,.028);
        for(const y of [1.02,1.72,1.98])block(face,paper,0,y,.078,width+.036,.054,.093);
        rod(face,paper,[-width*.43,1.81,.071],[0,1.91,.071],.014);
        rod(face,paper,[0,1.91,.071],[width*.43,1.81,.071],.014);
        if(i===1)block(face,leaf,0,1.46,.071,.042,.86,.054);
    }
}

export function galleryStonework(gallery,kit){
    const {T,paper,ink,gold,leaf,sky,mesh,group,block,rod,cut,polygon,coin}=kit;
    const bayWidth=1.53,spring=1.85;
    // Reeded shafts are single solids; flute channels run continuously through
    // the entasis and terminate below the capital.
    const levels=[[0,.150],[.07,.160],[.32,.168],[.86,.149],[1.00,.136]];
    const shaft=new T.BufferGeometry(),v=[],idx=[],slices=48;
    for(let ring=0;ring<levels.length;ring++){
        const [h,r]=levels[ring];
        for(let j=0;j<slices;j++){
            const a=2*Math.PI*j/slices,flute=.87+.13*Math.cos(a*4)**2;
            v.push(Math.cos(a)*r*flute,h,Math.sin(a)*r*flute);
            if(ring+1<levels.length){
                const p=ring*slices+j,q=ring*slices+(j+1)%slices;
                idx.push(p,p+slices,q,q,p+slices,q+slices);
            }
        }
    }
    shaft.setAttribute('position',new T.Float32BufferAttribute(v,3));shaft.setIndex(idx);shaft.computeVertexNormals();
    // Each column has an actual stepped base, necking, rolled capital and abacus.
    for(const x of [-3.825,-2.295,-.765,.765,2.295,3.825]){
        const column=group(gallery,x,0,1.39);
        block(column,paper,0,.565,0,.425,.122,.396);
        turned(kit,column,paper,0,.620,0,[[.199,0],[.205,.034],[.166,.061],[.174,.093],[.151,.120]],20);
        mesh(column,shaft,paper,0,.739,0);
        turned(kit,column,paper,0,1.735,0,[[.141,0],[.16,.028],[.142,.052],[.168,.081],[.190,.121],[.209,.138]],20);
        block(column,gold,0,1.889,0,.432,.045,.391);
        block(column,paper,0,1.931,0,.466,.046,.43);
        // Spiral ribbon on each projecting scroll. The turned ends can also
        // be seen against the arcade from the side.
        for(const side of [-1,1]){
            coin(column,paper,side*.144,1.837,.191,.078,.075,.103);
            const trace=[],inside=[];
            for(let j=0;j<=18;j++){
                const t=j/18,a=t*Math.PI*2.3+.83,r=.055-.048*t;
                trace.push([side*(.144+Math.cos(a)*r),1.837+Math.sin(a)*r]);
                inside.push([side*(.144+Math.cos(a)*(r-.008)),1.837+Math.sin(a)*(r-.008)]);
            }
            lineBoard(kit,column,gold,[...trace,...inside.reverse()],.247,.010);
        }
    }
    const vaultRadius=.556;
    const vault=new T.BufferGeometry(),sv=[],si=[];
    for(let j=0;j<=16;j++){
        const a=Math.PI*j/16,x=Math.cos(a)*vaultRadius,y=spring+Math.sin(a)*vaultRadius;
        sv.push(x,y,-.895,x,y,1.13);
        if(j<16){const i=j*2;si.push(i,i+1,i+2,i+1,i+3,i+2);}
    }
    vault.setAttribute('position',new T.Float32BufferAttribute(sv,3));vault.setIndex(si);vault.computeVertexNormals();
    for(let bay=0;bay<5;bay++){
        const x=(bay-2)*bayWidth;
        mesh(gallery,vault,paper,x,0,0);
        for(const z of [-.72,.18,1.38]){
            archMoulding(kit,gallery,z>1?paper:leaf,x,spring,z,
                [[.539,-.045],[.533,-.014],[.544,.018],[.568,.025],[.581,.040],[.599,.022],[.601,-.025]]);
        }
        archMoulding(kit,gallery,leaf,x,spring,1.355,[[.689,-.015],[.686,.014],[.706,.026],[.726,.010],[.736,-.015]]);
        // Overlapping central keystone shades the archivolt above the crown.
        mesh(gallery,cut(polygon([[-.084,0],[.082,0],[.128,.195],[.138,.235],[-.128,.235],[-.119,.193]]),.102),gold,x,spring+.548,1.416);
        mesh(gallery,cut(polygon([[-.040,.035],[.034,.035],[.058,.178],[-.061,.178]]),.023),paper,x,spring+.548,1.479);
        if(bay===2)continue;
        const lantern=group(gallery,x,2.35,.03);
        rod(lantern,ink,[0,0,0],[0,-.22,0],.0105);
        turned(kit,lantern,gold,0,-.23,0,[[.013,0],[.081,.012],[.096,-.037],[.065,-.141],[.022,-.172],[.008,-.176]],7);
    }
    // End bays return through a second opening onto the garden, closing the
    // barrel spring line on both sides and admitting daylight behind the exhibits.
    for(const side of [-1,1]){
        const end=group(gallery,side*4.01,.474,.07,side*Math.PI/2);
        const wall=polygon([[-1.09,0],[1.09,0],[1.09,2.59],[-1.09,2.59]]);
        const r=.59,opening=new T.Path();
        opening.moveTo(-r,.018);opening.lineTo(r,.018);opening.lineTo(r,1.24);
        opening.absarc(0,1.24,r,0,Math.PI,false);opening.closePath();wall.holes.push(opening);
        mesh(end,cut(wall,.18),paper);
        archMoulding(kit,end,paper,0,1.24,.122,[[.58,-.060],[.572,.021],[.590,.062],[.652,.057],[.670,.027]]);
        block(end,leaf,0,2.476,.113,2.21,.091,.12);
    }
    block(gallery,paper,0,.67,-.846,7.94,.132,.074);
    for(let j=0;j<6;j++){
        const x=(j-2.5)*bayWidth;
        block(gallery,paper,x,1.61,-.872,.094,1.87,.116);
        block(gallery,gold,x,2.53,-.857,.19,.092,.163);
    }
    // Shallow diamond-set spandrels and a carved foliate frieze read from the
    // steps while leaving the void of each arcade free.
    for(const [i,x] of [-3.825,-2.295,-.765,.765,2.295,3.825].entries()){
        const tile=group(gallery,x,2.64,1.329);
        const medallion=cut(polygon([[0,.188],[.165,0],[0,-.194],[-.165,0]]),.061);
        mesh(tile,medallion,leaf);
        const inner=mesh(tile,medallion,paper,0,0,.032);inner.scale.set(.77,.77,.67);
        const mark=new T.Shape();mark.moveTo(0,-.076);mark.quadraticCurveTo(-.092,.021,-.010,.106);
        mark.quadraticCurveTo(.074,.034,0,-.076);mark.closePath();
        const bud=mesh(tile,cut(mark,.022),gold,0,0,.070);bud.rotation.z=(i%2?1:-1)*.25;
    }
    block(gallery,paper,0,3.284,1.460,8.54,.044,.085);
    block(gallery,ink,0,3.49,1.456,8.49,.032,.068);
    const scroll=new T.Shape();
    scroll.moveTo(-.4,-.035);scroll.bezierCurveTo(-.19,.067,-.11,.066,.002,-.006);
    scroll.bezierCurveTo(.118,-.084,.228,-.047,.390,.037);
    scroll.bezierCurveTo(.209,-.017,.139,-.044,.034,.025);
    scroll.bezierCurveTo(-.103,.112,-.221,.073,-.4,-.035);scroll.closePath();
    const wave=cut(scroll,.023);
    for(let j=0;j<11;j++){
        const x=(j-5)*.746;
        mesh(gallery,wave,paper,x,3.388,1.449);
        const leafCut=mesh(gallery,cut(polygon([[0,-.046],[.031,0],[0,.052],[-.038,0]]),.027),leaf,x+.27,3.395,1.454);
        leafCut.rotation.z=-.28;
    }
    // A pierced parapet changes the outline against the sky. Each return wing
    // stops clear of the clock pavilion and is capped on both faces.
    for(const [left,right] of [[-3.83,-.40],[1.76,3.83]]){
        const cx=(left+right)/2,w=right-left;
        block(gallery,leaf,cx,3.755,.91,w,.065,.216);
        block(gallery,paper,cx,4.025,.91,w+.07,.075,.232);
        const count=Math.round(w/.35);
        for(let i=0;i<count;i++){
            const x=left+(i+.5)*w/count;
            turned(kit,gallery,paper,x,3.78,.91,[[.070,0],[.065,.035],[.035,.075],[.041,.108],[.064,.155],[.053,.185],[.045,.220]],10);
        }
    }
    // Minute ring, minute pearls and corner brackets surround the existing moving
    // hands. Their foremost surface sits behind the pivot and the second needle.
    const clock=group(gallery,.68,4.28,.24);
    for(let j=0;j<2;j++){
        const radius=j===0?.671:.605,bead=j===0?.031:.018;
        const ring=mesh(clock,new T.TorusGeometry(radius,bead,6,54),j===0?gold:ink,0,0,.845);
        ring.rotation.z=.024;
    }
    for(let i=0;i<60;i++){
        if(i%5===0)continue;
        const a=i*Math.PI/30;
        const tick=block(clock,leaf,.530*Math.sin(a),.530*Math.cos(a),.892,.011,.027,.015);
        tick.rotation.z=-a;
    }
    for(const side of [-1,1]){
        for(const y of [-.59,.55]){
            const angle=side*(y>0?-.75:-2.39);
            const corner=group(clock,side*.693,y,.786);
            const pin=mesh(corner,cut(polygon([[-.026,-.094],[.052,-.042],[.042,.038],[0,.133],[-.035,.045]]),.034),gold);
            pin.rotation.z=angle;
        }
    }
    // Raised threshold with a narrow intaglio edge. It remains behind the easel.
    block(gallery,leaf,0,.377,1.451,8.58,.104,.27);
    block(gallery,paper,0,.432,1.476,8.59,.053,.294);
    for(let i=0;i<17;i++){
        const x=-3.97+i*.49;
        const tile=block(gallery,leaf,x,.483,.81,.195,.011,.195);
        tile.rotation.y=Math.PI/4;
    }
}
