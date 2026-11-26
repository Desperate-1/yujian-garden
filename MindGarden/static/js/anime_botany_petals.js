const treesByScene=new WeakMap();

export function markFloweringTree(tree){
    let scene=tree;
    while(scene.parent)scene=scene.parent;
    if(!scene.isScene)return;
    if(!treesByScene.has(scene))treesByScene.set(scene,[]);
    treesByScene.get(scene).push({x:tree.position.x,z:tree.position.z,size:tree.scale.x});
}

// A falling cherry petal is creased and has a notch at its tip. The same
// mesh can turn edge-on or catch the sun when it rolls down the street.
export function driftingPetals(T,scene,palette){
    const emitters=treesByScene.get(scene)??[];
    const near=emitters.filter(({x,z})=>Math.abs(x)<21&&z>-23&&z<25);
    const trees=near.length?near:emitters;
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(
        [0,-.55,.03,-.26,-.18,.09,-.34,.18,.13,-.20,.43,.10,-.045,.47,.09,
         .018,.34,.10,.13,.45,.14,.30,.37,.13,.38,.12,.05,.22,-.21,.01,.013,-.02,-.09],3));
    g.setIndex([0,10,1,1,10,2,2,10,3,3,10,4,4,10,5,5,10,6,6,10,7,7,10,8,8,10,9,9,10,0]);
    g.computeVertexNormals();
    const m=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide});
    const total=Math.min(85,trees.length*8),curves=[];
    const petals=new T.InstancedMesh(g,m,total);
    petals.name='掠过街巷的落樱';
    petals.instanceMatrix.setUsage(T.DynamicDrawUsage);petals.frustumCulled=false;
    const rose=new T.Color(palette.blossom??'#efa7ba'),ivory=new T.Color(palette.paper);
    const b=new T.Color(),p=new T.Object3D();
    let seed=748321;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<total;i++){
        const tree=trees[i%trees.length],yaw=random()*Math.PI*2;
        const r=tree.size*(.57+random()*.75),cycle=7+random()*5;
        curves.push({x:tree.x+Math.cos(yaw)*r,z:tree.z+Math.sin(yaw)*r,y:tree.size*(2.6+random()*1.34),
            offset:random(),cycle,roll:random()*9,drift:.46+random()*.66,width:.047+.035*random()});
        petals.setColorAt(i,b.copy(rose).lerp(ivory,.27+random()*.61));
    }
    scene.add(petals);
    return {
        update(time,reduced){
            petals.visible=!reduced;
            if(reduced)return;
            curves.forEach((c,i)=>{
                const f=(time/c.cycle+c.offset)%1;
                const t=f*Math.PI*2+c.roll;
                const size=c.width*Math.min(1,f*14,(1-f)*12);
                const flutter=.24*Math.sin(t*2.3)+.11*Math.sin(t*4.1);
                p.position.set(c.x+f*2.6*c.drift+flutter,
                    c.y*(1-f)+.10*Math.sin(t*2.1),c.z-f*.63*c.drift+.28*Math.cos(t*1.7));
                p.rotation.set(t*1.35,c.roll-t*1.7,.67*Math.sin(t));
                p.scale.setScalar(Math.max(0,size));p.updateMatrix();petals.setMatrixAt(i,p.matrix);
            });
            petals.instanceMatrix.needsUpdate=true;
        },
        dispose(){
            scene.remove(petals);g.dispose();m.dispose();petals.dispose();treesByScene.delete(scene);
        }
    };
}
