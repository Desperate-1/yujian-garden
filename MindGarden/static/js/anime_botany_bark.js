const materials=new WeakMap();

export function cherryBark(kit){
    if(materials.has(kit))return materials.get(kit);
    const {T}=kit;
    const texture=typeof document==='undefined'?new T.Texture():
        new T.TextureLoader().load(new URL('../garden/botany/cherry-bark.webp',import.meta.url).href);
    texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
    texture.wrapS=texture.wrapT=T.RepeatWrapping;
    const material=new T.MeshLambertMaterial({name:'樱木横纹与皮孔',map:texture,vertexColors:true,
        color:0xfff8f7,emissive:0x766367,emissiveMap:texture,emissiveIntensity:.19,side:T.DoubleSide});
    materials.set(kit,material);return material;
}

export function releaseBark(kit){
    const material=materials.get(kit);
    if(material){material.map.dispose();material.dispose();materials.delete(kit);}
}

export function barkSurface(kit,parent){
    const {T,mesh,ink}=kit,positions=[],normals=[],uvs=[],colors=[];
    return {
        vertex(p,n,u,v,value=1){
            positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);
            uvs.push(u,v);colors.push(value,value,value);
        },
        finish(){
            if(!positions.length)return;
            const g=new T.BufferGeometry();
            g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
            g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
            g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
            g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
            mesh(parent,g,ink).material=cherryBark(kit);
        }
    };
}
