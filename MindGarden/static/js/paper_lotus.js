// A single indexed mesh for the masonry, the shaped paper blooms and the floating pads.
// Each sweep has its own vertices at cut edges. Light flows across a curved sheet and
// breaks at its folds, its printed veins, or the bevel on the next block of stone.
export function sculptLotusPool(T, palette) {
    const TAU = Math.PI * 2;
    const positions = [], colors = [], indices = [];
    const stocks = Object.fromEntries(Object.entries(palette).map(([key, value]) => [key, new T.Color(value)]));
    stocks.blossom ??= stocks.gold;
    stocks.blush=stocks.paper.clone().lerp(stocks.blossom,.31);
    const gildedFlower = [], outerMouths = [], innerMouths = [], seedMouths = [];

    function sheet(columns, rows, paint, point, reverse = false) {
        const start = positions.length / 3;
        const {r,g,b} = stocks[paint];
        for (let j = 0; j <= rows; j++) {
            for (let i = 0; i <= columns; i++) {
                const p = point(i / columns, j / rows);
                positions.push(p[0], p[1], p[2]);
                colors.push(r, g, b);
                if (j && i) {
                    const d = start + j * (columns + 1) + i;
                    const c = d - 1, b0 = d - columns - 1, a = b0 - 1;
                    if (reverse) indices.push(a, c, b0, b0, c, d);
                    else indices.push(a, b0, c, b0, d, c);
                }
            }
        }
    }
    function polar(radius, y, a, across = 0) {
        return [radius*Math.cos(a) - across*Math.sin(a), y, radius*Math.sin(a) + across*Math.cos(a)];
    }
    function band(r0,y0,r1,y1,paint,segments=64) {
        sheet(segments,1,paint,(u,v)=>polar(r0+(r1-r0)*v,y0+(y1-y0)*v,TAU*u),true);
    }

    // The plinth is turned in four profiles; the narrow dark reveals are recessed.
    band(3.19,.028,3.19,.09,'ink');
    band(3.19,.09,3.15,.13,'paper');
    band(3.15,.13,3.10,.162,'paper');
    band(3.10,.162,3.055,.19,'gold');
    band(3.055,.19,3.045,.21,'ink');
    band(3.045,.21,3.00,.245,'paper');
    band(3.00,.245,3.005,.54,'leaf');
    band(3.005,.54,3.040,.56,'gold');
    band(3.040,.56,3.053,.584,'ink');
    band(3.053,.584,3.11,.614,'paper');
    band(3.11,.614,3.16,.649,'gold');
    band(3.16,.649,3.148,.696,'paper');
    band(3.148,.696,3.12,.751,'ink');
    band(3.12,.751,2.837,.751,'leaf');
    band(2.837,.751,2.80,.705,'paper');
    band(2.80,.705,2.80,.32,'ink');
    // Shallow ceramic bowl under the water. The concentric inlay and its real
    // submerged rim remain visible through the surface at steep viewing angles.
    sheet(64,5,'sky',(u,v)=>polar(2.813*v,.318+.046*v*v,TAU*u));
    for(const r of [1.11,2.57]) {
        sheet(64,1,'leaf',(u,v)=>polar(r+.022*v,.324+.046*(r/2.813)**2,TAU*u));
    }
    for(let i=0;i<12;i++){
        const a=TAU*i/12;
        for(const sign of [-1,1]){
            sheet(1,12,'paper',(u,v)=>{
                const r=1.17+1.26*v, a0=a+sign*.088*Math.sin(v*Math.PI);
                return polar(r,.326+.046*(r/2.813)**2,a0,(u-.5)*.033*Math.sin(v*Math.PI));
            });
        }
    }

    const blocks = 20, blockArc = TAU/blocks;
    const gildedRim = [];
    for (let i=0; i<blocks; i++) {
        const a0 = blockArc*i+.004, a1=blockArc*(i+1)-.004;
        const cap=(r0,y0,r1,y1,paint)=>sheet(4,1,paint,(u,v)=>
            polar(r0+(r1-r0)*v,y0+(y1-y0)*v,a0+(a1-a0)*u),true);
        cap(3.145,.681,3.169,.709,'paper');
        cap(3.169,.709,3.165,.750,'paper');
        cap(3.165,.750,3.137,.786,'paper');
        cap(3.137,.786,3.078,.797,'paper');
        cap(3.078,.797,3.063,.797,'gold');
        cap(3.063,.797,2.868,.788,'paper');
        cap(2.868,.788,2.832,.757,'paper');
        for (const a of [a0,a1]) {
            sheet(1,1,'gold',(u,v)=>polar(2.838+u*.307,.749+v*.032,a),a===a0);
        }
        for(let j=0;j<4;j++) gildedRim.push(new T.Vector3(...polar(3.136,.79,a0+(a1-a0)*j/4)));
    }

    // The band of reeds is low relief. Each blade has a convex face and an exposed
    // return edge, so the passing sunlight describes the motif while the viewer orbits.
    for(let i=0;i<16;i++){
        const a=TAU*(i+.5)/16;
        const relief=(x,y,d)=>polar(3.012+d,y,a+x/3.012);
        function reed(x0,y0,x1,y1,width,paint) {
            const face=(s,t,lip=0)=>{
                const arch=Math.sin(Math.PI*t);
                const x=x0+(x1-x0)*t+s*width*arch;
                const y=y0+(y1-y0)*t+.035*arch;
                return relief(x,y,.014+.044*(1-s*s)*arch+lip);
            };
            sheet(4,7,paint,(u,t)=>face(2*u-1,t));
            for(const s of [-1,1]) {
                sheet(7,1,'gold',(t,depth)=>face(s,t,-depth*.015));
            }
        }
        for(const sign of [-1,1]){
            sheet(9,1,'gold',(u,v)=>relief(sign*(.03+.44*u),.31+.105*Math.sin(u*Math.PI*1.05)-.028*u+v*.016,.018));
            reed(sign*.10,.331,sign*.27,.464,.041,'paper');
            reed(sign*.24,.381,sign*.42,.434,.03,'gold');
        }
        reed(0,.303,0,.495,.059,i%2?'paper':'gold');
    }

    // Fluted stem. Ridges continue up the neck in a slight spiral instead of ending
    // at the corners of a polygonal cone.
    function turnedStem(profile, flutes, depth, paint) {
        for(let k=1;k<profile.length;k++) {
            const [r0,y0]=profile[k-1],[r1,y1]=profile[k];
            sheet(flutes*5,2,paint,(u,v)=>{
                const a=u*TAU, y=y0+(y1-y0)*v;
                return polar(r0+(r1-r0)*v+depth*(.5+.5*Math.cos(a*flutes-y*.72)),y,a);
            },true);
        }
    }
    band(.67,.319,.64,.52,'leaf',36);
    band(.64,.52,.67,.745,'ink',36);
    band(.67,.745,.62,.79,'gold',36);
    band(.62,.79,.60,.825,'paper',36);
    band(.60,.825,.52,.853,'paper',36);
    band(.52,.853,.48,.88,'gold',36);
    turnedStem([[.44,.872],[.405,.957],[.314,1.032],[.265,1.13],[.277,1.21],[.38,1.31]],12,.027,'leaf');
    band(.439,.892,.45,.92,'gold',40);
    band(.45,.92,.425,.945,'paper',40);
    band(.34,1.265,.39,1.31,'gold',40);
    turnedStem([[.38,1.31],[.49,1.405],[.53,1.48]],12,.024,'leaf');
    turnedStem([[.215,1.56],[.19,1.67],[.12,1.90],[.115,2.038],[.155,2.16],[.262,2.254]],10,.018,'leaf');
    band(.15,2.10,.177,2.142,'gold',32);

    function blossom(cx,cz, count, rotation, options) {
        const {reach,base,rise,width,paint,back,source,outline=false,sepal=false,veins=true} = options;
        for(let i=0;i<count;i++) {
            const a=rotation+i*TAU/count;
            const stagger=sepal?.045:.028;
            const length=reach*(1+stagger*Math.sin(i*2.21+.36));
            const height=rise*(1+.09*Math.cos(i*1.85+.41));
            const twist=Math.sin(i*2.59+.28)*.085;
            const thickness=Math.max(.008,reach*.020);
            // Transverse sections make a shallow cup. Its shoulders lift away from a
            // raised midrib; the apex turns down over the lip that feeds the water jet.
            function face(s,t,offset=0) {
                const arch=Math.sin(Math.PI*t);
                const breadth=width*((.044*(1-t)+.012*t)+Math.pow(Math.max(0,arch),.74)*(.70+.44*t));
                const r=length*(.11+.89*t-.104*arch*s*s);
                const profile=reach<.9 ? .23*t+.77*t*t+.11*arch : .16*t+.8*(1-Math.cos(Math.PI*t))*.5+.16*arch;
                const y=base+height*profile
                    +reach*(.156*s*s+.025*Math.exp(-s*s*18))*arch+offset;
                const p=polar(r,y,a+twist*t, s*breadth);
                return [p[0]+cx,p[1],p[2]+cz];
            }
            const underside=(s,t)=>face(s,t,-thickness*(1+.42*Math.sin(Math.PI*t)));
            function inkPoint(s,t,under=false){
                const columns=under?4:6, rows=under?8:10;
                const gx=(s+1)*.5*columns,gy=t*rows;
                const x=Math.min(columns-1,Math.floor(gx)),y=Math.min(rows-1,Math.floor(gy));
                const dx=gx-x,dy=gy-y,sample=under?underside:face;
                const corner=(i,j)=>sample(2*(x+i)/columns-1,(y+j)/rows);
                const b=corner(1,0),c=corner(0,1);
                const p=dx+dy<1?corner(0,0):corner(1,1);
                const wb=dx+dy<1?dx:1-dy,wc=dx+dy<1?dy:1-dx;
                return p.map((value,k)=>value+wb*(b[k]-value)+wc*(c[k]-value)+(k===1?(under?-.004:.004):0));
            }
            sheet(6,10,paint,(u,t)=>face(2*u-1,t));
            sheet(4,8,back,(u,t)=>underside(2*u-1,t),true);
            for(const side of [-1,1]){
                sheet(10,1,sepal?'leaf':'gold',(t,v)=>{
                    const top=face(side,t),low=underside(side,t);
                    return [top[0],top[1]+(low[1]-top[1])*v,top[2]];
                },side<0);
            }
            for(const end of [0,1]){
                sheet(4,1,'gold',(u,v)=>face(u*2-1,end,-thickness*v),end===1);
            }
            if(veins){
                for(const sign of [-1,0,1]){
                    sheet(1,9,sepal?'gold':sign?'leaf':'gold',(u,v)=>{
                        const t=.16+v*(sign?.59:.74);
                        const trace=sign*(.05+.46*Math.sin(v*Math.PI*.77));
                        const taper=(sign?.028:.050)*(.12+.88*Math.sin(Math.PI*v));
                        return inkPoint(trace+(u-.5)*2*taper,t);
                    });
                }
                sheet(1,10,sepal?'gold':'leaf',(u,v)=>inkPoint((u-.5)*.095*Math.sin(Math.PI*v),.15+.65*v,true),true);
            }
            if(source){
                const tip=face(0,.978,.012);
                const p=[tip[0]-cx,tip[1],tip[2]-cz];
                source.push({angle:Math.atan2(p[2],p[0]),r:Math.hypot(p[0],p[2]),y:p[1]});
            }
            if(outline){
                for(let j=0;j<=9;j++) gildedFlower.push(new T.Vector3(...face(-1,.57+.43*j/9,.004)));
                for(let j=1;j<=9;j++) gildedFlower.push(new T.Vector3(...face(1,1-.43*j/9,.004)));
            }
        }
    }

    blossom(0,0,8,.56,{reach:1.12,base:1.22,rise:.40,width:.26,paint:'leaf',back:'leaf',sepal:true});
    blossom(0,0,8,.16,{reach:1.33,base:1.30,rise:.62,width:.38,paint:'blush',back:'blossom',source:outerMouths,outline:true});
    blossom(0,0,7,.56,{reach:1.05,base:1.37,rise:.72,width:.30,paint:'paper',back:'blush'});
    blossom(0,0,5,.27,{reach:.67,base:1.46,rise:.61,width:.23,paint:'blossom',back:'blush'});
    blossom(0,0,6,.98,{reach:.60,base:2.18,rise:.39,width:.18,paint:'leaf',back:'leaf',sepal:true});
    blossom(0,0,6,.44,{reach:.75,base:2.23,rise:.47,width:.235,paint:'blush',back:'blossom',source:innerMouths});
    blossom(0,0,5,1.0,{reach:.46,base:2.32,rise:.51,width:.192,paint:'paper',back:'blush'});

    // Crown of the seedpod. The dark, punched mouths sit exactly at the first
    // cross section of each jet; their rolled rims can be seen through the water.
    band(.057,2.38,.11,2.60,'gold',28);
    band(.11,2.60,.20,2.729,'gold',28);
    band(.20,2.729,.215,2.767,'gold',32);
    band(.215,2.767,.19,2.791,'paper',32);
    band(.19,2.791,.001,2.811,'gold',32);
    for(let i=0;i<6;i++){
        const a=.35+i*TAU/6, r=.129;
        const [x,,z]=polar(r,0,a);
        const rim=(u,rad,y)=>[x+rad*Math.cos(TAU*u),y,z+rad*Math.sin(TAU*u)];
        sheet(12,1,'paper',(u,v)=>rim(u,.032-.012*v,2.802+.009*v));
        sheet(12,1,'ink',(u,v)=>rim(u,.020*(1-v),2.809));
        seedMouths.push({angle:a,r,y:2.815});
    }

    // Slightly dished floating leaves. Both cut lips and the primary radial veins
    // remain visible above the water when viewed across the surface.
    function floatingLeaf(x,z,size,angle,layer) {
        function leafFace(u,v,lift=0){
            const a=.15+u*(TAU-.36);
            const edge=1+.048*Math.sin(5*a+.4)+.021*Math.cos(11*a);
            const r=size*edge*v;
            const p=polar(r,.68+layer+.069*size*v*v+.016*size*v*Math.cos(6*a)+lift,a);
            const px=p[0],pz=p[2]*.83;
            return [x+px*Math.cos(angle)-pz*Math.sin(angle),p[1],z+px*Math.sin(angle)+pz*Math.cos(angle)];
        }
        sheet(40,5,'leaf',leafFace);
        sheet(40,1,'gold',(u,v)=>leafFace(u,1,-v*.016));
        for(const end of [0,1]) sheet(5,1,'gold',(v,d)=>leafFace(end,v,-d*.016));
        for(let k=1;k<12;k++){
            sheet(1,6,k%3?'paper':'gold',(s,t)=>{
                const r=.11+.75*t;
                return leafFace(k/12+(s-.5)*.006*(1-t)+.03*Math.sin(t*Math.PI),r,.006);
            });
        }
    }
    for(const leaf of [[-1.76,-.44,.46,1.3,.014],[-2.11,-.94,.33,.48,0],
        [-1.47,-1.06,.24,2.1,.014],[1.62,.95,.34,-1.0,0],[2.07,.55,.24,-2.1,.01]])floatingLeaf(...leaf);
    blossom(-1.86,-.57,7,.2,{reach:.174,base:.73,rise:.11,width:.058,paint:'paper',back:'leaf',veins:false});
    blossom(-1.86,-.57,5,.64,{reach:.106,base:.747,rise:.148,width:.046,paint:'gold',back:'paper',veins:false});

    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return {geometry,gildedRim,gildedFlower,outerMouths,innerMouths,seedMouths};
}
