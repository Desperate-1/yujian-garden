// Backlight comes from the printed sky. A broad reflection from the facing
// page keeps the fronts of buildings and the insides of folded leaves legible.
const daylight = {
    cute:  {height:17.0, side:1.95, back:4.3, key:2.76, sky:1.25, bounce:.62, fog:[37,115]},
    fresh: {height:25, side:1.45, back:5.8, key:2.54, sky:1.35, bounce:.48, fog:[40,120]},
    ugly:  {height:17, side:1.42, back:14.8, key:1.28, sky:.90, bounce:.30, fog:[26,84]}
};

export function lightGarden(T,scene,renderer,palette,theme) {
    const profile=daylight[theme] || daylight.cute;
    const night=theme==='ugly',noon=theme==='fresh';
    const white=new T.Color(0xffffff);
    const ink=new T.Color(palette.ink),sky=new T.Color(palette.sky);
    const paper=new T.Color(palette.paper),leaf=new T.Color(palette.leaf),gold=new T.Color(palette.gold);
    const daylightColor=paper.clone().lerp(noon ? sky : gold,noon ? .07 : .16).lerp(white,noon ? .49 : .40);
    const moonlightColor=sky.clone().lerp(white,.73);
    const key=new T.DirectionalLight(night?moonlightColor:daylightColor,profile.key);
    key.name='穿过树冠的天光';
    key.castShadow=true;
    key.target.position.set(0,.6,0);
    const size=Math.min(2048,renderer.capabilities.maxTextureSize);
    key.shadow.mapSize.set(size,size);
    Object.assign(key.shadow.camera,{left:-24,right:24,top:21,bottom:-23,near:1,far:98});
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias=-.00023;
    key.shadow.normalBias=.018;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate=false;
    renderer.shadowMap.needsUpdate=true;

    const skylight=new T.HemisphereLight(
        sky.clone().lerp(white,night ? .32 : .46),
        ink.clone().lerp(paper,night ? .20 : .38),
        profile.sky);
    skylight.name='天空与草地反射';
    const bounce=new T.DirectionalLight(
        paper.clone().lerp(night ? sky : white,night ? .32 : .38),profile.bounce);
    bounce.name='前景纸面反光';
    bounce.position.set(-14,8,24);
    scene.add(key,key.target,skylight,bounce);
    scene.background=sky.clone();
    scene.fog=new T.Fog(sky,...profile.fog);

    const direction=new T.Vector3();
    function follow(position) {
        // Project the sky card onto the upper, rear hemisphere of the diorama.
        // Longitude and elevation stay continuous, including across the centre.
        const height=profile.height+.90*(position.y-13.6);
        direction.set(position.x*profile.side,height,position.z*profile.back/34);
        key.position.copy(direction.normalize().multiplyScalar(46)).add(key.target.position);
    }
    follow(direction.set(10.6,13.6,-34));
    return {follow,dispose(){
        key.shadow.dispose();
        scene.remove(key,key.target,skylight,bounce);
    }};
}
