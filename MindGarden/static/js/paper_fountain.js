import { sculptLotusPool } from './paper_lotus.js';

/* A folded water lily, built around a real hollow pool. Every face and every
   cut edge uses one of the five scene inks, including the moving water. */
export function buildFountain(THREE, scene, palette) {
    const turn = Math.PI * 2;
    const sides = 64;
    const waterY = 0.66;
    const waterRadius = 2.83;
    const rootRadius = 0.69;
    const { paper, leaf, sky } = palette;
    const group = new THREE.Group();
    group.name = '折纸水莲喷泉';
    scene.add(group);

    const inks = new Map();
    function color(inkName) {
        if (!inks.has(inkName)) inks.set(inkName, new THREE.Color(inkName));
        return inks.get(inkName);
    }

    const faceMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const stockMaterial = new THREE.MeshLambertMaterial({ vertexColors:true, side:THREE.DoubleSide });
    const waterMaterial = new THREE.ShaderMaterial({
        side:THREE.DoubleSide, transparent:true, depthWrite:false, forceSinglePass:true,
        uniforms:{water:{value:color(sky)},leaf:{value:color(leaf)},paper:{value:color(paper)},clock:{value:0}},
        vertexShader:`varying vec2 pond;varying vec3 sight;void main(){
                pond=position.xz;sight=cameraPosition-(modelMatrix*vec4(position,1.)).xyz;
                gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
            }`,
        fragmentShader:`uniform vec3 water,leaf,paper;uniform float clock;varying vec2 pond;varying vec3 sight;
            void main(){
                float radius=length(pond);
                float wave=sin(pond.y*22.+2.4*sin(pond.x*3.+clock*.5)+clock*.85);
                float fleck=sin(pond.x*6.3+pond.y*2.4+sin(pond.y*6.-clock*.31));
                float glint=smoothstep(.80,.99,wave)*smoothstep(.42,.91,fleck);
                float shade=.055+.17*smoothstep(1.65,2.83,radius)+.04*sin(pond.y*4.+pond.x*2.);
                vec3 base=mix(water,leaf,shade);
                float grazing=pow(1.-abs(normalize(sight).y),2.);
                gl_FragColor=vec4(mix(base,paper,.065+.060*grazing+.36*glint),.59+.19*grazing+.18*glint);
                #include <colorspace_fragment>
            }`
    });
    const geometries = [];
    function batch() { return { positions: [], colors: [] }; }
    function triangle(batch, a, b, c, paint) {
        batch.positions.push(...a, ...b, ...c);
        const { r, g, b: blue } = color(paint);
        batch.colors.push(r, g, blue, r, g, blue, r, g, blue);
    }
    function quad(batch, a, b, c, d, paint) {
        triangle(batch, a, b, c, paint);
        triangle(batch, a, c, d, paint);
    }
    function meshFrom(batch, name) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(batch.colors, 3));
        geometries.push(geometry);
        const mesh = new THREE.Mesh(geometry, faceMaterial);
        mesh.name = name;
        group.add(mesh);
        return mesh;
    }
    function polar(radius, y, angle, sideways = 0) {
        return [
            radius * Math.cos(angle) - sideways * Math.sin(angle), y,
            radius * Math.sin(angle) + sideways * Math.cos(angle)
        ];
    }

    const carving = sculptLotusPool(THREE, palette);
    geometries.push(carving.geometry);
    const occludingBody = new THREE.Mesh(carving.geometry,stockMaterial);
    occludingBody.name = '镂刻石池与重瓣水莲';
    occludingBody.castShadow = true;
    group.add(occludingBody);
    const surfaceGeometry = new THREE.RingGeometry(rootRadius, waterRadius, sides);
    surfaceGeometry.rotateX(-Math.PI / 2);
    geometries.push(surfaceGeometry);
    const waterTarget = new THREE.Mesh(surfaceGeometry, waterMaterial);
    waterTarget.name = '池水';
    waterTarget.position.y = waterY;
    group.add(waterTarget);

    // Short interrupted lines, like cuts left in a woodblock, give still water
    // a surface at every camera angle.
    const engraving = batch();
    for (let i = 0; i < 17; i++) {
        const start = i * 2.402, length = 0.14 + 0.16 * (0.5 + 0.5 * Math.sin(i * 3.4));
        const radius = 0.86 + 1.58 * ((i * 7 % 17) / 17);
        for (let j = 0; j < 9; j++) {
            const a = start + length * j / 9, b = start + length * (j + 1) / 9;
            const near = radius + 0.016 * Math.sin(j / 9 * Math.PI);
            const far = radius + 0.016 * Math.sin((j + 1) / 9 * Math.PI);
            quad(engraving, polar(radius, waterY + 0.004, a), polar(near, waterY + 0.004, a),
                polar(far, waterY + 0.004, b), polar(radius, waterY + 0.004, b), i % 4 ? paper : leaf);
        }
    }
    meshFrom(engraving, '水面刻痕');

    // Continuous three-sided paper ribbons follow gravity curves in space.
    // Their two printed faces stay legible in silhouette and from the side.
    const jets = [];
    function jet(angle, fromR, fromY, toR, toY, lift, width, twist) {
        jets.push({ angle, fromR, fromY, toR, toY, lift, width, twist });
    }
    carving.outerMouths.forEach(({angle,r,y}, i) => {
        jet(angle,r,y,2.01+.12*Math.sin(i*1.8),waterY,.20+i%2*.085,.027+i%3*.003,.08);
    });
    carving.innerMouths.forEach(({angle,r,y}, i) => {
        jet(angle,r,y,.88+.06*Math.cos(i),1.83,.115,.017,-.041);
    });
    carving.seedMouths.forEach(({angle,r,y}, i) => {
        jet(angle,r,y,.39+.05*Math.sin(i),2.59,.52+.13*Math.cos(i*2.1),.017,.038);
    });
    function onStream(jet, t) {
        const curve = Math.sin(Math.PI * t);
        const r = jet.fromR + (jet.toR - jet.fromR) * t;
        const y = jet.fromY + (jet.toY - jet.fromY) * t + jet.lift * 4 * t * (1 - t);
        return polar(r, y, jet.angle, jet.twist * curve);
    }
    const streams = batch();
    for (const jet of jets) {
        function section(t) {
            const [x, y, z] = onStream(jet, t);
            const w = jet.width * (1 - 0.40 * t);
            const dx = Math.cos(jet.angle) * w, dz = Math.sin(jet.angle) * w;
            return [[x - dz, y, z + dx], [x + dz, y, z - dx], [x + dx * 0.42, y - w, z + dz * 0.42]];
        }
        let before = section(0);
        for (let j = 1; j <= 24; j++) {
            const after = section(j / 24);
            for (let k = 0; k < 3; k++) {
                const n = (k + 1) % 3;
                quad(streams, before[k], before[n], after[n], after[k], k === 2 ? sky : paper);
            }
            before = after;
        }
    }
    const streamMesh=meshFrom(streams, '弯折水束');
    // Give the airy silhouette a comfortable target at a distance. At the pool
    // actual water, stone and streams are intersected separately.
    const hitGeometry=new THREE.CylinderGeometry(.71,1.12,2.65,16);
    geometries.push(hitGeometry);
    const flowerTarget=new THREE.Mesh(hitGeometry,faceMaterial);
    flowerTarget.position.y=2.12;
    flowerTarget.visible=false;
    group.add(flowerTarget);
    // A cut teardrop follows its water arc with its narrow end trailing behind.
    const dropletProfile=[ [0,-1.06],[.55,-.88],[.88,-.46],[.92,-.06],[.70,.40],[.29,.97],[0,1.47] ];
    const dropletGeometry = new THREE.LatheGeometry(dropletProfile.map(([r,y])=>new THREE.Vector2(r,y)),8);
    geometries.push(dropletGeometry);
    const dropletMaterial = new THREE.MeshBasicMaterial({ color: paper });
    const streamDrops = jets.length * 3;
    const dropCount = streamDrops + 16;
    const drops = new THREE.InstancedMesh(dropletGeometry, dropletMaterial, dropCount);
    drops.name = '沿水束落下的亮片';
    drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(drops);
    const transform = new THREE.Object3D();
    const vertical = new THREE.Vector3(0,1,0), trail = new THREE.Vector3();

    // All wakes share one draw call. Discard each small arc crossing the
    // pedestal or the edge of this particular polygonal pool.
    const wakes = [], maxWakes = 10, ringParts = 36, layers = 2;
    const ringBuffer = new Float32Array((maxWakes * layers + 8) * ringParts * 6 * 3);
    const ringGeometry = new THREE.BufferGeometry();
    const ringAttr = new THREE.BufferAttribute(ringBuffer, 3).setUsage(THREE.DynamicDrawUsage);
    ringGeometry.setAttribute('position', ringAttr);
    ringGeometry.setDrawRange(0, 0);
    geometries.push(ringGeometry);
    const ringMat = new THREE.MeshBasicMaterial({ color: paper, side: THREE.DoubleSide });
    const rings = new THREE.Mesh(ringGeometry, ringMat);
    rings.frustumCulled = false;
    rings.name = '水滴与指尖的涟漪';
    group.add(rings);
    let reduced = false, lastTime = -1;
    let lastTouch = null;

    function onWater(x, z) {
        const r2 = x * x + z * z;
        if (r2 < (rootRadius + 0.018) ** 2 || r2 > waterRadius ** 2) return false;
        if (r2 < (waterRadius * Math.cos(Math.PI / sides) - 0.012) ** 2) return true;
        const angle = Math.atan2(z, x);
        const halfEdge = Math.PI / sides;
        const offset = ((angle % (halfEdge * 2)) + halfEdge * 2) % (halfEdge * 2) - halfEdge;
        return Math.sqrt(r2) * Math.cos(offset) < waterRadius * Math.cos(halfEdge) - 0.012;
    }

    function ripple(point, time) {
        if (!point || !Number.isFinite(time) || !onWater(point.x, point.z)) return false;
        if (lastTouch && time - lastTouch.time < 0.15 &&
            Math.hypot(point.x - lastTouch.x, point.z - lastTouch.z) < 0.28) return false;
        lastTouch = { x: point.x, z: point.z, time };
        if (wakes.length >= maxWakes) wakes.shift();
        wakes.push(lastTouch);
        return true;
    }
    function updateWater(time, still) {
        // Static droplets are placed deliberately apart in reduced motion.
        const phase = still ? 0.31 : time;
        if (!still || !reduced || lastTime < 0) {
            for (let i = 0; i < streamDrops; i++) {
                const j = Math.floor(i / 3), jet = jets[j];
                const t = (phase * (0.81 + 0.06 * Math.sin(j)) + i / 3 + j * 0.373) % 1;
                const [x, y, z] = onStream(jet, t);
                transform.position.set(x, y, z);
                const radial=jet.toR-jet.fromR, sideways=jet.twist*Math.PI*Math.cos(t*Math.PI);
                const ca=Math.cos(jet.angle),sa=Math.sin(jet.angle);
                trail.set(-radial*ca+sideways*sa,jet.fromY-jet.toY-4*jet.lift*(1-2*t),-radial*sa-sideways*ca).normalize();
                transform.quaternion.setFromUnitVectors(vertical,trail);
                const radius = jet.width * (.86 + .46*t);
                transform.scale.set(radius, radius * (1.18 + .42*t), radius);
                transform.updateMatrix();
                drops.setMatrixAt(i, transform.matrix);
            }
            for (let i = 0; i < 16; i++) {
                const jet = jets[i % 8];
                const t = (phase * 1.4 + i * 0.369) % 1;
                const angle = jet.angle + (i < 8 ? 0.75 : -0.96);
                const [x, , z] = polar(jet.toR, waterY, jet.angle);
                const radius = 0.013 + 0.018 * Math.sin(t * Math.PI);
                transform.position.set(x + 0.22 * t * Math.cos(angle),
                    waterY + 0.02 + 0.58 * t * (1 - t), z + 0.22 * t * Math.sin(angle));
                trail.set(-.22*Math.cos(angle),-.58*(1-2*t),-.22*Math.sin(angle)).normalize();
                transform.quaternion.setFromUnitVectors(vertical,trail);
                transform.scale.set(radius, radius * 1.28, radius);
                transform.updateMatrix();
                drops.setMatrixAt(streamDrops + i, transform.matrix);
            }
            drops.instanceMatrix.needsUpdate = true;
            // The static bound must include the full arc even when all current
            // droplets happen to lie lower than its highest crest.
            if (!drops.boundingSphere) drops.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.9, 0), 3.3);
        }
        const wakeLife = still ? 0.50 : 1.30;
        while (wakes.length && time - wakes[0].time >= wakeLife) wakes.shift();
        let cursor = 0;
        function ring(x, z, radius, width, y, rotation) {
            function corner(angle, r) { return [x + Math.cos(angle) * r, y, z + Math.sin(angle) * r]; }
            for (let i = 0; i < ringParts; i++) {
                const a = rotation + turn * i / ringParts, b = a + turn / ringParts;
                const p = corner(a, radius), q = corner(b, radius);
                if (!onWater(p[0], p[2]) || !onWater(q[0], q[2])) continue;
                const n = corner(a, radius - width), m = corner(b, radius - width);
                if (!onWater(n[0], n[2]) || !onWater(m[0], m[2])) continue;
                for (const vertex of [p, q, m, p, m, n]) {
                    ringBuffer[cursor++] = vertex[0]; ringBuffer[cursor++] = y; ringBuffer[cursor++] = vertex[2];
                }
            }
        }
        for (let i = 0; i < 8; i++) {
            const jet = jets[i];
            const [x, , z] = polar(jet.toR, waterY, jet.angle);
            const age = (phase * 0.75 + i * 0.143) % 1;
            ring(x, z, 0.05 + 0.23 * age, 0.004 + 0.019 * (1-age), waterY + 0.01, i);
        }
        for (const wake of wakes) {
            const age = still ? 0.35 : Math.max(0, (time - wake.time) / wakeLife);
            const radius = 0.07 + 0.58 * age;
            ring(wake.x, wake.z, radius, 0.004 + 0.026 * (1-age), waterY + 0.017, 0);
            if (age > 0.14) ring(wake.x, wake.z, radius * 0.64, 0.003 + 0.014 * (1-age), waterY + 0.018, 0.24);
        }
        ringGeometry.setDrawRange(0, cursor / 3);
        ringAttr.needsUpdate = true;
    }

    function update(timeSeconds, reducedMotion = false) {
        waterMaterial.uniforms.clock.value = reducedMotion ? 0 : timeSeconds;
        updateWater(timeSeconds, reducedMotion);
        reduced = reducedMotion;
        lastTime = timeSeconds;
    }
    function dispose() {
        group.removeFromParent();
        for (const geometry of geometries) geometry.dispose();
        drops.dispose();
        faceMaterial.dispose(); stockMaterial.dispose(); waterMaterial.dispose(); dropletMaterial.dispose(); ringMat.dispose();
    }

    update(0);
    return { waterTarget, solids:[occludingBody,streamMesh,flowerTarget], gildedRim:carving.gildedRim, gildedFlower:carving.gildedFlower, update, ripple, dispose };
}
