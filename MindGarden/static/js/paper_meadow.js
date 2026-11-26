import {celLighting} from './anime_shading.js';
import {inStreetBed} from './anime_street.js';

// Folded turf, clover and nodding oat sprays. The root of each small plant
// stays pinned to the page. The same breeze crosses all the plantings.
const circle = 2 * Math.PI;
const strokeCount = 5;

function randomStream(seed) {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

function cutTuft(T, palette, kind, seed) {
    const random = randomStream(seed);
    const between = (a, b) => a + (b - a) * random();
    const points = [], colors = [], indices = [];
    const green = new T.Color(palette.leaf);
    const dark = green.clone().lerp(new T.Color(palette.ink), .26);
    const pale = green.clone().lerp(new T.Color(palette.paper), .19);
    const straw = new T.Color(palette.gold), husk = new T.Color(palette.paper);
    const v = (x, y, z) => new T.Vector3(x, y, z);
    function vertex(p, color) {
        const i = points.length / 3;
        points.push(p.x, p.y, p.z);
        colors.push(color.r, color.g, color.b);
        return i;
    }
    function quad(a, b, c, d) { indices.push(a, b, d, b, c, d); }
    function blade(x, z, a, h, width, reach, face) {
        const dx = Math.cos(a), dz = Math.sin(a), twist = between(-.60, .60);
        const steps = kind === 'distant' ? [0, .51] : [0, .34, .69];
        let prev;
        for (const t of steps) {
            const along = reach * (t * .16 + t * t * .84);
            const y = h * (1.52 * t - .52 * t * t);
            const cx = x + dx * along, cz = z + dz * along;
            const w = width * (1 - .82 * t) * (.66 + .54 * Math.sin(t * Math.PI));
            const wx = -Math.sin(a + twist * t) * w, wz = Math.cos(a + twist * t) * w;
            const fold = w * .68;
            const left = vertex(v(cx - wx, y, cz - wz), t ? face : dark);
            const mid = v(cx - dx * fold, y + .15 * fold, cz - dz * fold);
            const creaseL = vertex(mid, t ? face : dark);
            const creaseR = vertex(mid, t ? green : dark);
            const right = vertex(v(cx + wx, y, cz + wz), t ? green : dark);
            if (prev) {
                quad(prev[0], prev[1], creaseL, left);
                quad(prev[2], prev[3], right, creaseR);
            }
            prev = [left, creaseL, creaseR, right];
        }
        const tip = vertex(v(x + dx * reach, h, z + dz * reach), face);
        indices.push(prev[0], prev[1], tip, prev[2], prev[3], tip);
    }
    // Three-sided stalks remain readable from the opposite shore. Blade and
    // stalk bends are calculated from height so attached seed pods stay on.
    function stem(a, b, radius, face) {
        const dir = b.clone().sub(a).normalize();
        const axis = v(0, 0, 1);
        if (Math.abs(dir.z) > .9) axis.set(1, 0, 0);
        const u = dir.clone().cross(axis).normalize(), w = dir.clone().cross(u);
        const from = [], to = [];
        for (let j = 0; j < 3; j++) {
            const p = circle * j / 3;
            const off = u.clone().multiplyScalar(Math.cos(p) * radius).addScaledVector(w, Math.sin(p) * radius);
            from.push(vertex(a.clone().add(off), face));
            to.push(vertex(b.clone().addScaledVector(off, .72), face));
        }
        for (let j = 0; j < 3; j++) quad(from[j], from[(j + 1) % 3], to[(j + 1) % 3], to[j]);
    }
    function clover(x, z, h, scale, turn) {
        const joint = v(x + .03, h, z);
        stem(v(x, 0, z), joint, .008, green);
        for (let j = 0; j < 3; j++) {
            const a = turn + j * circle / 3 + between(-.15, .15);
            const radial = v(Math.cos(a), between(.22, .51), Math.sin(a));
            const across = v(-radial.z, .08, radial.x);
            const point = (r, s, fold = 0) =>
                joint.clone().addScaledVector(radial, r * scale).addScaledVector(across, s * scale).addScaledVector(v(0,1,0), fold * scale);
            const base = vertex(point(0, 0), dark), mid = vertex(point(.55, 0, .08), pale);
            const loop = [[.35, -.36], [.74, -.49], [1.03, -.27], [.91, 0], [1.02, .27], [.76, .46], [.33, .34]];
            const border = loop.map(([r,s]) => vertex(point(r,s), s < 0 ? green : pale));
            indices.push(base, mid, border[0]);
            for (let k = 0; k < border.length - 1; k++) indices.push(mid, border[k+1], border[k]);
            indices.push(base, border[border.length-1], mid);
            // Short pale chevron on each leaflet, broken at the central fold.
            const front = (r, s) => vertex(point(r, s, .078*(1-Math.abs(s))+.013), pale);
            indices.push(front(.52,-.29),front(.66,0),front(.57,-.04),
                front(.66,0),front(.52,.28),front(.57,.05));
        }
    }
    function oats(x, z, h, turn) {
        const dx = Math.cos(turn), dz = Math.sin(turn);
        const foot = v(x, 0, z), bend = v(x + .055 * dx, h * .65, z + .055 * dz);
        const crest = v(x + .14 * dx, h, z + .14 * dz);
        stem(foot, bend, .0095, dark); stem(bend, crest, .0065, pale);
        for (let j = 0; j < 5; j++) {
            const t = .15 + .20 * j;
            const node = bend.clone().lerp(crest, t);
            const ang = turn + (j%2 ? 1.6 : -1.5) + between(-.38,.38);
            const offset = (.15 - .055*t) * between(.84, 1.18);
            const huskTop = node.clone().add(v(Math.cos(ang)*offset, .027+.039*t, Math.sin(ang)*offset));
            stem(node, huskTop, .004, straw);
            const length = .115 - .030*t, w = length*.22;
            const centre = huskTop.clone().add(v(.20*length*dx,-.46*length,.20*length*dz));
            const bottom = centre.clone().add(v(.12*length*dx,-.55*length,.12*length*dz));
            const corners = [];
            for (let k=0; k<4; k++) {
                const a=ang+k*Math.PI*.5;
                corners.push(vertex(centre.clone().add(v(Math.cos(a)*w,0,Math.sin(a)*w)), k===0?husk:straw));
            }
            const crown=vertex(huskTop,straw), tip=vertex(bottom,straw);
            for (let k=0; k<4; k++) indices.push(crown,corners[(k+1)%4],corners[k],tip,corners[k],corners[(k+1)%4]);
        }
    }

    const count = { short:7, rush:8, clover:4, oat:6, distant:4 }[kind];
    const lean = random()*circle;
    for (let j=0; j<count; j++) {
        const a=lean+j*2.39996+between(-.46,.46);
        const h=between(.14,.37)*(kind==='rush'?1.48:1);
        const spread=between(.026,.14);
        blade(Math.cos(a)*spread,Math.sin(a)*spread,a,h,between(.019,.035),
            h*between(.36,1.18),j%4===0?pale:green);
    }
    if (kind==='oat') {
        oats(-.09,.01,.73,lean); oats(.12,-.06,.57,lean+.85);
    }
    if (kind==='clover') {
        clover(-.07,.03,.18,.112,lean);
        clover(.12,-.09,.12,.088,lean+.91);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    const brushHeight = {short:.15,rush:.24,clover:.12,oat:.36,distant:.14}[kind];
    geometry.setAttribute('brushHeight',new T.Float32BufferAttribute(new Float32Array(points.length/3).fill(brushHeight),1));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    return geometry;
}

// In world XZ coordinates, a brush stroke is a short segment with a radius
// and a decaying signed impulse. Fixed-size uniforms avoid updating thousands
// of transforms and let an individual clump spring back after the cursor leaves.
const windVertex = `
    attribute float brushHeight;
    uniform float meadowTime;
    uniform float meadowMotion;
    uniform vec4 meadowStroke[5];
    uniform vec4 meadowImpulse[5];
    uniform vec2 meadowSlope[5];
    vec2 meadowBend(vec2 root, float tuftHeight) {
        if (meadowMotion < .5) return vec2(0.);
        float phase=dot(root,vec2(.58,-.28))-meadowTime*1.60;
        vec2 b=vec2(.90,-.43)*(.12*sin(phase)+.055*sin(phase*1.78+root.y*.29));
        for (int i=0;i<5;i++) {
            vec2 line=meadowStroke[i].zw-meadowStroke[i].xy;
            vec2 a=meadowStroke[i].xy+meadowSlope[i]*tuftHeight;
            float along=clamp(dot(root-a,line)/max(.0001,dot(line,line)),0.,1.);
            vec2 offset=root-a-line*along;
            float power=max(0.,1.-dot(offset,offset)*meadowImpulse[i].z);
            b+=meadowImpulse[i].xy*(power*power*meadowImpulse[i].w);
        }
        return b/max(1.,length(b)/1.26);
    }
`;
function meadowMaterial(T) {
    const shader=T.ShaderLib.lambert, uniforms=T.UniformsUtils.clone(shader.uniforms);
    uniforms.meadowTime={value:0};uniforms.meadowMotion={value:0};
    uniforms.meadowSlope={value:Array.from({length:strokeCount},()=>new T.Vector2())};
    for(const name of ['meadowStroke','meadowImpulse']) {
        uniforms[name]={value:Array.from({length:strokeCount},()=>new T.Vector4(0,0,0,0))};
    }
    const vertexShader=shader.vertexShader.replace('#include <common>', '#include <common>\n'+windVertex)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
            vec2 worldBend=meadowBend(instanceMatrix[3].xz,brushHeight*length(instanceMatrix[1].xyz));
            vec2 bend=vec2(dot(worldBend,normalize(instanceMatrix[0].xz)),
                           dot(worldBend,normalize(instanceMatrix[2].xz)));
            float height=max(0.,position.y);
            objectNormal.y-=dot(objectNormal.xz,bend)*(1.72*height);`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
            transformed.xz+=bend*height*height*.86;
            transformed.y-=min(.56,dot(bend,bend)*.32)*height*height;`);
    return new T.ShaderMaterial({name:'花园草丛',uniforms,vertexShader,
        fragmentShader:celLighting(T,shader.fragmentShader),lights:true,fog:true,vertexColors:true,side:T.DoubleSide});
}

// One print for the whole lawn. A broad footprint joins neighbouring plants;
// a smaller one beds individual roots into it. The third channel embosses
// the shoulder of each drift, like the edge of a pressed paper impression.
function turfPrint(T, plots) {
    const resolution=256, extent=64, step=extent/resolution;
    const broad=new Float32Array(resolution*resolution),roots=new Float32Array(broad.length);
    for(const [kind,stations] of Object.entries(plots))for(const [x,z,yaw,height,width] of stations){
        const u=x/step+resolution/2-.5,v=z/step+resolution/2-.5;
        const reach=2.42*height, foot=(kind==='rush'?.64:.48)*height;
        const radius=Math.ceil(reach*1.14/step);
        const c=Math.cos(yaw),s=Math.sin(yaw),weight=kind==='distant'?.72:1;
        for(let j=Math.max(0,Math.floor(v)-radius);j<=Math.min(resolution-1,Math.ceil(v)+radius);j++){
            for(let i=Math.max(0,Math.floor(u)-radius);i<=Math.min(resolution-1,Math.ceil(u)+radius);i++){
                const dx=(i-u)*step,dz=(j-v)*step;
                const a=dx*c-dz*s,b=dx*s+dz*c;
                const d=a*a/(1.1*1.1)+b*b/(.8+.15*width)**2;
                const k=Math.max(0,1-d/(reach*reach));
                broad[j*resolution+i]+=k*k*weight;
                const fine=Math.max(0,1-d/(foot*foot));
                roots[j*resolution+i]+=fine*fine;
            }
        }
    }
    for(let i=0;i<broad.length;i++)broad[i]=1-Math.exp(-.20*broad[i]);
    const rgba=new Uint8Array(broad.length*4);
    for(let z=0;z<resolution;z++)for(let x=0;x<resolution;x++){
        const i=z*resolution+x;
        const nextX=i+(x<resolution-1?1:0),nextZ=i+(z<resolution-1?resolution:0);
        const relief=Math.min(1,Math.max(0,.5+2.6*(broad[i]-broad[nextX])+.95*(broad[i]-broad[nextZ])));
        rgba[4*i]=Math.round(255*broad[i]);rgba[4*i+1]=Math.round(255*(1-Math.exp(-1.35*roots[i])));
        rgba[4*i+2]=Math.round(255*relief);rgba[4*i+3]=255;
    }
    const texture=new T.DataTexture(rgba,resolution,resolution,T.RGBAFormat);
    texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;
    texture.generateMipmaps=true;texture.needsUpdate=true;texture.name='Grass density impression';
    return texture;
}

export function plantMeadow(T, scene, palette, mainPath, walks) {
    const root=new T.Group();root.name='Paper meadow';root.userData.ownPaperFinish=true;
    const random=randomStream(0x2bc7ba), between=(a,b)=>a+(b-a)*random();
    const types=['short','rush','clover','oat','distant'];
    const plots=Object.fromEntries(types.map(name=>[name,[]]));
    const paths=[{points:mainPath.getSpacedPoints(65),width:t=>1.45*(1+.12*Math.sin(t*4)+.055*Math.sin(t*18))+.22}];
    for(const points of walks) {
        const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
        paths.push({points:curve.getSpacedPoints(14),width:()=>.65});
    }
    function clearGround(x,z) {
        if(!inStreetBed(x,z))return false;
        if(Math.hypot(x,z)<6.60) return false;
        for(const [cx,cz,rx,rz,angle] of [[-9.9,-4.7,3.6,2.72,.34],[8,-12.7,4.75,2.35,-.23],
            [-6.4,-13,2.11,2.12,-.32],[-6.5,-1.78,1.28,.58,1.2],[6.8,-4.3,1.28,.58,-1],[-5.8,6.8,1.28,.58,2.45]]) {
            const dx=x-cx,dz=z-cz,c=Math.cos(angle),s=Math.sin(angle);
            if(Math.abs(dx*c-dz*s)<rx && Math.abs(dx*s+dz*c)<rz)return false;
        }
        for(const {points,width} of paths) {
            for(let i=1;i<points.length;i++) {
                const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z;
                const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
                const reach=width((i-1+t)/(points.length-1));
                if((x-a.x-t*dx)**2+(z-a.z-t*dz)**2<reach*reach)return false;
            }
        }
        return true;
    }
    function seed(x,z,type,size) {
        if(clearGround(x,z))plots[type].push([x,z,random()*circle,size,between(.79,1.21)]);
    }
    // Broad and narrow stands are composed around the views from the path,
    // the oak, and the reverse side of the pool. Leave open turf between them.
    const drifts=[
        [-4.5,17,5.3,1.7,-.65], [4.8,16,4.8,2.3,-.48], [4.5,11,4.8,1.9,.56],
        [-7.8,9.1,4.6,2.2,-.36], [8.8,7.8,4.6,2.3,.89], [-10.4,3.1,4.4,1.95,1.12],
        [11.4,1.4,4.85,2.3,-.65],[-11.8,-.5,3.6,1.52,-.35],[-9.7,-8.6,4.8,1.95,-.61],
        [-3.4,-9.7,3.7,1.75,.44], [3.15,-8.62,3.4,1.75,-.53], [9.9,-7.97,4.0,1.87,.12],
        [-4.1,-15.7,3.8,2.1,.65], [1.2,-15.3,3.8,1.7,.15], [13.4,-14.71,4.6,2.07,1.23],
        [-14.6,15.9,5.5,2.10,.64], [11.5,20.2,5.45,2.8,-.91], [-5.7,23,4.7,2.55,-.36]
    ];
    for(const [row,[x,z,w,h,yaw]] of drifts.entries()) {
        const tuftCount=Math.round(w*h*4.0);
        for(let j=0;j<tuftCount;j++) {
            const a=random()*circle,r=Math.sqrt(random());
            const s=Math.cos(a)*r,t=Math.sin(a)*r,dx=s*w,dz=t*h+Math.sin(s*4.18+row)*.31;
            const px=x+Math.cos(yaw)*dx-Math.sin(yaw)*dz, pz=z+Math.sin(yaw)*dx+Math.cos(yaw)*dz;
            const mix=random(), type=mix<.07&&row%3!==0?'oat':mix<.23?'clover':mix<.49?'rush':'short';
            seed(px,pz,type,between(.72,1.35)*(1-.16*r));
        }
    }
    // Less elaborate blades sit along the far tree line. Low clover and rare
    // seed sprays settle into discontinuous sections of both main verges.
    for(let i=0;i<42;i++) {
        const a=(i+between(-.3,.3))*circle/42, r=between(16,27), x=Math.cos(a)*r,z=Math.sin(a)*r;
        for(let j=0;j<12;j++)seed(x+between(-2.7,2.7),z+between(-1.4,1.4),'distant',between(.81,1.49));
    }
    for(const side of [-1,1])for(let i=0;i<11;i++) {
        const t=.024+i*.077+(side===1?.023:0),patch=between(5,11);
        for(let j=0;j<patch;j++) {
            const along=Math.min(1,t+between(-.019,.025)),p=mainPath.getPointAt(along),f=mainPath.getTangentAt(along);
            const offset=side*(paths[0].width(along)+between(.02,1.35));
            seed(p.x+f.z*offset,p.z-f.x*offset,j%5===0?'oat':j%3===0?'clover':'short',between(.69,1.09));
        }
    }
    const material=meadowMaterial(T),pose=new T.Object3D(),meshes=[];
    for(const [i,type] of types.entries()) {
        const stations=plots[type],geo=cutTuft(T,palette,type,1307+i*37);
        const mesh=new T.InstancedMesh(geo,material,stations.length);mesh.name='Meadow · '+type;
        for(const [j,[x,z,yaw,height,width]] of stations.entries()) {
            pose.position.set(x,-.033,z);pose.rotation.y=yaw;pose.scale.set(height*width,height,height*width);
            pose.updateMatrix();mesh.setMatrixAt(j,pose.matrix);
        }
        mesh.computeBoundingSphere();mesh.boundingSphere.radius+=.9;
        mesh.castShadow=false;mesh.receiveShadow=true;root.add(mesh);meshes.push(mesh);
    }
    scene.add(root);
    const uniforms=material.uniforms, ages=new Float64Array(strokeCount).fill(-Infinity);
    const previous=new T.Vector2();let wasOver=false,cursor=0;
    let terrainPrint;
    function dressGround(ground) {
        if(terrainPrint)return;
        terrainPrint=turfPrint(T,plots);
        const previous=ground.onBeforeCompile,cacheKey=ground.customProgramCacheKey();
        const printInk=new T.Color(palette.ink),paperInk=new T.Color(palette.paper);
        ground.customProgramCacheKey=()=>cacheKey+'-grass-density';
        ground.onBeforeCompile=function(shader,renderer) {
            previous.call(this,shader,renderer);
            shader.uniforms.turfPrint={value:terrainPrint};
            shader.uniforms.turfInk={value:printInk};shader.uniforms.turfPaper={value:paperInk};
            shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 turfUV;')
                .replace('#include <project_vertex>', '#include <project_vertex>\n turfUV=(modelMatrix*vec4(transformed,1.)).xz/64.+.5;');
            shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
                '#include <common>\nvarying vec2 turfUV;uniform sampler2D turfPrint;uniform vec3 turfInk,turfPaper;')
                .replace('#include <color_fragment>',`#include <color_fragment>
                    vec3 turf=texture2D(turfPrint,turfUV).rgb;
                    diffuseColor.rgb=mix(diffuseColor.rgb,turfPaper,.055*(1.-turf.r));
                    diffuseColor.rgb=mix(diffuseColor.rgb,turfInk,.21*turf.r+.11*turf.g);
                    diffuseColor.rgb*=1.+.055*(turf.b-.5);`);
        };
        ground.needsUpdate=true;
    }
    function update(time,reduced,point,ray) {
        uniforms.meadowTime.value=reduced?0:time;
        uniforms.meadowMotion.value=reduced?0:1;
        if(reduced)ages.fill(-Infinity);
        const over=!reduced&&point&&Math.abs(point.x)<31&&Math.abs(point.z)<32;
        if(over){
            let dx=point.x-previous.x,dz=point.z-previous.y;
            const d=Math.hypot(dx,dz);
            if(!wasOver||d>.15){
                const join=wasOver&&d<3.4;
                if(!join){dx=.92;dz=-.38;}
                const n=Math.hypot(dx,dz);
                uniforms.meadowStroke.value[cursor].set(join?previous.x:point.x,join?previous.y:point.z,point.x,point.z);
                uniforms.meadowImpulse.value[cursor].set(dx/n,dz/n,1/(.93*.93),0);
                const slope=uniforms.meadowSlope.value[cursor];
                if(ray&&ray.direction.y<-.025)slope.set(ray.direction.x/ray.direction.y,ray.direction.z/ray.direction.y).clampLength(0,8);
                else slope.set(0,0);
                ages[cursor]=time;cursor=(cursor+1)%strokeCount;previous.set(point.x,point.z);
            }
        }
        wasOver=Boolean(over);
        for(let i=0;i<strokeCount;i++){
            const age=time-ages[i];
            uniforms.meadowImpulse.value[i].w=age>1.15?0:1.55*Math.exp(-4.1*age)*Math.cos(6.1*age);
        }
    }
    return {update,dressGround,dispose(){
        root.removeFromParent();
        for(const mesh of meshes){mesh.geometry.dispose();mesh.dispose();}
        material.dispose();terrainPrint?.dispose();
    }};
}
