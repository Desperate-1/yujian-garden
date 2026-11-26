// Shared fixtures stand at the same doorstep, letter and easel as the animated
// visit props. The building, paths, planting and skyline belong to each garden.
export function buildSeasonWorld(T,scene,palette,theme,buildSetting) {
    const setting=buildSetting(T,scene,palette),night=theme==='ugly';
    const root=new T.Group(),owned=new Set(),tau=2*Math.PI;
    scene.add(root);
    const v=(x,y,z)=>new T.Vector3(x,y,z);
    function group(parent,x,y,z,yaw=0){
        const g=new T.Group();g.position.set(x,y,z);g.rotation.y=yaw;parent.add(g);return g;
    }
    function mesh(parent,geometry,material,x=0,y=0,z=0){
        owned.add(geometry);owned.add(material);
        const o=new T.Mesh(geometry,material);o.position.set(x,y,z);parent.add(o);return o;
    }
    const face=color=>new T.MeshBasicMaterial({color});
    const invisible=new T.MeshBasicMaterial({side:T.DoubleSide,visible:false});
    const box=new T.BoxGeometry(),spotTargets=[],glowOutlines={};
    function landmark(name,x,z,yaw,w,h,d,edge){
        const g=group(root,x,0,z,yaw),hit=mesh(g,box,invisible,0,h/2,.3);
        hit.scale.set(w,h,d);hit.userData.destination=name;spotTargets.push(hit);
        glowOutlines[name]=edge.map(p=>g.localToWorld(v(...p)));return g;
    }
    landmark('candy',-9.9,-4.7,.34,5.4,4.2,4.1,[[-.70,.17,2.03],[-.70,1.68,2.03],[-.56,1.90,2.03],[-.31,2.02,2.03],[-.05,1.92,2.03],[.20,1.65,2.03],[.20,.17,2.03]]);
    landmark('journal',-6.4,-13,-.32,3.2,4.4,2.9,[[-.35,.33,1.13],[-.36,.73,1.13],[.40,.75,1.13],[.42,.34,1.13]]);
    const gallery=landmark('gallery',8,-12.7,-.23,7.6,5.1,3.7,[[-.68,.81,2.62],[1.28,.81,2.62],[1.28,2.27,2.62],[-.68,2.27,2.62]]);
    const clock=group(gallery,.68,4.28,1.15);
    const dial=(radius,color,z)=>mesh(clock,new T.CircleGeometry(radius,48),face(color),0,0,z);
    dial(.60,palette.ink,0);dial(.56,palette.gold,.01);dial(.50,palette.paper,.02);
    const ink=face(palette.ink);
    for(let i=0;i<12;i++){
        const a=tau*i/12,m=mesh(clock,box,ink,.44*Math.sin(a),.44*Math.cos(a),.033);
        m.scale.set(.027,i%3?.055:.10,.012);m.rotation.z=-a;
    }
    function hand(length,width,color,z){
        const hub=group(clock,0,0,z),blade=mesh(hub,box,face(color),0,length*.38,0);
        blade.scale.set(width,length,.012);return hub;
    }
    const hour=hand(.30,.047,palette.ink,.055),minute=hand(.41,.029,palette.ink,.072),second=hand(.48,.017,palette.gold,.088);
    second.name='Gallery clock second hand';dial(.046,palette.ink,.11);
    const positions=[],indices=[];
    for(let i=0;i<=16;i++){
        const z=5+i;
        positions.push(-1.15,.055,z,1.15,.055,z);
        if(i){const n=i*2;indices.push(n-2,n,n-1,n,n+1,n-1);}
    }
    const ribbon=new T.BufferGeometry();ribbon.setAttribute('position',new T.Float32BufferAttribute(positions,3));ribbon.setIndex(indices);
    const path=mesh(root,ribbon,invisible),pathTargets=[path];
    const luminary=group(root,night?9.1:-14.5,night?13.9:15.7,-39);
    luminary.name=night?'花园月亮':'水庭日轮';
    const radius=night?1.75:1.32;
    const tile=document.createElement('canvas');tile.width=tile.height=256;
    const c=tile.getContext('2d'),wax=c.createRadialGradient(90,71,17,133,133,136);
    wax.addColorStop(0,night?'#fff9e7':'#fffdef');wax.addColorStop(.84,night?'#e7e0ca':'#fff1c2');wax.addColorStop(1,night?'#a7adc3':'#ffd28c');
    c.fillStyle=wax;c.fillRect(0,0,256,256);
    let seed=269;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
    if(night){
        // The gradient is anchored to the horizon as the visitor turns. Keep
        // the lower sky luminous enough to separate the silhouettes of trees.
        scene.fog.color.set('#8797af');
        const vault=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,
            vertexShader:`varying vec3 dir;
                void main(){dir=position;vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);
                  gl_Position=p.xyww;}`,
            fragmentShader:`varying vec3 dir;
                void main(){vec3 d=normalize(dir);float h=max(0.,d.y);
                  vec3 col=mix(vec3(.19,.25,.38),vec3(.038,.068,.17),smoothstep(0.,.32,h));
                  col=mix(col,vec3(.009,.019,.064),smoothstep(.26,.82,h));
                  float haze=.5+.5*sin(17.*d.x+4.5*d.z+12.*d.y+.9*sin(24.*d.z));
                  col+=vec3(.014,.015,.021)*haze*exp(-9.*h);
                  gl_FragColor=vec4(col,1.);
                  #include <colorspace_fragment>
                }`
        });
        const sphere=mesh(root,new T.SphereGeometry(108,48,24),vault);
        sphere.frustumCulled=false;sphere.renderOrder=-110;
        const stars=[],sizes=[],brightness=[];
        for(let i=0;i<580;i++){
            const a=rand()*tau,y=.025+rand()*.96,r=Math.sqrt(1-y*y);
            stars.push(r*Math.sin(a)*92,y*92,r*Math.cos(a)*92);
            const size=rand()**3;sizes.push(1.05+size*4.4);brightness.push(.28+.67*size);
        }
        const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(stars,3));
        geo.setAttribute('diameter',new T.Float32BufferAttribute(sizes,1));geo.setAttribute('shine',new T.Float32BufferAttribute(brightness,1));
        const material=new T.ShaderMaterial({transparent:true,depthWrite:false,
            vertexShader:`attribute float diameter,shine;varying float light;
                void main(){light=shine;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=diameter;}`,
            fragmentShader:`varying float light;
                void main(){vec2 q=abs(gl_PointCoord*2.-1.);float core=1.-smoothstep(.12,.92,length(q));
                  float ray=1.-smoothstep(.5,.97,min(q.x+4.*q.y,q.y+4.*q.x));
                  gl_FragColor=vec4(.87,.93,1.,light*max(core,.64*ray));}`});
        root.add(new T.Points(geo,material));owned.add(geo);owned.add(material);
    }
    const texture=night?new T.TextureLoader().load(new URL('../garden/lobby/moon.webp',import.meta.url).href):new T.CanvasTexture(tile);texture.colorSpace=T.SRGBColorSpace;owned.add(texture);
    const disc=new T.CircleGeometry(radius,80);
    mesh(luminary,night?new T.PlaneGeometry(radius*2,radius*2):disc,new T.MeshBasicMaterial({map:texture,fog:false,alphaTest:.18}));
    const sunTarget=mesh(luminary,disc,invisible,0,0,.02);sunTarget.userData.destination='sun';
    glowOutlines.sun=Array.from({length:48},(_,i)=>v(radius*Math.cos(i*tau/48),radius*Math.sin(i*tau/48),.025));
    const plane=new T.Plane(v(0,0,1),39),cursor=v(),offset=v();let held=false;
    function move(x,y){
        luminary.position.x=T.MathUtils.clamp(x,-25,25);luminary.position.y=T.MathUtils.clamp(y,6,23);
        luminary.updateWorldMatrix(true,true);
    }
    return {pathTargets,spotTargets,glowOutlines,sunTarget,
        beginSunDrag(ray){held=Boolean(ray.intersectPlane(plane,cursor));if(held)offset.copy(luminary.position).sub(cursor);},
        dragSun(ray){if(held && ray.intersectPlane(plane,cursor))move(cursor.x+offset.x,cursor.y+offset.y);},
        endSunDrag(){held=false;},moveSunBy(dx,dy){move(luminary.position.x+dx,luminary.position.y+dy);},
        horizon:{coversSun:()=>false,sunLift:()=>0,dispose(){}},
        update(time,reduced,point,ray){
            const now=new Date(),s=now.getSeconds()+(reduced?0:now.getMilliseconds()/1000),m=now.getMinutes()+s/60;
            second.rotation.z=-s*tau/60;minute.rotation.z=-m*tau/60;hour.rotation.z=-(now.getHours()+m/60)*tau/12;
            setting.update(time,reduced,point,ray);
        },
        dispose(){setting.dispose();root.removeFromParent();for(const item of owned)item.dispose();}
    };
}
