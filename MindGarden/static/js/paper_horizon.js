// One sweep of real terrain starts beyond the outermost trees. The sky carries
// only atmosphere. Looking back across the pond reveals the same connected valley.
const TAU=Math.PI*2;
const ridgeSlices=288,ridgeRows=41,innerRadius=83,ridgeSpan=35;

// The mouse operates on a nearby plane. In the depth buffer the sun belongs
// behind the valley, with enough depth separation left for its eyelids and face.
export const sunDepthGLSL=`float skySunClipZ(vec4 clipPos,mat4 proj,float biasMetres){
    float depth=141.+.45*clamp(clipPos.w-14.,0.,58.)-biasMetres;
    return (-proj[2][2]+proj[3][2]/depth)*clipPos.w;
}`;
function paintSunInSky(sun){
    const paints=new Set();
    sun?.traverse(o=>{if(o.isMesh && o.material.visible)paints.add(o.material);});
    for(const paint of paints){
        const previous=paint.onBeforeCompile,key=paint.customProgramCacheKey();
        paint.customProgramCacheKey=()=>key+'-beyond-valley';
        paint.onBeforeCompile=function(shader,renderer){
            previous.call(this,shader,renderer);
            shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+sunDepthGLSL)
                .replace('#include <project_vertex>','#include <project_vertex>\ngl_Position.z=skySunClipZ(gl_Position,projectionMatrix,0.);');
        };
        paint.needsUpdate=true;
    }
}

function mountainBelt(T,palette,night){
    const slices=ridgeSlices,rings=ridgeRows,positions=[],colors=[],indices=[];
    const sky=new T.Color(palette.sky),leaf=new T.Color(palette.leaf);
    const ink=new T.Color(palette.ink),paper=new T.Color(palette.paper);
    const rim=(a,r,h)=>[Math.sin(a)*r,h,-Math.cos(a)*r];
    function shape(t,a){
        const rise=(centre,spread)=>Math.exp(-((t-centre)**2)/(spread*spread));
        const shoulder=.21+.045*Math.sin(3*a+.6)+.018*Math.sin(8*a);
        const spine=.54+.046*Math.cos(4*a-.4)+.021*Math.sin(9*a);
        const summit=.85+.040*Math.sin(5*a+.9);
        const low=(2.7+1.4*Math.sin(3*a+1.1)+.6*Math.cos(7*a))*rise(shoulder,.095);
        const mid=(5.8+2.7*Math.sin(3*a-1.1)+1.27*Math.cos(7*a+.4))*rise(spine,.125);
        const high=(9.0+2.9*Math.sin(3*a+.42)+1.7*Math.cos(5*a-.55)+1.05*Math.sin(10*a-.68))*rise(summit,.16);
        return -.12+low+mid+high;
    }
    const wood=leaf.clone().lerp(ink,night?.43:.19);
    const haze=sky.clone().lerp(paper,night?.085:.28);
    const lavender=sky.clone().lerp(new T.Color(palette.blossom || palette.ink),night?.22:.16);
    const blueShade=sky.clone().lerp(ink,night?.57:.28);
    const face=new T.Color();
    for(let row=0;row<rings;row++){
        const t=row/(rings-1),r=innerRadius+ridgeSpan*t;
        for(let col=0;col<slices;col++){
            const a=col/slices*TAU;
            const h=shape(t,a);
            positions.push(...rim(a,r,h));
            // Broad valleys retain cooler reflected light. Sun-facing shoulders and
            // the far ridge pick up progressively more of the same horizon colour.
            const slopeR=(shape(t+.003,a)-shape(t-.003,a))/.252;
            const slopeA=(shape(t,a+.006)-shape(t,a-.006))/(.012*r);
            const nx=-Math.sin(a)*slopeR-Math.cos(a)*slopeA;
            const nz=Math.cos(a)*slopeR-Math.sin(a)*slopeA;
            const lambert=(.85-.41*nx-.34*nz)/Math.hypot(nx,1,nz);
            const light=T.MathUtils.smoothstep(lambert,.44,.90);
            const belt=T.MathUtils.smoothstep(t,.08,.92);
            const shadowPatch=.5+.5*Math.sin(15*a+.23*h+2*Math.sin(4*a));
            const ravine=.5+.5*Math.sin(7*a+13*t+1.8*Math.sin(2*a-.7));
            const pocket=T.MathUtils.smoothstep(ravine,.43,.72)*T.MathUtils.smoothstep(h,.7,5.);
            face.copy(wood).lerp(leaf,.30+.62*light)
                .lerp(sky,.18+.31*belt+.05*shadowPatch)
                .lerp(blueShade,.22*(1.-light)+.21*pocket)
                .lerp(lavender,.25*belt*belt)
                .lerp(haze,(night?.06:.16)*light+.09*belt);
            colors.push(face.r,face.g,face.b);
            if(row+1<rings){
                const curr=row*slices+col,next=row*slices+(col+1)%slices;
                indices.push(curr,curr+slices,next,next,curr+slices,next+slices);
            }
        }
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geometry.setIndex(indices);
    const terrain=new T.Mesh(geometry,new T.MeshBasicMaterial({vertexColors:true,fog:false,side:T.DoubleSide}));
    terrain.name='连绵山谷';return terrain;
}

// The shapes share an irregular sunward rim and a long, thinning leeward tail.
// Interior paths are clipped to the cloud, as in a small cel background painting.
const cloudForms=[
    [
        'M0 89 C20 84 26 81 45 82 C44 69 56 61 69 63 C66 46 81 36 98 42 C100 19 123 11 145 20 C155 0 187 -2 205 13 C216 22 218 31 217 42 C231 36 249 41 257 54 C276 46 293 55 296 68 C313 66 323 73 331 79 C348 81 371 77 387 86 C359 90 333 89 312 93 C270 102 235 96 196 99 C147 103 95 99 57 98 C33 99 10 96 0 89Z',
        'M0 92 Q32 83 52 86 Q57 70 79 72 Q87 54 104 59 Q106 41 129 39 Q118 53 132 60 Q152 48 165 55 Q169 41 182 38 Q182 48 194 50 Q198 40 216 38 Q242 27 276 42 L394 72 L396 111 L0 111Z',
        'M20 92 Q61 88 90 89 Q103 81 114 84 Q136 68 154 75 Q173 64 190 71 Q206 61 220 65 Q254 47 277 66 Q288 62 303 71 Q340 67 390 82 L397 110 L20 109Z',
    ],
    [
        'M0 80 Q24 72 49 76 Q60 65 73 67 Q79 55 98 57 Q114 43 127 49 Q132 23 158 23 Q173 9 193 18 Q210 24 214 39 Q230 30 244 39 Q258 46 259 57 Q278 51 289 60 Q301 55 314 64 Q338 63 356 71 Q374 72 387 75 Q367 80 338 80 Q303 87 276 86 Q241 93 211 88 Q188 94 147 90 Q105 95 72 88 Q28 91 0 80Z',
        'M-4 82 Q37 76 63 80 Q83 65 100 70 Q112 57 128 66 Q143 52 159 55 Q164 40 178 42 Q191 32 202 40 Q211 32 223 31 L379 65 L398 100 L-4 101Z',
        'M20 88 Q61 80 100 82 Q133 75 150 77 Q181 65 200 73 Q219 62 237 68 Q256 52 279 62 Q301 52 333 67 L397 78 L397 102 L20 105Z',
    ],
    [
        'M0 76 Q33 70 63 73 Q83 63 110 66 Q126 58 146 61 Q152 49 171 52 Q180 35 197 38 Q211 24 228 33 Q243 35 248 49 Q265 46 275 57 Q289 51 307 62 Q332 60 347 65 Q372 64 391 70 Q366 75 332 76 Q299 80 264 78 Q219 87 191 82 Q160 88 133 83 Q94 86 67 81 Q26 82 0 76Z',
        'M-5 82 Q54 74 89 79 Q108 72 130 76 Q149 62 173 69 Q189 49 206 55 Q215 43 230 49 Q237 41 251 44 L397 63 L397 102 L-5 102Z',
        'M100 85 Q162 75 187 78 Q218 68 238 73 Q267 59 284 65 Q307 59 333 65 L398 70 L395 99 L100 100Z',
    ]
];
function skyPaint(T,palette,night){
    const canvas=document.createElement('canvas');
    canvas.width=4096;canvas.height=512;
    const g=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    const sky=new T.Color(palette.sky),paper=new T.Color(palette.paper);
    const gold=new T.Color(palette.gold),ink=new T.Color(palette.ink);
    const mix=(a,b,f)=>'#'+a.clone().lerp(b,f).getHexString();
    const air=g.createLinearGradient(0,0,0,h);
    air.addColorStop(0,mix(sky,ink,night?.56:.11));
    air.addColorStop(.55,mix(sky,ink,night?.15:.025));
    air.addColorStop(.87,mix(sky,paper,night?.11:.31));
    air.addColorStop(1,mix(sky,paper,night?.18:.50));
    g.fillStyle=air;g.fillRect(0,0,w,h);
    if(night){
        // Stars live on the upper sky wash. Opaque clouds and the actual ridges
        // both mask them, including the lowest stars at the far end of the pond.
        for(let i=0;i<225;i++){
            const u=(.5+i*.38196601125)%1,e=.11+.84*((i*73%229)/229);
            const x=u*w,y=h*(1-(e+.10)/1.05),size=i%11===0?1.75:.73+(i%5)*.14;
            g.fillStyle=mix(sky,i%7?paper:gold,.42+.07*(i%6));
            g.beginPath();g.ellipse(x,y,size,size*.82,0,0,TAU);g.fill();
        }
    }
    const milk=paper.clone().lerp(gold,night?.036:.055);
    const blush=new T.Color(palette.blossom || palette.gold);
    const cloudShade=sky.clone().lerp(blush,night?.22:.13);
    const cloudTop=mix(sky,milk,night?.38:.93),cloudBase=mix(sky,milk,night?.18:.66);
    const shaded=mix(cloudShade,milk,night?.17:.50),underside=mix(cloudShade,milk,night?.086:.31);
    const patterns=cloudForms.map(c=>c.map(d=>new Path2D(d)));
    // Positions are unique around the panorama. Each bank crossing the meridian
    // is also painted on the other end with the identical offset.
    function bank(u,top,width,height,type,opacity,flip=false){
        const [outline,body,foot]=patterns[type],cx=u*w,span=width*w;
        function draw(x){
            g.save();g.globalAlpha=opacity;g.translate(x,top*h);g.scale((flip?-1:1)*span/393,height*h/100);
            const grad=g.createLinearGradient(0,8,0,95);grad.addColorStop(0,cloudTop);grad.addColorStop(1,cloudBase);
            g.fillStyle=grad;g.fill(outline);g.clip(outline);
            g.fillStyle=shaded;g.fill(body);g.fillStyle=underside;g.fill(foot);g.restore();
        }
        const x=cx+(flip?.5:-.5)*span;draw(x);
        if(cx-span*.5<0)draw(x+w);
        if(cx+span*.5>w)draw(x-w);
    }
    // Small low clouds break the strips of haze between the larger groups.
    for(const [u,y,width,ht,shape,flip] of [
        [.015,.71,.076,.12,0,0],[.111,.59,.091,.22,1,0],[.164,.69,.028,.07,2,1],
        [.234,.62,.119,.22,0,1],[.314,.71,.045,.09,2,0],[.358,.54,.070,.20,1,0],
        [.416,.65,.106,.17,0,0],[.476,.44,.047,.080,2,0],[.505,.715,.032,.075,2,1],
        [.598,.57,.135,.225,0,1],[.671,.68,.036,.090,1,0],[.734,.60,.084,.165,1,0],
        [.804,.40,.038,.078,2,1],[.836,.69,.086,.162,0,0],[.938,.55,.096,.22,1,1]
    ])bank(u,y+.10,width,ht*.57,shape,night?.32:.54,flip);
    // Thin high cirrus stretches over several roofs. A broken, tapering edge
    // keeps the sky quiet between the crossing telephone wires.
    for(let i=0;i<24;i++){
        const u=(i*.381966+.07)%1, y=(.38+.37*((i*17)%29)/29)*h;
        const length=(.021+.052*((i*37)%31)/31)*w, drift=(.019+.04*(i%4)/3)*h;
        g.fillStyle=cloudTop;g.globalAlpha=night?.085:.17+(i%3)*.04;
        for(const cx of [u*w,(u-1)*w,(u+1)*w]){
            g.beginPath();g.moveTo(cx-length*.65,y+drift*.42);
            g.bezierCurveTo(cx-length*.18,y+2,cx+length*.17,y-drift*.15,cx+length*.5,y-drift);
            g.bezierCurveTo(cx+length*.02,y-drift*.06,cx-length*.15,y+3,cx-length*.65,y+drift*.42);
            g.fill();
        }
    }
    g.globalAlpha=1;
    const sheet=new T.CanvasTexture(canvas);
    sheet.colorSpace=T.SRGBColorSpace;sheet.wrapS=T.RepeatWrapping;
    sheet.generateMipmaps=false;sheet.minFilter=T.LinearFilter;
    return sheet;
}

export function hangHorizon(T,scene,palette,night){
    const atlas=skyPaint(T,palette,night);
    const sky=new T.Mesh(new T.SphereGeometry(1,48,24),new T.ShaderMaterial({
        side:T.BackSide,depthTest:false,depthWrite:false,
        uniforms:{paint:{value:atlas}},
        vertexShader:`varying vec3 direction;
            void main(){
                direction=position;
                vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);
                gl_Position=clip.xyww;
            }`,
        fragmentShader:`uniform sampler2D paint;varying vec3 direction;
            void main(){
                vec3 n=normalize(direction);
                float u=.5+atan(n.x,-n.z)/6.283185307;
                float v=clamp((asin(clamp(n.y,-1.,1.))+.10)/1.05,0.,1.);
                gl_FragColor=texture2D(paint,vec2(u,v));
                #include <colorspace_fragment>
            }`
    }));
    sky.name='手绘云幕';sky.renderOrder=-100;sky.frustumCulled=false;
    const terrain=mountainBelt(T,palette,night);
    scene.add(sky,terrain);
    paintSunInSky(scene.getObjectByName('Paper sun'));
    // Solar hits are uncommon. Test the actual occluding triangles only after
    // the broad solar disc has been picked, including the half-hidden setting sun.
    const raycast=new T.Raycaster(),occluders=[];
    const eye=new T.Vector3(),sample=new T.Vector3(),positions=terrain.geometry.attributes.position;
    // Intersect the horizontal sightline with every sampled radius. Interpolating
    // adjacent heights gives the silhouette slope without scanning 23k faces per drag.
    function ridgeSlope(origin,dx,dz){
        const forward=origin.x*dx+origin.z*dz;
        const offset=origin.x*origin.x+origin.z*origin.z-forward*forward;
        let slope=-Infinity;
        for(let row=0;row<ridgeRows;row++){
            const r=innerRadius+ridgeSpan*row/(ridgeRows-1),along=Math.sqrt(r*r-offset)-forward;
            const x=origin.x+along*dx,z=origin.z+along*dz;
            const u=(Math.atan2(x,-z)/TAU+1)*ridgeSlices,bin=Math.floor(u);
            const a=row*ridgeSlices+bin%ridgeSlices,b=row*ridgeSlices+(bin+1)%ridgeSlices;
            const y=T.MathUtils.lerp(positions.getY(a),positions.getY(b),u-bin);
            slope=Math.max(slope,(y-origin.y)/along);
        }
        return slope;
    }
    function coversSun(ray){
        const d=Math.hypot(ray.direction.x,ray.direction.z);
        if(d<1e-5)return false;
        const diff=ray.direction.y/d-ridgeSlope(ray.origin,ray.direction.x/d,ray.direction.z/d);
        if(Math.abs(diff)>.003)return diff<0;
        // At a crest itself use the exact edge of the render triangles.
        raycast.ray.copy(ray);occluders.length=0;
        raycast.intersectObject(terrain,false,occluders);
        return occluders.length>0;
    }
    function sunLift(camera,target){
        camera.getWorldPosition(eye);
        let lift=0;
        for(const x of [-.55,0,.55]){
            target.localToWorld(sample.set(x,.82,0));
            const dx=sample.x-eye.x,dz=sample.z-eye.z,d=Math.hypot(dx,dz);
            if(d<1e-5)continue;
            const horizonY=eye.y+d*(ridgeSlope(eye,dx/d,dz/d)+.002);
            lift=Math.max(lift,horizonY-sample.y);
        }
        return lift;
    }
    return {coversSun,sunLift,dispose(){
        for(const item of [sky,terrain]){item.removeFromParent();item.geometry.dispose();item.material.dispose();}
        atlas.dispose();
    }};
}
