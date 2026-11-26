import {celLighting} from './anime_shading.js';

// At ground level a chunk of stone or a tree root also hides the surrounding
// sky. Bake that indirect shade once, in plan, from the actual assembled scene.
// R records low, solid forms; G records overhead foliage. Direct light and its
// moving directional shadow are evaluated separately by Three.
function groundOcclusion(T,meshes) {
    const extent=52, size=256, pixels=size*size, scale=size/extent;
    const footing=new Float32Array(pixels), foliage=new Float32Array(pixels);
    function pixel(x,z) {
        const u=Math.floor((x/extent+.5)*size),v=Math.floor((z/extent+.5)*size);
        return u<0||u>=size||v<0||v>=size ? -1 : v*size+u;
    }
    // Keep sampling time bounded when the architectural models gain more detail.
    const fixed=meshes.filter(m=>!m.isInstancedMesh && !m.material.transparent);
    const total=fixed.reduce((n,m)=>n+m.geometry.attributes.position.count,0);
    const stride=Math.max(1,Math.ceil(total/72000));
    for(const mesh of fixed) {
        const p=mesh.geometry.attributes.position,e=mesh.matrixWorld.elements;
        for(let i=0;i<p.count;i+=stride){
            const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
            const height=e[1]*x+e[5]*y+e[9]*z+e[13];
            if(height<.135 || height>1.45)continue;
            const index=pixel(e[0]*x+e[4]*y+e[8]*z+e[12],e[2]*x+e[6]*y+e[10]*z+e[14]);
            if(index>=0)footing[index]=Math.max(footing[index],1-.48*height);
        }
    }
    const anchor=new T.Vector3(),instance=new T.Matrix4();
    for(const mesh of meshes) {
        if(!mesh.isInstancedMesh || !mesh.receiveShadow)continue;
        // Unlike the nearby trunk and stones, a high leaf blocks only a small
        // portion of the sky. Spread its contribution over a much wider area.
        const shape=mesh.geometry;
        if(!shape.boundingSphere)shape.computeBoundingSphere();
        for(let i=0;i<mesh.count;i++){
            mesh.getMatrixAt(i,instance);instance.premultiply(mesh.matrixWorld);
            anchor.copy(shape.boundingSphere.center).applyMatrix4(instance);
            if(anchor.y<1.65 || anchor.y>12)continue;
            const j=pixel(anchor.x,anchor.z);
            if(j<0)continue;
            const span=shape.boundingSphere.radius*instance.getMaxScaleOnAxis()*scale;
            foliage[j]=Math.min(1,foliage[j]+Math.min(1,span*span*.12));
        }
    }
    // Separable box kernels keep cost at O(texture area) for any penumbra width.
    function soften(field,radius) {
        const axis=new Float32Array(pixels),result=new Float32Array(pixels);
        const width=2*radius+1;
        for(let row=0;row<size;row++){
            const offset=row*size;
            let sum=0;
            for(let x=0;x<size+radius;x++){
                if(x<size)sum+=field[offset+x];
                if(x>=width)sum-=field[offset+x-width];
                if(x>=radius)axis[offset+x-radius]=sum/width;
            }
        }
        for(let x=0;x<size;x++){
            let sum=0;
            for(let y=0;y<size+radius;y++){
                if(y<size)sum+=axis[y*size+x];
                if(y>=width)sum-=axis[(y-width)*size+x];
                if(y>=radius)result[(y-radius)*size+x]=sum/width;
            }
        }
        return result;
    }
    const near=soften(footing,1),far=soften(near,3),canopy=soften(soften(foliage,3),5);
    const data=new Uint8Array(pixels*4);
    for(let i=0;i<pixels;i++){
        data[i*4]=Math.min(255,Math.round(255*(near[i]*.70+far[i]*1.25)));
        data[i*4+1]=Math.min(255,Math.round(255*canopy[i]*3.3));data[i*4+3]=255;
    }
    const texture=new T.DataTexture(data,size,size,T.RGBAFormat);
    texture.name='地面的环境遮蔽';
    texture.magFilter=texture.minFilter=T.LinearFilter;
    texture.needsUpdate=true;
    return texture;
}

// Apply the scene lighting after each animated material has installed its own shader hooks.
export function finishPaper(T, scene) {
    const seen=new Set(),meshes=[];
    scene.updateMatrixWorld(true);
    function collect(object) {
        if(!object.visible || object.userData.ownPaperFinish)return;
        if(object.isMesh) {
            const material=Array.isArray(object.material)?object.material:[object.material];
            if(material.some(m=>m.visible && (m.isMeshLambertMaterial || m.isMeshStandardMaterial)))meshes.push(object);
        }
        for(const child of object.children)collect(child);
    }
    collect(scene);
    for(const object of meshes){
        const materials=Array.isArray(object.material)?object.material:[object.material];
        if(materials.some(m=>!m.transparent)){object.castShadow=true;object.receiveShadow=true;}
    }
    const occlusion=groundOcclusion(T,meshes);
    for(const object of meshes){
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
            if (!material.isMeshLambertMaterial && !material.isMeshStandardMaterial) continue;
            if (seen.has(material)) continue;
            seen.add(material);
            const previous=material.onBeforeCompile, key=material.customProgramCacheKey();
            material.customProgramCacheKey=()=>key+'|anime-cel-contact-v1';
            material.onBeforeCompile = function(shader,renderer){
                previous.call(this,shader,renderer);
                shader.fragmentShader=celLighting(T,shader.fragmentShader);
                shader.uniforms.groundContactMap = {value:occlusion};
                shader.vertexShader = shader.vertexShader.replace('#include <common>',
                    '#include <common>\nvarying vec3 stockPoint;')
                    .replace('#include <project_vertex>',`#include <project_vertex>
                      vec4 stockVertex=vec4(transformed,1.0);
                      #ifdef USE_INSTANCING
                      stockVertex=instanceMatrix*stockVertex;
                      #endif
                      stockPoint = (modelMatrix * stockVertex).xyz;`);
                shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
                    '#include <common>\nuniform sampler2D groundContactMap; varying vec3 stockPoint;')
                    .replace('#include <aomap_fragment>',`#include <aomap_fragment>
                      if(stockPoint.y<2.4 && max(abs(stockPoint.x),abs(stockPoint.z))<26.){
                          vec2 contact=texture2D(groundContactMap,stockPoint.xz/52.+.5).rg;
                          float footing=contact.r*(1.-smoothstep(.035,.87,stockPoint.y));
                          float leaves=contact.g*(1.-smoothstep(.4,2.4,stockPoint.y));
                          reflectedLight.indirectDiffuse *= (1.-.60*footing)*(1.-.42*leaves);
                      }`);
            };
        }
    }
    return {dispose(){occlusion.dispose();}};
}
