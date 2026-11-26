// Bend the same fold in both the colour and the shadow pass. Working around the
// petiole keeps the leaf attached to its twig, even when it is also being brushed.
export function leafBreeze(T,stock){
    const clock={value:0}, strength={value:0};
    const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide});
    const deformation=`
        uniform float groveTime;
        uniform float groveWind;
        mat2 leafRotation(float angle){
            float c=cos(angle),s=sin(angle);
            return mat2(c,s,-s,c);
        }
        vec2 leafSwing(vec3 anchor){
            float front=.58*anchor.x-.28*anchor.z-1.60*groveTime;
            float gust=sin(front)+.42*sin(front*.49+.27*anchor.y-.65);
            float flicker=sin(groveTime*3.12+dot(anchor,vec3(1.31,2.53,.83)));
            vec3 drift=vec3(.88,0.,-.46);
            return groveWind*(gust*.057+flicker*.017)*vec2(
                dot(normalize(instanceMatrix[0].xyz),drift),
                dot(normalize(instanceMatrix[2].xyz),drift));
        }`;
    for(const material of [stock,depth]){
        material.customProgramCacheKey=()=> 'paper-leaf-breeze-v1';
        material.onBeforeCompile=shader=>{
            shader.uniforms.groveTime=clock;shader.uniforms.groveWind=strength;
            shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+deformation)
                .replace('#include <begin_vertex>',`#include <begin_vertex>
                    vec2 swing=leafSwing(instanceMatrix[3].xyz);
                    transformed.xy=leafRotation(-swing.x)*transformed.xy;
                    transformed.yz=leafRotation(swing.y)*transformed.yz;`)
                .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
                    vec2 normalSwing=leafSwing(instanceMatrix[3].xyz);
                    objectNormal.xy=leafRotation(-normalSwing.x)*objectNormal.xy;
                    objectNormal.yz=leafRotation(normalSwing.y)*objectNormal.yz;`);
        };
    }
    return {depth,update(time,reduced){clock.value=reduced?0:time;strength.value=reduced?0:1;},dispose(){depth.dispose();}};
}
