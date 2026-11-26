// The cherry cottage and the little conservatory share the curved eaves and
// arched glazing of the original garden drawings. All parts flank the existing doors.
export function cottageAwnings(house,kit){
    const {T,blossom,paper,ink,leaf,mesh,rod,group}=kit;
    const blush=new T.Color(blossom).lerp(new T.Color(paper),.34).getHex();
    for(const [x,h] of [[-1.55,2.16],[1.32,2.10]]){
        const awning=group(house,x,h,1.84);
        const width=1.34,segments=7;
        for(let strip=0;strip<segments;strip++){
            const left=width*(strip/segments-.5),right=left+width/segments;
            const pos=[],index=[];
            for(let j=0;j<=8;j++){
                const t=j/8,a=t*Math.PI*.49;
                for(const xx of [left,right]){
                    const sag=.038*(1-(2*xx/width)**2);
                    pos.push(xx,.10*Math.cos(a)-.108*t-sag,.43*Math.sin(a));
                }
                if(j){const i=j*2;index.push(i-2,i,i-1,i-1,i,i+1);}
            }
            const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(index);g.computeVertexNormals();
            const paint=strip%2?paper:blush;
            mesh(awning,g,paint);
            const hem=new T.Shape(),w=width/segments;
            hem.moveTo(0,.023);hem.lineTo(w,.023);hem.lineTo(w,-.037);
            hem.bezierCurveTo(w*.86,-.126,w*.14,-.126,0,-.037);hem.closePath();
            const depth=new T.ExtrudeGeometry(hem,{depth:.024,bevelEnabled:false,curveSegments:6});
            const mid=(left+right)*.5,sag=.038*(1-(2*mid/width)**2);
            mesh(awning,depth,paint,left,-.106-sag,.422);
        }
        for(const side of [-1,1]){
            rod(awning,leaf,[side*.60,-.29,0],[side*.60,-.095,.42],.017);
            rod(awning,ink,[side*.60,-.097,.38],[side*.60,-.095,.45],.019);
        }
    }
}

export function conservatoryRoof(gallery,kit){
    const {T,blossom,paper,gold,sky,ink,mesh,group,rod,coin,cut}=kit;
    // A hipped roof with a curved lower slope. Closed rings keep its silhouette
    // continuous when seen over the balustrade or from the opposite side of the pool.
    const rings=[[-.23,4.02,1.24,3.74],[-.23,3.93,1.17,3.87],[-.23,3.72,.99,4.12],
        [-.24,3.51,.71,4.33],[-.25,3.28,.38,4.46],[-.25,3.19,.18,4.49]];
    const pos=[],idx=[];
    for(const [z,half,depth,y] of rings){
        const bevel=.21;
        for(const [a,b] of [[-half+bevel,depth],[half-bevel,depth],[half,depth-bevel],[half,-depth+bevel],
                [half-bevel,-depth],[-half+bevel,-depth],[-half,-depth+bevel],[-half,depth-bevel]])pos.push(a,y,z+b);
    }
    for(let j=0;j<rings.length-1;j++)for(let k=0;k<8;k++){
        const a=j*8+k,b=j*8+(k+1)%8;idx.push(a,b,b+8,a,b+8,a+8);
    }
    const last=(rings.length-1)*8;
    for(let i=1;i<7;i++)idx.push(last,last+i,last+i+1);
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
    mesh(gallery,geo,blossom);
    for(const x of [-2.92,-1.42,2.67]){
        const dormer=group(gallery,x,3.85,.71);
        function arched(w,h){
            const r=w*.5,s=new T.Shape();s.moveTo(-r,0);s.lineTo(r,0);s.lineTo(r,h-r);
            s.absarc(0,h-r,r,0,Math.PI,false);s.closePath();return s;
        }
        mesh(dormer,cut(arched(.68,.69),.42),paper);
        mesh(dormer,cut(arched(.47,.55),.044),gold,0,.025,.22);
        mesh(dormer,cut(arched(.38,.48),.036),sky,0,.042,.25);
        rod(dormer,paper,[0,.06,.28],[0,.48,.28],.017);
        rod(dormer,paper,[-.18,.28,.28],[.18,.28,.28],.017);
    }
    rod(gallery,gold,[-3.18,4.51,-.23],[3.18,4.51,-.23],.039);
    for(const x of [-3.18,3.18])coin(gallery,ink,x,4.51,-.23,.05,.06,.065);
}
