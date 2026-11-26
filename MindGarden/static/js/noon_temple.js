import {templeWorkshop, gardenRoofs, courtPaint as p} from './noon_temple_craft.js';
import {plantTempleGarden, templeAtmosphere} from './noon_temple_landscape.js';
import {dressWaterside} from './noon_temple_waterside.js';

// A walkable lakeside court. The three front bays line up with the shared
// visit props in paper_visits.js. The freestanding hall is across the water.
export function buildNoonTemple(T,scene,palette){
    const root=new T.Group();root.name='云汀水院';root.userData.ownPaperFinish=true;scene.add(root);
    const k=templeWorkshop(T,root),{node,box,pillar,rod,mesh,tone,random}=k;
    const {roof,beam,post,lattice,plaque}=gardenRoofs(k),plants=plantTempleGarden(k),{tree,grass,boulder}=plants;
    const screen=k.finish(k.asset('../garden/noon/crane-screen.webp'));screen.name='松鹤缂丝屏';

    function platform(g,x,z,w,d,top=.06){
        box(g,x,(top-1.24)/2,z,w,top+1.24,d,p.shade);
        box(g,x,top-.19,z,w+.11,.18,d+.12,p.stone);
        box(g,x,top-.055,z,w+.20,.11,d+.20,p.pale);
    }
    function panel(g,x,y,z,w,h){
        box(g,x,y,z,w+.16,h+.17,.11,p.wood);
        box(g,x,y,z+.065,w+.058,h+.064,.024,p.gold);
        k.surface(g,x,y,z+.084,w,h,screen);
    }
    function stonePost(g,x,z,y=0,h=.86){
        box(g,x,y+.08,z,.32,.16,.32,p.shade);box(g,x,y+.19,z,.29,.10,.29,p.pale);
        box(g,x,y+h*.53,z,.17,h*.67,.17,p.stone);
        box(g,x,y+h-.115,z,.25,.12,.25,p.pale);
        pillar(g,x,z,y+h-.07,y+h+.068,.18,p.stone,.055,8);
    }
    function balustrade(g,a,b,y=0){
        const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
        const t=node(g,(a[0]+b[0])/2,y,(a[1]+b[1])/2,Math.atan2(dx,dz));
        for(const [height,width] of [[.33,.086],[.66,.100]])box(t,0,height,0,width,.084,length,p.stone);
        const spans=Math.max(1,Math.round(length/2.15));
        for(let i=0;i<=spans;i++)stonePost(t,0,length*(i/spans-.5));
        for(let i=0;i<spans;i++)box(t,0,.50,length*((i+.5)/spans-.5),.09,.29,.115,p.pale);
    }
    function causeway(ax,az,bx,bz,width,y=.01,rail=false){
        const len=Math.hypot(bx-ax,bz-az),g=node(root,(ax+bx)/2,y,(az+bz)/2,Math.atan2(bx-ax,bz-az));
        const spans=Math.ceil(len/1.28),lanes=Math.max(2,Math.round(width/1.16)),step=len/spans;
        box(g,0,-.35,0,width,.62,len,p.shade);
        for(let j=0;j<spans;j++)for(let i=0;i<lanes;i++){
            const sz=width/lanes;
            box(g,(i+.50)*sz-width/2,-.035,(j+.5)*step-len/2,sz-.016,.095,step-.020,
                tone(0xb7bab3,0xdad6c9,random()*.82));
        }
        if(rail)for(const s of [-1,1]){
            box(g,s*(width/2-.065),.012,0,.15,.065,len,p.pale);
            balustrade(g,[s*width/2,-len/2],[s*width/2,len/2],.055);
        }
    }
    function lantern(g,x,y,z,s=1){
        const l=node(g,x,y,z);l.scale.setScalar(s);
        pillar(l,0,0,0,.15,.37,p.shade,.32,8);
        pillar(l,0,0,.12,.31,.31,p.stone,.21,8);
        pillar(l,0,0,.28,1.02,.17,p.stone,.15,8);
        pillar(l,0,0,.98,1.15,.18,p.pale,.37,8);
        pillar(l,0,0,1.15,1.22,.36,p.shade,.33,8);
        const lamp=pillar(l,0,0,1.20,1.56,.26,0xf0d39a,.26,4);lamp.rotation.y=Math.PI/4;
        for(const sx of [-1,1])for(const sz of [-1,1])box(l,sx*.204,1.39,sz*.204,.044,.34,.044,p.deep);
        pillar(l,0,0,1.56,1.65,.43,p.deep,.35,8);
        pillar(l,0,0,1.65,1.83,.37,p.tile,.085,8);pillar(l,0,0,1.80,1.93,.075,p.gold,.022,8);
    }
    function hangingLamp(g,x,z,y){
        const l=node(g,x,y,z);const radius=.20;
        pillar(l,0,0,-.32,0,.014,p.wood);
        pillar(l,0,0,-.38,-.30,.13,p.warm,.17,10);
        pillar(l,0,0,-.66,-.38,radius,0xe7b778,radius,10);
        for(let i=0;i<8;i++){
            const a=i*Math.PI/4;
            rod(l,[Math.cos(a)*radius,-.65,Math.sin(a)*radius],[Math.cos(a)*radius,-.38,Math.sin(a)*radius],.012,p.warm);
        }
        pillar(l,0,0,-.71,-.65,.14,p.wood,.19);
        pillar(l,0,0,-.90,-.71,.014,p.warm);
    }
    function sideShop(){
        const g=node(root,-9.9,0,-4.7,.34);
        platform(g,0,-.24,6.1,4.78,.034);
        box(g,0,1.19,-.55,5.0,2.4,2.48,p.ivory);
        box(g,-.22,1.02,.89,1.49,2.04,.43,p.darkWood);
        for(const x of [-2.37,-1.06,.64,2.36])post(g,x,1.46,.036,2.89,.134);
        for(const x of [-2.28,2.28])post(g,x,-1.32,.036,2.89,.134);
        beam(g,0,2.76,1.49,5.32);
        lattice(g,-1.71,1.47,.74,1.03,1.42,0);
        panel(g,1.49,1.55,.736,1.27,.82);
        box(g,1.48,.69,1.22,1.47,.13,.59,p.wood);
        for(const x of [1.0,2.0])box(g,x,.34,1.23,.10,.66,.41,p.darkWood);
        pillar(g,1.50,1.25,.75,.85,.13,p.blue,.15);pillar(g,1.50,1.25,.85,.94,.15,p.blue,.077);
        rod(g,[1.60,.84,1.27],[1.74,.90,1.26],.05,p.blue,.021);
        for(const x of [1.10,1.91])pillar(g,x,1.28,.75,.82,.051,p.ivory,.078);
        plaque(g,-.15,2.53,1.68,1.50,.38,'听水茶室');
        hangingLamp(g,-1.79,1.60,2.66);hangingLamp(g,1.71,1.60,2.66);
        roof(g,3.25,2.42,2.91,1.46,1.67);
        lantern(g,-2.58,0,2.25,.70);
    }
    function gallery(){
        const g=node(root,8,0,-12.7,-.23);
        platform(g,0,-.30,7.38,5.8,.02);
        box(g,0,2.18,-.44,6.10,4.32,2.34,p.ivory);
        box(g,0,.40,.742,6.16,.75,.095,p.wood);
        for(const x of [-3.04,-1.53,.02,1.57,3.04])box(g,x,2.20,.77,.13,4.08,.21,p.darkWood);
        panel(g,-1.87,2.01,.80,1.58,1.17);
        panel(g,1.80,2.01,.80,1.55,1.17);
        lattice(g,-.07,2.43,.805,.90,1.54,1);
        for(const x of [-3.15,3.15])for(const z of [-1.63,1.48])post(g,x,z,.055,4.61,.19);
        beam(g,0,4.63,.73,6.51);beam(g,0,3.62,.76,6.08);
        plaque(g,-1.03,4.15,.85,1.48,.41,'听澜画廊');
        hangingLamp(g,-2.64,1.45,4.43);hangingLamp(g,2.64,1.45,4.43);
        roof(g,4.04,2.65,4.81,1.74,2.09);
        balustrade(g,[-3.41,-2.50],[-3.41,.64]);
    }
    function hall(){
        const g=node(root,-.63,0,-28.7,-.045);g.scale.setScalar(1.22);
        platform(g,0,-.10,16.1,9.7,1.16);platform(g,0,-.34,13.6,7.60,1.60);
        for(let i=0;i<8;i++)box(g,0,.13+i*.111,5.90-i*.31,5.34,.24+i*.222,.38,p.pale);
        box(g,0,3.60,-.67,10.72,4.0,4.1,p.ivory);
        for(let i=-2;i<=2;i++){
            const x=i*2.10;
            lattice(g,x,3.62,1.42,1.55,2.51,i===0?0:2);
            if(i!==2)box(g,x+1.05,3.62,1.45,.18,4.04,.21,p.wood);
        }
        for(const z of [-2.65,2.51])for(const x of [-5.79,-3.54,-1.23,1.23,3.54,5.79])post(g,x,z,1.60,3.94,.215);
        beam(g,0,5.40,2.51,12.24);
        for(const x of [-4.59,-2.39,2.39,4.59])hangingLamp(g,x,2.56,5.30);
        plaque(g,0,4.94,2.66,2.13,.56,'云汀水院');
        roof(g,7.12,4.31,5.64,1.86,3.70,true);
        box(g,0,6.99,-.10,8.76,1.39,3.52,p.warm);
        for(const x of [-3.84,-2.55,-1.27,0,1.27,2.55,3.84])lattice(g,x,7.13,1.68,1.04,.65,2);
        roof(g,5.64,3.06,7.47,2.12,3.04,true);
        for(const s of [-1,1]){
            balustrade(g,[s*2.91,4.58],[s*7.88,4.58],1.16);
            balustrade(g,[s*7.88,4.58],[s*7.88,-4.32],1.16);
            lantern(g,s*3.15,1.16,4.86,.88);
        }
    }
    function distantPavilion(x,z,scale,angle=0,tower=false){
        const g=node(root,x,0,z,angle);g.scale.setScalar(scale);
        platform(g,0,0,6.77,5.39,.77);
        for(const sx of [-1,1])for(const sz of [-1,1])post(g,sx*2.12,sz*1.60,.77,2.93,.17);
        beam(g,0,3.47,1.64,4.69);roof(g,3.13,2.63,3.64,1.82,tower?.30:1.41);
        if(tower){
            box(g,0,2.07,-.18,3.82,2.62,2.91,p.ivory);
            for(const div of [-1,0,1])lattice(g,div*1.16,2.19,1.31,.79,1.54,div===0?0:2);
            box(g,0,1.01,1.29,3.85,.48,.12,p.stone);
            plaque(g,0,3.08,1.43,1.05,.27,'栖云');
            let h=4.84;
            for(let i=0;i<3;i++){
                const s=1-i*.186;
                box(g,0,h+.53,0,3.22*s,1.25*s,2.86*s,p.ivory);
                for(const side of [-1,1])lattice(g,side*.79*s,h+.53,1.44*s,.71*s,.66*s,2);
                roof(g,2.48*s,2.17*s,h+1.14*s,1.12*s,.09*s);h+=1.67*s;
            }
            pillar(g,0,0,h-.07,h+1.33,.083,p.gold,.022,8);
        }
    }
    function moonBridge(){
        const g=node(root,9.25,0,-21.9,-.12);
        const L=4.68,peak=x=>.58+1.07*(1-(x/L)**2);
        // Masonry arch has a true opening visible in both the lake and its reflection.
        const shape=new T.Shape();shape.moveTo(-L,-.78);shape.lineTo(-L,peak(-L));
        for(let i=0;i<=28;i++){const x=-L+2*L*i/28;shape.lineTo(x,peak(x));}
        shape.lineTo(L,-.78);shape.lineTo(3.61,-.78);
        for(let i=0;i<=30;i++){const a=i*Math.PI/30;shape.lineTo(3.61*Math.cos(a),-.76+1.91*Math.sin(a));}
        shape.lineTo(-L,-.78);
        mesh(g,new T.ExtrudeGeometry(shape,{depth:1.57,bevelEnabled:false,curveSegments:16}),p.stone,0,0,-.78);
        for(const sz of [-1,1]){
            const pts=[];
            for(let i=0;i<=30;i++){
                const a=i*Math.PI/30;pts.push([3.65*Math.cos(a),-.76+1.96*Math.sin(a),sz*.82]);
            }
            k.curve(g,pts,.089,p.pale,7);
            for(let i=0;i<=8;i++){
                const x=-L+2*L*i/8;stonePost(g,x,sz*.80,peak(x),.63);
                if(i>0){const prev=x-2*L/8;
                    rod(g,[prev,peak(prev)+.47,sz*.80],[x,peak(x)+.47,sz*.80],.059,p.pale);}
            }
        }
    }
    // Water surrounds both sides of the approach. The winding inner galleries
    // are kept free of parapets where the animated camera changes direction.
    causeway(-1.85,24,-1.85,11.9,4.05,0,true);
    causeway(-1.85,12.15,-.73,3.2,4.05,.022);
    causeway(-1.85,12.06,-5.15,5.1,2.8,.045);
    causeway(-5.10,5.64,-5.42,-9.23,3.1,.068);
    causeway(-5.2,-.8,-9.30,-3.3,2.65,.080);
    causeway(-5.42,-8.75,-6.36,-12.5,3.28,.079);
    causeway(-.10,5.12,5.14,2.9,2.60,.052);
    causeway(5.04,3.6,6.72,-10.83,3,.068);
    causeway(-5.30,-7.56,6.57,-7.80,2.25,.079);
    causeway(-.16,-7.76,-.23,-23.26,2.64,.089);
    pillar(root,0,0,-1.02,-.13,5.04,p.shade,5.04,66);
    pillar(root,0,0,-.15,.028,5.06,p.pale,5.06,66);
    pillar(root,0,0,.026,.042,4.88,p.stone,4.88,66);
    sideShop();gallery();hall();moonBridge();
    distantPavilion(-17.3,-24.6,1.08,.12);distantPavilion(25.6,-31.8,1.38,-.22,true);
    distantPavilion(-24.0,-34.8,.72,.27);
    platform(root,-6.60,-13.1,4.92,4.39,.045);
    tree(-6.4,-13,1.38,0,true,false,.065);
    for(const [x,z,size,az,blossom] of [[-16,-7,1.52,.4,false],[-12,-17,1.18,2.4,true],[12.6,-15.7,1.37,2.2,false],
        [15.6,-23.4,1.54,.9,true],[-12.4,-25.4,1.57,.3,false],[-19,-26.9,1.71,.5,false],
        [10.95,-30,.94,1.2,true],[22.0,-34.2,1.73,.4,false]]){
        for(let j=0;j<8;j++){
            const a=j*2.40,r=.8+random()*1.7;boulder(root,x+Math.cos(a)*r,-.50,z+Math.sin(a)*r,1.28+random(),.66+random()*.32,1.0+random()*.7,tone(p.shade,p.stone,random()*.8));
        }
        tree(x,z,size,az,false,blossom);
    }
    for(const [x,z] of [[-8.37,-13.32],[-7.82,-14.32],[-4.86,-14.3],[-7.9,-12.23],[13,-15.8],[-14.42,-6.8],[-12.52,-15.48],[12.33,-29.70]]){
        grass(x,z,.52,true);
        boulder(root,x+.36,-.24,z-.18,.69,.49,.49,p.shade);
    }
    for(const [x,z,s] of [[-3.98,12.15,.87],[.28,12.15,.87],[4.76,-7.31,.73],[-4.44,-8.52,.71]]){
        lantern(root,x,.045,z,s);
    }
    const lakeside=dressWaterside(k,plants);
    k.bake();
    const air=templeAtmosphere(T,scene,root);lakeside.attach(scene);
    return {update(time,reduced,point,ray){
        air.update(time,reduced,point);lakeside.update(time,reduced);plants.update(time,reduced,ray);
    },dispose(){lakeside.dispose();air.dispose();root.removeFromParent();k.dispose();}};
}
