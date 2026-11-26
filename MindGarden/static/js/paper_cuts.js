import { broadleafTrees } from './paper_canopy.js';
import { cottageJoinery, galleryStonework } from './paper_architecture.js';

// The cuts are built in each landmark's own frame, with the same five stocks as the garden.
// Faces, score lines and the return edge remain visible when the camera goes round the objects.
export const woodlandSpecies = broadleafTrees;

export function dressCottage(house, kit) {
    const {T,paper,ink,gold,leaf,sky,blossom:cherry,group,mesh,block,rod,foliage,coin,polygon,cut}=kit;
    const tilePaint=[cherry,new T.Color(cherry).lerp(new T.Color(paper),.15).getHex(),
        new T.Color(cherry).lerp(new T.Color(ink),.19).getHex()];

    // Individually lapped courses follow the two slopes, with a rounded leading edge.
    const tile = new T.Shape();
    tile.moveTo(-.14,0); tile.lineTo(.15,0); tile.lineTo(.15,.23);
    tile.quadraticCurveTo(.12,.34,.035,.34); tile.quadraticCurveTo(-.10,.34,-.14,.28); tile.closePath();
    const tileShape = cut(tile,.032);
    for (const side of [-1,1]) {
        const ridge = side<0 ? -.54 : .45, shoulder = side<0 ? -1.92 : 1.98;
        const high = side<0 ? 4.43 : 4.37, low = side<0 ? 2.77 : 2.80;
        const length = Math.hypot(shoulder-ridge, low-high);
        const down = new T.Vector3((shoulder-ridge)/length,(low-high)/length,0);
        const across = new T.Vector3(0,0,side);
        const normal = across.clone().cross(down).normalize();
        const orientation = new T.Matrix4().makeBasis(across,down,normal);
        for(let row=0;row<4;row++) {
            const s=(row+.10)/4;
            for(let i=0;i<11;i++) {
                const z=-1.66 + .328*i + (row%2)*.13;
                const lift=.033 + (4-row)*.014;
                const t=mesh(house,tileShape,tilePaint[(i+row*2+(side+1))%3],
                    ridge+(shoulder-ridge)*s+normal.x*lift,high+(low-high)*s+normal.y*lift,z);
                t.quaternion.setFromRotationMatrix(orientation); t.scale.set(1.06,1.91,1);
            }
        }
    }
    // A cut-board fascia, with a row of hanging teardrop profiles along each eave.
    const drip = cut(polygon([[-.10,.03],[.10,.03],[.08,-.08],[.02,-.16],[-.03,-.15],[-.09,-.07]]),.08);
    for (const side of [-1,1]) {
        const pts=side<0?[[-3.10,2.44],[-1.93,2.72],[-.54,4.37]]:[[.45,4.32],[1.97,2.72],[3.10,2.47]];
        for(let i=1;i<pts.length;i++){
            const a=pts[i-1],b=pts[i];
            rod(house,paper,[...a,2.14],[...b,2.14],.060);
            const n=Math.round(Math.hypot(a[0]-b[0],a[1]-b[1])/.235);
            for(let j=0;j<n;j++){
                const f=(j+.5)/n;
                mesh(house,drip,paper,a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,2.13);
            }
        }
    }
    // Two shutters each have a hinge, inset slats, and a little ceramic window box.
    for(const wx of [-1.55,1.32]) {
        for(const side of [-1,1]) {
            const g=group(house,wx+.48*side,1.04,1.87,side*.41);
            block(g,leaf,side*.14,.37,0,.275,.70,.08);
            for(let i=0;i<4;i++)block(g,paper,side*.14,.13+i*.14,.047,.187,.024,.025);
            rod(g,ink,[side*.035,.08,.058],[side*.035,.66,.058],.012);
        }
    }
    const sprig=group(house,-2.27,.37,1.97);
    const knots=[[0,0],[-.08,.54],[.12,1.18],[-.07,1.81],[.17,2.29],[.69,2.60],[1.02,2.65]];
    for(let i=1;i<knots.length;i++){
        const a=knots[i-1], b=knots[i];
        rod(sprig,ink,[...a,.02],[...b,.035],.027);
        const sign=i%2?1:-1, x=a[0]+sign*.16, y=(a[1]+b[1])*.5;
        rod(sprig,leaf,[a[0],a[1],.03],[x,y,.07],.019);
        foliage(sprig,leaf,x,y,.07,.31,-sign*1.07,-.20,1.32);
        if (i>2) blossom(sprig,x,y,.11,.115,i);
    }
    function blossom(parent,x,y,z,r,seed) {
        for(let i=0;i<5;i++){
            const a=i*Math.PI*2/5+seed;
            coin(parent,paper,x+Math.sin(a)*r*.64,y+Math.cos(a)*r*.64,z,r*.53,r*.61,.036);
        }
        coin(parent,gold,x,y,z+.03,r*.27,r*.27,.044);
    }
    // A cherry-shaped hanging trade sign, supported by a crooked timber bracket.
    const sign=group(house,2.17,2.37,1.97,-.20);
    rod(sign,ink,[0,.12,-.03],[.84,.12,.27],.041);
    rod(sign,ink,[0,-.25,-.03],[.52,.12,.16],.032);
    rod(sign,gold,[.61,.12,.19],[.61,-.16,.19],.018);
    rod(sign,ink,[.61,-.16,.19],[.44,-.41,.19],.026);
    rod(sign,ink,[.61,-.16,.19],[.76,-.46,.19],.026);
    // The two fruit are hollow turned forms with a dimple at each stem.
    const fruit=new T.LatheGeometry([[.004,.118],[.042,.132],[.094,.122],[.137,.073],[.148,.002],
        [.134,-.068],[.091,-.123],[.036,-.144],[.002,-.135]].map(([r,y])=>new T.Vector2(r,y)),18);
    for(const [x,y,size] of [[.42,-.46,1],[.76,-.51,1.08]]){
        const berry=mesh(sign,fruit,cherry,x,y,.19);berry.scale.setScalar(size*1.24);
        coin(sign,paper,x-.055,y+.062,.302,.023,.038,.018);
    }
    foliage(sign,leaf,.59,-.14,.20,.23,-1.12,0,1.4);
    // Lining in the glazed attic window and gently irregular ridge flashing.
    coin(house,paper,-.25,3.16,1.87,.043,.048,.025);
    block(house,sky,.02,3.12,1.87,.058,.027,.015);
    cottageJoinery(house,kit);
}

export { dressTree } from './paper_woodland.js';

export function dressGallery(g,kit) {
    const {ink,gold,leaf,paper,mesh,block,rod,coin,cut,polygon} = kit;
    // Individual hand-cut voussoirs follow the curve above every open arch.
    for(let bay=0;bay<5;bay++){
        const cx=(bay-2)*1.53, cy=1.85;
        for(let i=0;i<9;i++){
            const a=Math.PI*i/9+.014,b=Math.PI*(i+1)/9-.014;
            const r=.563, outer=i===4?.746:.685;
            const at=(t,r)=>[Math.cos(t)*r,Math.sin(t)*r];
            const shape=polygon([at(a,r),at(b,r),at(b,outer),at((a+b)/2,outer+.007),at(a,outer)]);
            mesh(g,cut(shape,.085),i===4?gold:paper,cx,cy,1.325);
        }
        // Relief-set landscape panels glimpsed through the dark arcade.
        if(bay===2)continue;
        block(g,ink,cx,1.38,-.85,.91,1.00,.07);
        block(g,gold,cx,1.38,-.79,.81,.90,.06);
        block(g,paper,cx,1.38,-.745,.68,.74,.04);
        const d=bay%2===0?1:-1;
        const landscape=cut(polygon([[-.32,-.34],[.32,-.34],[.32,.02],[.18,.14],[.02,.025],[-.14,.18],[-.32,.04]]),.025);
        mesh(g,landscape,leaf,cx,1.37,-.708).scale.x=d;
        coin(g,gold,cx+d*.16,1.61,-.693,.072,.072,.028);
    }
    // Cornice built with separate shadows and a repeating row of tipped paper brackets.
    block(g,leaf,0,2.99,1.32,8.15,.095,.135);
    for(let i=0;i<27;i++){
        const x=-3.95+.305*i;
        const bracket=block(g,paper,x,3.04,1.38,.092,.16,.15);
        bracket.rotation.x=.22;
    }
    // Two folded finials give the long roof a legible end profile.
    for(const x of [-3.73,3.73]){
        block(g,paper,x,3.81,.91,.35,.23,.37);
        coin(g,gold,x,4.02,.91,.124,.16,.17);
        rod(g,ink,[x,4.12,.91],[x,4.39,.91],.020);
        const flag=cut(polygon([[0,.17],[.13,.10],[.32,.125],[.24,0],[.10,-.028],[0,.016]]),.045);
        mesh(g,flag,leaf,x,4.21,.91);
    }
    galleryStonework(g,kit);
}
