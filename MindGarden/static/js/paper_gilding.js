import {sunDepthGLSL} from './paper_horizon.js';

// Screen-width gilded edges follow the objects, even when a door or the sun moves.
export function buildGilding(T, scene, world, visits, palette, fountain) {
    const strokes = [];
    const distantSun=document.documentElement.dataset.theme==='cute';
    const size = new T.Vector2(1280,720);
    const gold=new T.Color(palette.gold).lerp(new T.Color(0xffbd38),.68);
    const highlight=new T.Color(palette.paper).lerp(new T.Color(0xfff9cf),.80);
    const shade=gold.clone().lerp(new T.Color(palette.ink),.89);
    const pixelRatio={value:1};
    // The darker rim separates gold from sunlit stone. Each landmark also has
    // one small, screen-sized gleam attached to its visible contour.
    function glint(anchor,point,uniforms){
        const geometry=new T.BufferGeometry().setFromPoints([point]);
        const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms,
            vertexShader:`uniform float clock,hot,seed,pixelRatio;
                varying float shine;
                void main(){
                    vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
                    p.z-=.00033*p.w; gl_Position=p;
                    shine=.5+.5*sin(clock*1.55+seed);
                    gl_PointSize=pixelRatio*(15.+7.*shine+8.*hot);
                }`,
            fragmentShader:`uniform vec3 gold,paper;varying float shine;
                void main(){
                    vec2 p=abs(gl_PointCoord*2.-1.);
                    float rays=min(p.x+5.*p.y,5.*p.x+p.y);
                    float star=1.-smoothstep(.72,.98,rays);
                    float centre=1.-smoothstep(.04,.36,length(p));
                    float halo=pow(max(0.,1.-length(p)),3.);
                    float alpha=star*(.78+.20*shine)+.40*halo;
                    gl_FragColor=vec4(mix(gold,paper,.35*star+.65*centre),min(1.,alpha));
                    #include <colorspace_fragment>
                }`});
        const flare=new T.Points(geometry,material);flare.renderOrder=6;
        anchor.add(flare);return flare;
    }
    function stroke(key, points, anchor = scene, closed = true, shown = null, sparkle = true) {
        if (!points || points.length < 3) return;
        const path = closed ? [...points,points[0]] : points;
        const positions=[], previous=[], following=[], edges=[], distances=[], indices=[];
        let length=0;
        const total=path.reduce((d,p,i)=>i ? d+p.distanceTo(path[i-1]) : 0,0);
        path.forEach((p,i)=>{
            if(i) length+=p.distanceTo(path[i-1]);
            const before = path[i-1] || (closed ? path[path.length-2] : p);
            const after = path[i+1] || (closed ? path[1] : p);
            for(const sign of [-1,1]) {
                positions.push(...p.toArray()); previous.push(...before.toArray()); following.push(...after.toArray());
                edges.push(sign); distances.push(length/total);
            }
            if(i) {const n=i*2;indices.push(n-2,n-1,n,n,n-1,n+1);}
        });
        const geo=new T.BufferGeometry();
        for(const [name,data,width] of [['position',positions,3],['before',previous,3],['after',following,3],['edge',edges,1],['arc',distances,1]]) {
            geo.setAttribute(name,new T.Float32BufferAttribute(data,width));
        }
        geo.setIndex(indices);
        const uniforms={viewport:{value:size},gold:{value:gold},paper:{value:highlight},shade:{value:shade},
            width:{value:key==='path'?8:key==='sun'?10:15},pixelRatio,
            clock:{value:0},hot:{value:0},seed:{value:strokes.length*.73}};
        const material=new T.ShaderMaterial({
            transparent:true,depthWrite:false,side:T.DoubleSide,uniforms,
            vertexShader:`attribute vec3 before,after; attribute float edge,arc;
                uniform vec2 viewport; uniform float hot,width; varying float flank,along;
                ${key==='sun' && distantSun?sunDepthGLSL:''}
                void main(){
                    mat4 mvp=projectionMatrix*modelViewMatrix;
                    vec4 p=mvp*vec4(position,1.),a=mvp*vec4(before,1.),b=mvp*vec4(after,1.);
                    vec2 d=(b.xy/max(.001,b.w)-a.xy/max(.001,a.w))*viewport;
                    vec2 n=vec2(-d.y,d.x)/max(.001,length(d));
                    p.xy+=n*edge*(width+6.*hot)/viewport*p.w;
                    ${key==='sun' && distantSun?'p.z=skySunClipZ(p,projectionMatrix,.12);':'p.z-=.00029*p.w;'}
                    gl_Position=p; flank=edge;along=arc;
                }`,
            fragmentShader:`uniform vec3 gold,paper,shade;uniform float clock,hot,seed;varying float flank,along;
                void main(){
                    float x=abs(flank);
                    float pulse=.5+.5*sin(clock*1.15+seed);
                    float gleam=pow(.5+.5*cos(6.28318*(along-clock*.11)+seed),14.);
                    float core=1.-smoothstep(.06,.20,x);
                    float rail=1.-smoothstep(.26,.42,x);
                    float rim=smoothstep(.26,.38,x)*(1.-smoothstep(.41,.54,x));
                    float haze=pow(1.-x,1.8);
                    vec3 colour=mix(gold,shade,.86*rim);
                    colour=mix(colour,paper,core*(.68+.30*gleam));
                    float alpha=.94*rail+.78*rim+(.44+.18*pulse+.26*hot)*haze;
                    gl_FragColor=vec4(colour,min(.98,alpha));
                    #include <colorspace_fragment>
                }`
        });
        const mesh=new T.Mesh(geo,material);
        mesh.name='金箔 · '+key;
        mesh.renderOrder=5;mesh.frustumCulled=false;anchor.add(mesh);
        const tip=points.reduce((a,b)=>b.y>a.y?b:a);
        const flare=sparkle?glint(anchor,tip,uniforms):null;
        if(flare)flare.name='金光 · '+key;
        strokes.push({key,mesh,material,shown,flare});
    }
    for(const key of ['candy','journal','gallery','sun']) {
        // sunTarget is a hit proxy and may be invisible. Follow its transform independently.
        const outline=world.glowOutlines[key];
        if (key==='sun') {
            const frame=new T.Group();scene.add(frame);
            stroke(key,outline,frame,true,null,false);
            frame.name='太阳金边';
            frame.matrixAutoUpdate=false;
        } else stroke(key,outline);
    }
    stroke('fountain',fountain.gildedRim,scene,true,null,false);
    stroke('fountain',fountain.gildedFlower);
    for(const [key,spot] of Object.entries(visits.spots)){
        const second=spot.revealed;
        stroke('visit-'+key,spot.outline,spot.outlineParent,true,()=>!second.visible());
        stroke('visit-'+key,second.points,second.parent,true,second.visible);
    }
    const pathSide=world.pathTargets[0].geometry.getAttribute('position');
    const points=[];
    for(let i=1;i<pathSide.count;i+=2) points.push(new T.Vector3().fromBufferAttribute(pathSide,i).add(new T.Vector3(0,.014,0)));
    stroke('path',points,scene,false,null,false);
    function update(view,hot,time,reduced){
        for (const item of strokes) {
            const {key,mesh,material,shown,flare}=item;
            mesh.visible = view!=='walking' && (!shown || shown()) && (
                key.startsWith('visit-') ? key==='visit-'+view : key==='path' ? view==='entrance' && hot==='path' : key!==view
            );
            if(flare)flare.visible=mesh.visible;
            if (!mesh.visible) continue;
            if(key==='sun'){
                world.sunTarget.updateWorldMatrix(true,false);
                mesh.parent.matrix.copy(world.sunTarget.matrixWorld);
                mesh.parent.matrixWorldNeedsUpdate=true;
            }
            material.uniforms.hot.value = (key===hot || key==='visit-'+hot) ? 1:0;
            material.uniforms.clock.value=reduced ? .8:time;
        }
    }
    return {resize(w,h,ratio){size.set(w,h);pixelRatio.value=ratio;},update,dispose(){
        for(const {mesh,material,key,flare} of strokes){
            if(key==='sun') mesh.parent.removeFromParent();
            mesh.removeFromParent();mesh.geometry.dispose();material.dispose();
            if(flare){flare.removeFromParent();flare.geometry.dispose();flare.material.dispose();}
        }
    }};
}
