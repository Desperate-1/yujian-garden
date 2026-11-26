// Keep the real light directions, animated shadow maps and vertex paint.
// Broad lit planes and a short transition at the terminator read like painted cels.
export function celLighting(T,source){
    const lambert=T.ShaderChunk.lights_lambert_pars_fragment.replace(
        'vec3 irradiance = dotNL * directLight.color;',
        `float band = .43*smoothstep(.06,.24,dotNL) + .34*smoothstep(.43,.61,dotNL)
                    + .15*smoothstep(.78,.94,dotNL) + .12*dotNL;
         vec3 irradiance = band * directLight.color;`);
    return source.replace('#include <lights_lambert_pars_fragment>',lambert)
        .replace('#include <opaque_fragment>',`
            float edge=1.-abs(dot(normal,normalize(vViewPosition)));
            float silhouette=smoothstep(.71,.96,edge);
            #if NUM_DIR_LIGHTS > 0
                float backlit=smoothstep(-.10,.65,dot(normal,directionalLights[0].direction));
                outgoingLight*=1.-.16*silhouette*(1.-backlit);
                outgoingLight+=(diffuseColor.rgb*.20+vec3(.031,.023,.016))*silhouette*backlit;
            #endif
            #include <opaque_fragment>`);
}
