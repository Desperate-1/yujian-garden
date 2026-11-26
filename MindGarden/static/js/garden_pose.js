/* Browser-local pose tracking + articulated Three.js buddies.
 *
 * 角色是"程序化木偶"：不用外部模型文件，关键点坐标直接映射到几何体，
 * 所以任何角色都天然会跟着人动。新增角色 = 写一个 buildXxx() 并在
 * CHARACTERS 里登记。
 *
 * 三只舞伴：
 *   bear 豆豆（小熊）    可爱风默认
 *   blob 歪歪（小怪兽）  丑萌风默认 —— jellycat 式：不对称眼睛、歪斜、笨拙
 *   deer 芽芽（小鹿）    清新风默认
 */
import * as THREE from '../vendor/mediapipe/three.module.js';

const modal = document.getElementById('bearMirrorModal');
const openButton = document.getElementById('openBearMirror');
const closeButton = document.getElementById('closeBearMirror');
const startButton = document.getElementById('startCamera');
const stopButton = document.getElementById('stopCamera');
const video = document.getElementById('gardenCamera');
const overlay = document.getElementById('poseOverlay');
const placeholder = document.getElementById('cameraPlaceholder');
const statusEl = document.getElementById('poseStatus');
const badge = document.getElementById('trackingBadge');
const hint = document.getElementById('bearHint');
const stage = document.getElementById('bearStage');
const canvas = document.getElementById('bearCanvas');
const idleFallback = document.getElementById('bearIdleFallback');
const followLabel = document.getElementById('buddyFollowLabel');

if (!modal || !canvas) {
  // This bundle is only loaded on the garden page.
  console.warn('[GardenPose] required elements missing; skip initialization.');
} else {
  const POSE_WASM = '/static/vendor/mediapipe/wasm';
  const POSE_MODEL = '/static/models/pose_landmarker_lite.task';
  const mpModule = '/static/vendor/mediapipe/vision_bundle.mjs';

  const THEME = window.MG_THEME || document.documentElement.dataset.theme || 'cute';

  /* ================================================================
     角色工厂
     ================================================================ */

  // 每个角色的"可调节参数"：姿态映射逻辑共用，形体参数各管各
  const CHARACTERS = {
    bear: { name: '豆豆', kind: '小熊',   emoji: '🐻' },
    blob: { name: '歪歪', kind: '小怪兽', emoji: '🫠' },
    deer: { name: '芽芽', kind: '小鹿',   emoji: '🦌' },
  };

  // 三套风格的默认舞伴；用户手选后存 localStorage
  const THEME_DEFAULT_CHAR = { cute: 'bear', fresh: 'deer', ugly: 'blob' };

  function makeSphere(parentNode, material, scale, pos) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), material);
    mesh.scale.set(...scale);
    mesh.position.set(...pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parentNode.add(mesh);
    return mesh;
  }

  /* ---------- 豆豆 · 小熊（原有角色，完整保留） ---------- */
  function buildBear(parent) {
    const group = new THREE.Group();
    parent.add(group);

    const fur = new THREE.MeshStandardMaterial({ color: 0xb87946, roughness: 0.82 });
    const furLight = new THREE.MeshStandardMaterial({ color: 0xd99c63, roughness: 0.78 });
    const muzzleMat = new THREE.MeshStandardMaterial({ color: 0xf2d2a7, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x382a24, roughness: 0.45 });
    const innerEar = new THREE.MeshStandardMaterial({ color: 0xc8877b, roughness: 0.7 });
    const pawMat = new THREE.MeshStandardMaterial({ color: 0x9f603d, roughness: 0.82 });

    const torso = makeSphere(group, fur, [0.49, 0.68, 0.33], [0, 0.88, 0]);

    // 肚子上的浅色块必须挂在 torso 上，不能挂 group。
    // 挂 group 时它是固定世界坐标，躯干一动色块就留在原地 ——
    // 实测表现就是"动的时候肚子不跟着动"。
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), furLight);
    belly.scale.set(0.66, 0.60, 0.16);
    belly.position.set(0, -0.14, 0.80);
    torso.add(belly);

    const head = new THREE.Group();
    group.add(head);
    makeSphere(head, fur, [0.51, 0.48, 0.43], [0, 0, 0]);
    makeSphere(head, innerEar, [0.155, 0.17, 0.105], [-0.36, 0.35, 0.18]);
    makeSphere(head, innerEar, [0.155, 0.17, 0.105], [0.36, 0.35, 0.18]);
    makeSphere(head, fur, [0.21, 0.22, 0.19], [-0.36, 0.38, 0.04]);
    makeSphere(head, fur, [0.21, 0.22, 0.19], [0.36, 0.38, 0.04]);
    makeSphere(head, muzzleMat, [0.245, 0.19, 0.16], [0, -0.13, 0.36]);
    makeSphere(head, dark, [0.075, 0.06, 0.055], [0, -0.045, 0.51]);
    makeSphere(head, dark, [0.045, 0.055, 0.04], [-0.19, 0.055, 0.383]);
    makeSphere(head, dark, [0.045, 0.055, 0.04], [0.19, 0.055, 0.383]);
    makeSphere(head, new THREE.MeshBasicMaterial({ color: 0xffffff }), [0.013, 0.016, 0.01], [-0.203, 0.075, 0.416]);
    makeSphere(head, new THREE.MeshBasicMaterial({ color: 0xffffff }), [0.013, 0.016, 0.01], [0.177, 0.075, 0.416]);
    // A small smile curve gives the bear a soft expression.
    const smileCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.11, -0.2, 0.493),
      new THREE.Vector3(0, -0.285, 0.505),
      new THREE.Vector3(0.11, -0.2, 0.493)
    );
    head.add(new THREE.Mesh(new THREE.TubeGeometry(smileCurve, 16, 0.012, 6, false), dark));

    return {
      group, torso, head,
      meta: {
        boneColor: fur, jointColor: furLight,
        boneRadii: [0.13, 0.17],
        pawMat,
        pawHandScale: [0.17, 0.16, 0.16], pawFootScale: [0.2, 0.12, 0.27],
        torsoXZ: [0.49, 0.33], torsoLenClamp: [0.43, 0.9], torsoLenFactor: 0.55,
        headLift: 0.16, headTiltFactor: 1.25,
        limbWidth: { upperArm: 0.95, forearm: 0.84, thigh: 1.16, shin: 0.94 },
        color2d: '#b87946', color2dHead: '#b87946', color2dAccent: '#f0d2a7',
      },
    };
  }

  /* ---------- 歪歪 · 小怪兽（丑萌风，jellycat 式） ----------
     丑萌的要诀：不对称（一大一小的眼睛）、歪（整体微倾）、
     笨拙（短手短脚大肚子），但表情必须是善意的。 */
  function buildBlob(parent) {
    const group = new THREE.Group();
    group.rotation.z = -0.035;              // 永远的歪斜，站姿就不太正经
    parent.add(group);

    const body = new THREE.MeshStandardMaterial({ color: 0xa8a05e, roughness: 0.92 });
    const bodyLight = new THREE.MeshStandardMaterial({ color: 0xcfc48a, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 0.5 });
    const cheek = new THREE.MeshStandardMaterial({ color: 0x9c8bb8, roughness: 0.85 });
    const coral = new THREE.MeshStandardMaterial({ color: 0xc97b4a, roughness: 0.8 });
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xfdf8ec, roughness: 0.4 });

    // 矮胖梨形身子
    const torso = makeSphere(group, body, [0.60, 0.60, 0.42], [0, 0.82, 0]);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), bodyLight);
    belly.scale.set(0.68, 0.62, 0.16);
    belly.position.set(0, -0.12, 0.82);
    torso.add(belly);

    const head = new THREE.Group();
    group.add(head);
    // 头只是身体上的一个小鼓包（jellycat 娃娃几乎没有脖子）
    makeSphere(head, body, [0.37, 0.33, 0.31], [0, 0, 0]);
    // 不对称眼睛：左眼大右眼小，还不在一条水平线上
    makeSphere(head, dark, [0.085, 0.095, 0.06], [-0.16, 0.06, 0.27]);
    makeSphere(head, dark, [0.05, 0.058, 0.045], [0.15, 0.01, 0.285]);
    makeSphere(head, new THREE.MeshBasicMaterial({ color: 0xffffff }), [0.02, 0.024, 0.015], [-0.178, 0.095, 0.318]);
    makeSphere(head, new THREE.MeshBasicMaterial({ color: 0xffffff }), [0.013, 0.016, 0.01], [0.138, 0.04, 0.322]);
    // 紫色腮红
    makeSphere(head, cheek, [0.06, 0.035, 0.03], [-0.26, -0.09, 0.24]);
    makeSphere(head, cheek, [0.06, 0.035, 0.03], [0.25, -0.11, 0.24]);
    // 歪嘴微笑 + 一颗大门牙
    const smileCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.10, -0.14, 0.295),
      new THREE.Vector3(0.01, -0.23, 0.315),
      new THREE.Vector3(0.13, -0.15, 0.29)
    );
    head.add(new THREE.Mesh(new THREE.TubeGeometry(smileCurve, 16, 0.012, 6, false), dark));
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.02), toothMat);
    tooth.position.set(-0.02, -0.19, 0.30);
    head.add(tooth);
    // 头顶一根歪歪的天线，末端一个小球
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.34, 8), dark);
    antenna.position.set(0.05, 0.42, 0);
    antenna.rotation.z = -0.28;
    head.add(antenna);
    const antennaBall = makeSphere(head, coral, [0.06, 0.06, 0.06], [0.14, 0.58, 0]);
    antennaBall.castShadow = false;

    return {
      group, torso, head,
      meta: {
        boneColor: body, jointColor: bodyLight,
        boneRadii: [0.10, 0.13],
        pawMat: new THREE.MeshStandardMaterial({ color: 0x8b7b4f, roughness: 0.85 }),
        pawHandScale: [0.12, 0.11, 0.11], pawFootScale: [0.19, 0.10, 0.22],
        torsoXZ: [0.60, 0.42], torsoLenClamp: [0.46, 0.86], torsoLenFactor: 0.52,
        headLift: 0.24, headTiltFactor: 0.9,
        limbWidth: { upperArm: 0.9, forearm: 0.8, thigh: 1.0, shin: 0.85 },
        color2d: '#a8a05e', color2dHead: '#a8a05e', color2dAccent: '#cfc48a',
      },
    };
  }

  /* ---------- 芽芽 · 小鹿（清新风） ----------
     瘦高、轻盈；头顶不是鹿角而是两枝发芽的绿枝 —— 呼应"芽芽"。 */
  function buildDeer(parent) {
    const group = new THREE.Group();
    parent.add(group);

    const coat = new THREE.MeshStandardMaterial({ color: 0xd9c6a5, roughness: 0.85 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xf4ecdb, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.45 });
    const sprout = new THREE.MeshStandardMaterial({ color: 0x7fa08a, roughness: 0.7 });
    const hoofMat = new THREE.MeshStandardMaterial({ color: 0x6b5b45, roughness: 0.8 });

    // 瘦高的身子
    const torso = makeSphere(group, coat, [0.40, 0.64, 0.27], [0, 0.92, 0]);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), cream);
    belly.scale.set(0.58, 0.62, 0.15);
    belly.position.set(0, -0.10, 0.82);
    torso.add(belly);

    const head = new THREE.Group();
    group.add(head);
    makeSphere(head, coat, [0.38, 0.40, 0.34], [0, 0, 0]);
    // 吻部
    makeSphere(head, cream, [0.20, 0.15, 0.14], [0, -0.12, 0.30]);
    makeSphere(head, dark, [0.055, 0.045, 0.04], [0, -0.05, 0.42]);
    // 温柔的大眼睛（大高光）
    makeSphere(head, dark, [0.055, 0.07, 0.045], [-0.17, 0.05, 0.29]);
    makeSphere(head, dark, [0.055, 0.07, 0.045], [0.17, 0.05, 0.29]);
    makeSphere(head, new THREE.MeshBasicMaterial({ color: 0xffffff }), [0.02, 0.026, 0.014], [-0.185, 0.085, 0.325]);
    makeSphere(head, new THREE.MeshBasicMaterial({ color: 0xffffff }), [0.02, 0.026, 0.014], [0.155, 0.085, 0.325]);
    // 叶片状耳朵（压扁的椭球）
    const earL = makeSphere(head, coat, [0.10, 0.22, 0.05], [-0.30, 0.34, 0.02]);
    earL.rotation.z = 0.5;
    const earR = makeSphere(head, coat, [0.10, 0.22, 0.05], [0.30, 0.34, 0.02]);
    earR.rotation.z = -0.5;
    const innerL = makeSphere(head, cream, [0.055, 0.14, 0.03], [-0.285, 0.33, 0.06]);
    innerL.rotation.z = 0.5;
    const innerR = makeSphere(head, cream, [0.055, 0.14, 0.03], [0.285, 0.33, 0.06]);
    innerR.rotation.z = -0.5;
    // 头顶两枝嫩芽（细杆 + 小叶球）
    for (const side of [-1, 1]) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.30, 8), sprout);
      stem.position.set(side * 0.12, 0.46, 0);
      stem.rotation.z = side * -0.22;
      head.add(stem);
      const leaf1 = makeSphere(head, sprout, [0.07, 0.045, 0.03], [side * 0.19, 0.60, 0]);
      leaf1.rotation.z = side * -0.5;
      const leaf2 = makeSphere(head, sprout, [0.055, 0.04, 0.028], [side * 0.10, 0.62, 0.02]);
      leaf2.rotation.z = side * 0.4;
    }
    // 安静的微笑
    const smileCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.08, -0.16, 0.33),
      new THREE.Vector3(0, -0.21, 0.345),
      new THREE.Vector3(0.08, -0.16, 0.33)
    );
    head.add(new THREE.Mesh(new THREE.TubeGeometry(smileCurve, 16, 0.010, 6, false), dark));

    return {
      group, torso, head,
      meta: {
        boneColor: coat, jointColor: cream,
        boneRadii: [0.085, 0.11],
        pawMat: hoofMat,
        pawHandScale: [0.10, 0.12, 0.10], pawFootScale: [0.11, 0.14, 0.13],
        torsoXZ: [0.40, 0.27], torsoLenClamp: [0.46, 0.95], torsoLenFactor: 0.6,
        headLift: 0.22, headTiltFactor: 1.1,
        limbWidth: { upperArm: 0.85, forearm: 0.72, thigh: 0.95, shin: 0.78 },
        color2d: '#d9c6a5', color2dHead: '#d9c6a5', color2dAccent: '#f4ecdb',
      },
    };
  }

  const CHAR_BUILDERS = { bear: buildBear, blob: buildBlob, deer: buildDeer };

  /* ================================================================
     场景与渲染器
     ================================================================ */
  let renderer = null;
  let fallback2d = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    document.documentElement.dataset.garden3d = 'webgl';
    if (stage) stage.dataset.renderer = 'webgl';
    if (idleFallback) idleFallback.hidden = true;
  } catch (err) {
    // Some privacy modes/headless browsers disable WebGL. Do not let that disable
    // webcam pose tracking; a 2D buddy fallback still mirrors the detected joints.
    console.warn('[GardenPose] WebGL unavailable; use 2D pose puppet fallback', err);
    document.documentElement.dataset.garden3d = 'fallback';
    if (stage) stage.dataset.renderer = 'fallback';
    stage?.classList.add('bear-stage-fallback');
    if (idleFallback) idleFallback.hidden = false;
    try { fallback2d = canvas.getContext('2d'); } catch (_) { fallback2d = null; }
  }

  const scene = new THREE.Scene();
  const camera3d = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
  camera3d.position.set(0, 1.45, 8.4);
  camera3d.lookAt(0, 1.25, 0);

  /* 舞池灯光随风格微调：可爱暖、清新冷、丑萌像黄昏 */
  const THEME_LIGHTS = {
    cute:  { sky: 0xfff8e8, ground: 0x7b9c81, key: 0xfff1d5, rim: 0xc6e8d0 },
    fresh: { sky: 0xf4fff6, ground: 0x6f9c94, key: 0xf6fbff, rim: 0xbfe4da },
    ugly:  { sky: 0xfff0c8, ground: 0x8a7a52, key: 0xffe4b0, rim: 0xd0b8e0 },
  };
  const lights = THEME_LIGHTS[THEME] || THEME_LIGHTS.cute;
  scene.add(new THREE.HemisphereLight(lights.sky, lights.ground, 2.0));
  const keyLight = new THREE.DirectionalLight(lights.key, 3.2);
  keyLight.position.set(-3.5, 6, 5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(lights.rim, 1.35);
  rimLight.position.set(4, 2.8, -3);
  scene.add(rimLight);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2.0, 64),
    new THREE.MeshBasicMaterial({ color: 0x8aaf91, transparent: true, opacity: 0.25 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.76, 0);
  scene.add(ground);

  /* ================================================================
     角色实例管理（切换舞伴 = 拆掉旧木偶、拼新木偶）
     ================================================================ */
  let character = null;
  let charKind = null;
  let landmarker = null;
  let stream = null;
  let cameraRequest = 0;
  let rafId = 0;
  let lastVideoTime = -1;
  let lastDetectAt = 0;
  let running = false;
  let smoothed = null;

  function disposeCharacter(ch) {
    if (!ch) return;
    scene.remove(ch.group);
    ch.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
      }
    });
  }

  function assembleLimbs(ch) {
    const { meta } = ch;
    const limbParts = {};
    const jointParts = {};
    const boneGeometry = new THREE.CylinderGeometry(meta.boneRadii[0], meta.boneRadii[1], 1, 16, 1);
    const makeBone = (name) => {
      const mesh = new THREE.Mesh(boneGeometry, meta.boneColor);
      mesh.castShadow = true;
      ch.group.add(mesh);
      limbParts[name] = mesh;
    };
    const makeJoint = (name, radius = 0.17) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 16), meta.jointColor);
      mesh.castShadow = true;
      ch.group.add(mesh);
      jointParts[name] = mesh;
    };
    ['leftUpperArm','leftForearm','rightUpperArm','rightForearm',
     'leftThigh','leftShin','rightThigh','rightShin'].forEach(makeBone);
    ['leftShoulder','leftElbow','leftWrist','rightShoulder','rightElbow','rightWrist',
     'leftHip','leftKnee','leftAnkle','rightHip','rightKnee','rightAnkle'].forEach((n) => makeJoint(n));

    const paws = {};
    ['leftHand','rightHand','leftFoot','rightFoot'].forEach((n) => {
      const scale = n.endsWith('Foot') ? meta.pawFootScale : meta.pawHandScale;
      paws[n] = makeSphere(ch.group, meta.pawMat, scale, [0, -0.4, 0]);
    });
    ch.limbParts = limbParts;
    ch.jointParts = jointParts;
    ch.paws = paws;
  }

  function currentChoice() {
    let saved = null;
    try { saved = localStorage.getItem('mg_character'); } catch (_) { /* 隐私模式 */ }
    if (saved && CHAR_BUILDERS[saved]) return saved;
    return THEME_DEFAULT_CHAR[THEME] || 'bear';
  }

  function setCharacter(kind, announce) {
    if (!CHAR_BUILDERS[kind]) return;
    if (character) disposeCharacter(character);
    smoothed = null;                       // 换角色时姿态平滑缓存清零，避免瞬移
    character = CHAR_BUILDERS[kind](scene);
    assembleLimbs(character);
    charKind = kind;
    try { localStorage.setItem('mg_character', kind); } catch (_) { /* ignore */ }
    setIdlePose();
    if (fallback2d) drawFallbackCharacter(idleLandmarks);
    if (renderer) renderer.render(scene, camera3d);

    const info = CHARACTERS[kind];
    if (followLabel) followLabel.textContent = info.name + '正在跟随你';
    if (idleFallback) idleFallback.textContent = info.emoji;
    if (hint) hint.textContent = '打开摄像头后，' + info.name + '会尝试复刻你的身体姿势';
    document.querySelectorAll('.buddy-chip').forEach((chip) => {
      const on = chip.dataset.char === kind;
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (announce && statusEl && !running) {
      statusEl.textContent = '已换成' + info.kind + '「' + info.name + '」，打开摄像头一起跳吧';
    }
  }

  function resizeStage() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (renderer) renderer.setSize(rect.width, rect.height, false);
    else {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      if (fallback2d) fallback2d.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    camera3d.aspect = rect.width / rect.height;
    camera3d.updateProjectionMatrix();
  }
  new ResizeObserver(resizeStage).observe(stage);
  resizeStage();

  function point3(lm) {
    // Mirror the selfie view: user-right and buddy-right remain visually aligned.
    const visibility = lm.visibility == null ? 1 : lm.visibility;
    return {
      x: (0.5 - lm.x) * 3.75,
      y: (0.76 - lm.y) * 4.05,
      z: THREE.MathUtils.clamp(-((lm.z || 0) * 1.1), -0.48, 0.48),
      visibility
    };
  }

  function smoothPoint(key, target, alpha = 0.34) {
    if (!smoothed) smoothed = {};
    const old = smoothed[key] || target;
    const next = {
      x: THREE.MathUtils.lerp(old.x, target.x, alpha),
      y: THREE.MathUtils.lerp(old.y, target.y, alpha),
      z: THREE.MathUtils.lerp(old.z, target.z, alpha),
      visibility: target.visibility
    };
    smoothed[key] = next;
    return next;
  }

  function setJoint(name, p, radiusScale = 1) {
    const mesh = character.jointParts[name];
    const target = smoothPoint(name, p);
    mesh.position.set(target.x, target.y, target.z);
    mesh.scale.setScalar(THREE.MathUtils.clamp(radiusScale, 0.72, 1.28));
    return target;
  }

  function setPaw(name, p, rotation = 0) {
    const mesh = character.paws[name];
    const target = smoothPoint(name, p);
    mesh.position.set(target.x, target.y, target.z + 0.03);
    if (name.endsWith('Foot')) mesh.rotation.z = rotation;
    return target;
  }

  const yAxis = new THREE.Vector3(0, 1, 0);
  function setBone(name, a, b, width = 1) {
    const mesh = character.limbParts[name];
    const start = smoothPoint(name + 'A', a);
    const end = smoothPoint(name + 'B', b);
    const va = new THREE.Vector3(start.x, start.y, start.z);
    const vb = new THREE.Vector3(end.x, end.y, end.z);
    const dir = new THREE.Vector3().subVectors(vb, va);
    const length = Math.max(0.08, dir.length());
    mesh.position.copy(va).add(vb).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(yAxis, dir.normalize());
    mesh.scale.set(width, length, width);
  }

  function updateCharacter(landmarks) {
    if (!landmarks || landmarks.length < 29 || !character) return false;
    const meta = character.meta;
    const ids = [0,11,12,13,14,15,16,23,24,25,26,27,28];
    const p = {};
    for (const id of ids) {
      const lm = landmarks[id];
      if (!lm || (lm.visibility != null && lm.visibility < 0.28)) return false;
      p[id] = point3(lm);
    }
    const avg = (a,b) => ({ x:(a.x+b.x)/2, y:(a.y+b.y)/2, z:(a.z+b.z)/2, visibility:Math.min(a.visibility,b.visibility) });
    const shoulders = avg(p[11], p[12]);
    const hips = avg(p[23], p[24]);
    const torsoMid = avg(shoulders, hips);
    const bodyPoint = smoothPoint('torso', torsoMid);
    character.torso.position.set(bodyPoint.x, bodyPoint.y, bodyPoint.z);
    const torsoLength = Math.max(0.42, Math.hypot(shoulders.x-hips.x, shoulders.y-hips.y));
    character.torso.scale.set(
      meta.torsoXZ[0],
      THREE.MathUtils.clamp(torsoLength * meta.torsoLenFactor, meta.torsoLenClamp[0], meta.torsoLenClamp[1]),
      meta.torsoXZ[1]
    );
    character.torso.rotation.z = Math.atan2(hips.x-shoulders.x, shoulders.y-hips.y) * 0.55;

    const nose = p[0];
    const headPoint = smoothPoint('head', { x:nose.x, y:nose.y+meta.headLift, z:nose.z, visibility:nose.visibility });
    character.head.position.set(headPoint.x, headPoint.y, headPoint.z);
    character.head.rotation.z = THREE.MathUtils.clamp((p[11].y-p[12].y)*meta.headTiltFactor, -0.42, 0.42);

    const lw = meta.limbWidth;
    const Ls=p[11], Le=p[13], Lw=p[15], Rs=p[12], Re=p[14], Rw=p[16];
    setBone('leftUpperArm', Ls, Le, lw.upperArm); setBone('leftForearm', Le, Lw, lw.forearm);
    setBone('rightUpperArm', Rs, Re, lw.upperArm); setBone('rightForearm', Re, Rw, lw.forearm);
    setJoint('leftShoulder', Ls, .92); setJoint('leftElbow', Le, .84); setJoint('leftWrist', Lw, .76);
    setJoint('rightShoulder', Rs, .92); setJoint('rightElbow', Re, .84); setJoint('rightWrist', Rw, .76);
    setPaw('leftHand', Lw); setPaw('rightHand', Rw);

    const Lh=p[23], Lk=p[25], La=p[27], Rh=p[24], Rk=p[26], Ra=p[28];
    setBone('leftThigh', Lh, Lk, lw.thigh); setBone('leftShin', Lk, La, lw.shin);
    setBone('rightThigh', Rh, Rk, lw.thigh); setBone('rightShin', Rk, Ra, lw.shin);
    setJoint('leftHip', Lh, 1.02); setJoint('leftKnee', Lk, .91); setJoint('leftAnkle', La, .8);
    setJoint('rightHip', Rh, 1.02); setJoint('rightKnee', Rk, .91); setJoint('rightAnkle', Ra, .8);
    setPaw('leftFoot', La, Math.atan2(Lk.y-La.y, Lk.x-La.x));
    setPaw('rightFoot', Ra, Math.atan2(Rk.y-Ra.y, Rk.x-Ra.x));

    // Keep the detected figure centered in the 3D stage.
    const centerX = (p[11].x+p[12].x+p[23].x+p[24].x)/4;
    const centerY = (nose.y + Math.min(La.y, Ra.y))/2;
    character.group.position.x = THREE.MathUtils.lerp(character.group.position.x, -centerX * .16, .08);
    character.group.position.y = THREE.MathUtils.lerp(character.group.position.y, (0.9-centerY) * .10, .08);
    return true;
  }

  function makeIdleLandmarks() {
    const idle = Array.from({ length: 33 }, () => ({ x:.5, y:.5, z:0, visibility:1 }));
    Object.assign(idle[0], {x:.5,y:.19});
    Object.assign(idle[11], {x:.42,y:.31}); Object.assign(idle[12], {x:.58,y:.31});
    Object.assign(idle[13], {x:.36,y:.43}); Object.assign(idle[14], {x:.64,y:.43});
    Object.assign(idle[15], {x:.34,y:.55}); Object.assign(idle[16], {x:.66,y:.55});
    Object.assign(idle[23], {x:.46,y:.58}); Object.assign(idle[24], {x:.54,y:.58});
    Object.assign(idle[25], {x:.45,y:.76}); Object.assign(idle[26], {x:.55,y:.76});
    Object.assign(idle[27], {x:.44,y:.94}); Object.assign(idle[28], {x:.56,y:.94});
    return idle;
  }
  const idleLandmarks = makeIdleLandmarks();

  // Show a gentle idle pose before camera access is requested.
  function setIdlePose() {
    updateCharacter(idleLandmarks);
  }

  /* 2D 兜底木偶（WebGL 不可用时）：保留姿态跟随，造型从简 */
  function drawFallbackCharacter(landmarks) {
    if (!fallback2d || !character) return;
    const meta = character.meta;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    if (!W || !H) return;
    const ctx = fallback2d;
    ctx.clearRect(0, 0, W, H);
    const pt = (i) => ({ x:(1-landmarks[i].x)*W, y:landmarks[i].y*H });
    const thickSegment = (a,b,width,color) => {
      const A=pt(a), B=pt(b); ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y);
      ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle=color || meta.color2d; ctx.lineWidth=width; ctx.stroke();
      ctx.beginPath(); ctx.arc(A.x,A.y,width/2,0,Math.PI*2); ctx.arc(B.x,B.y,width/2,0,Math.PI*2); ctx.fillStyle=color || meta.color2d; ctx.fill();
    };
    thickSegment(11,13,W*.065); thickSegment(13,15,W*.052);
    thickSegment(12,14,W*.065); thickSegment(14,16,W*.052);
    thickSegment(23,25,W*.085); thickSegment(25,27,W*.065);
    thickSegment(24,26,W*.085); thickSegment(26,28,W*.065);
    const sh=pt(11), sh2=pt(12), hip=pt(23), hip2=pt(24), nose=pt(0);
    const bodyX=(sh.x+sh2.x+hip.x+hip2.x)/4, bodyY=(sh.y+hip.y)/2;
    ctx.fillStyle=meta.color2d; ctx.beginPath();
    ctx.ellipse(bodyX,bodyY,W*.095,Math.max(H*.12,Math.abs(hip.y-sh.y)*.48),0,0,Math.PI*2); ctx.fill();
    const headR=W*.073, hx=nose.x, hy=nose.y-H*.018;
    ctx.fillStyle=meta.color2dHead; ctx.beginPath(); ctx.arc(hx,hy,headR,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=meta.color2dAccent; ctx.beginPath();
    ctx.ellipse(hx,hy+headR*.28,headR*.47,headR*.31,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#382a24'; ctx.beginPath();
    ctx.arc(hx-headR*.32,hy,headR*.075,0,Math.PI*2);
    ctx.arc(hx+headR*.32,hy,headR*.075,0,Math.PI*2);
    ctx.arc(hx,hy+headR*.2,headR*.09,0,Math.PI*2); ctx.fill();
  }

  setCharacter(currentChoice(), false);

  const POSE_EDGES = [[11,13],[13,15],[12,14],[14,16],[11,12],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
  function drawPose(landmarks) {
    const ctx = overlay.getContext('2d');
    const width = video.videoWidth, height = video.videoHeight;
    if (!width || !height) return;
    if (overlay.width !== width || overlay.height !== height) { overlay.width=width; overlay.height=height; }
    ctx.clearRect(0,0,width,height);
    ctx.lineWidth = Math.max(2, width/320);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,245,210,.92)';
    for (const [a,b] of POSE_EDGES) {
      const p=landmarks[a], q=landmarks[b];
      if (!p || !q || (p.visibility||0)<.25 || (q.visibility||0)<.25) continue;
      ctx.beginPath(); ctx.moveTo(p.x*width,p.y*height); ctx.lineTo(q.x*width,q.y*height); ctx.stroke();
    }
    for (const i of [11,12,13,14,15,16,23,24,25,26,27,28]) {
      const p=landmarks[i]; if (!p || (p.visibility||0)<.25) continue;
      ctx.beginPath(); ctx.arc(p.x*width,p.y*height,Math.max(3,width/180),0,Math.PI*2);
      ctx.fillStyle='#739d78'; ctx.fill(); ctx.strokeStyle='white'; ctx.lineWidth=2; ctx.stroke();
    }
  }

  let frames = 0;
  async function renderFrame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(renderFrame);
    if (renderer) renderer.render(scene, camera3d);
    if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime || now-lastDetectAt < 38) return;
    lastDetectAt = now;
    lastVideoTime = video.currentTime;
    try {
      const result = landmarker.detectForVideo(video, now);
      const landmarks = result.landmarks && result.landmarks[0];
      if (landmarks && updateCharacter(landmarks)) {
        drawPose(landmarks);
        // 「舞动起来」游戏钩子：把这一帧的33个关键点交给 dance_game.js 判定
        if (window.__dancePoseHook) { try { window.__dancePoseHook(landmarks, now); } catch (_) { /* 游戏报错不影响跟跳 */ } }
        if (!renderer) drawFallbackCharacter(landmarks);
        placeholder.hidden = true;
        hint.hidden = true;
        badge.textContent = '跟随中'; badge.classList.add('is-tracking');
        const score = landmarks.reduce((sum,p)=>sum+(p.visibility||0),0)/landmarks.length;
        statusEl.textContent = `已识别身体姿态 · 置信度 ${(score*100).toFixed(0)}%`;
        if (++frames % 90 === 0) console.debug('[GardenPose] tracking frames', frames);
      } else {
        overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);
        badge.textContent = '找人中'; badge.classList.remove('is-tracking');
        statusEl.textContent = '请让头、肩、髋和膝盖尽量完整入镜';
      }
    } catch (err) {
      console.error('[GardenPose] pose frame failed', err);
      statusEl.textContent = '姿态识别暂时中断，请重新走近心灵喷泉';
    }
  }

  async function loadLandmarker() {
    if (landmarker) return landmarker;
    statusEl.textContent = '正在准备本地姿态模型…';
    const { FilesetResolver, PoseLandmarker } = await import(mpModule);
    const vision = await FilesetResolver.forVisionTasks(POSE_WASM);
    landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'CPU' },
      runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: .48,
      minPosePresenceConfidence: .48,
      minTrackingConfidence: .48
    });
    return landmarker;
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusEl.textContent = '浏览器没有摄像头权限接口；手机访问需 HTTPS，电脑请用 localhost';
      return;
    }
    if (!window.isSecureContext) {
      statusEl.textContent = '浏览器为安全起见限制了摄像头。请用电脑打开 http://127.0.0.1:5000；手机需 HTTPS';
      return;
    }
    const request = ++cameraRequest;
    startButton.disabled = true;
    try {
      await loadLandmarker();
      if (request !== cameraRequest) return;
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        // 720p：640×480 在舞厅卡里被放大一倍多，画面发虚，手势/姿态识别也跟着变钝
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }
      });
      if (request !== cameraRequest) {
        acquired.getTracks().forEach(track => track.stop());
        return;
      }
      stream = acquired;
      video.srcObject = stream;
      await video.play();
      if (request !== cameraRequest) return;
      running = true;
      startButton.disabled = true;
      stopButton.disabled = false;
      document.querySelector('.live-dot')?.classList.add('is-live');
      // 沉浸模式：只留你的画面、小伙伴和退出键，其余全部退场
      modal.classList.add('is-immersive');
      setTimeout(resizeRenderer, 80);
      statusEl.textContent = '摄像头已开启，正在寻找姿态…';
      rafId = requestAnimationFrame(renderFrame);
    } catch (err) {
      if (request !== cameraRequest) return;
      console.error('[GardenPose] camera setup failed', err);
      if (stream) stream.getTracks().forEach(track => track.stop());
      stream = null;
      video.srcObject = null;
      const text = err.name === 'NotAllowedError' ? '你拒绝了摄像头权限，可在浏览器地址栏重新允许' :
        err.name === 'NotFoundError' ? '没有找到摄像头设备' : `启动失败：${err.message || err}`;
      statusEl.textContent = text;
      startButton.disabled = false;
      stopButton.disabled = true;
    }
  }

  function stopCamera() {
    cameraRequest++;
    running = false;
    cancelAnimationFrame(rafId);
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    video.pause(); video.srcObject = null;
    overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);
    placeholder.hidden = false; hint.hidden = false;
    badge.textContent = '待机'; badge.classList.remove('is-tracking');
    modal.classList.remove('is-immersive');
    setTimeout(resizeRenderer, 80);
    statusEl.textContent = '摄像头已关闭；视频只在本机处理，不上传';
    startButton.disabled = false; stopButton.disabled = true;
    document.querySelector('.live-dot')?.classList.remove('is-live');
  }

  function openMirror() {
    modal.classList.add('is-open'); modal.setAttribute('aria-hidden','false');
    document.body.classList.add('mirror-open');
    setTimeout(resizeRenderer, 80);
  }
  function closeMirror() {
    stopCamera();
    modal.classList.remove('is-open'); modal.setAttribute('aria-hidden','true');
    document.body.classList.remove('mirror-open');
  }
  function resizeRenderer() {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (renderer) {
      renderer.setSize(rect.width, rect.height, false);
      renderer.render(scene, camera3d);
    } else {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      if (fallback2d) fallback2d.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawFallbackCharacter(idleLandmarks);
    }
    camera3d.aspect = rect.width / rect.height;
    camera3d.updateProjectionMatrix();
  }

  // 舞伴选择器
  document.querySelectorAll('.buddy-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (chip.dataset.char !== charKind) setCharacter(chip.dataset.char, true);
    });
  });

  openButton?.addEventListener('click', openMirror);
  if (closeButton && !closeButton.matches('a[href]')) closeButton.addEventListener('click', closeMirror);
  window.addEventListener('pagehide', stopCamera);
  startButton?.addEventListener('click', startCamera);
  stopButton?.addEventListener('click', stopCamera);
  // 「点遮罩 / Esc 关闭」只给花园里的弹层用。独立舞厅页（/garden/mirror）
  // 没有打开按钮、弹层常驻——点一下空白把整个舞厅收掉就再也开不回来了。
  if (openButton) {
    modal.addEventListener('click', event => { if (event.target === modal) closeMirror(); });
    window.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('is-open')) closeMirror(); });
  }
  window.addEventListener('resize', resizeRenderer);

  if (document.querySelector('.garden-world')?.dataset.gardenArrival === 'yes') {
    window.setTimeout(() => document.querySelector('.garden-world')?.classList.remove('garden-arrival'), 2600);
  }
  if (renderer) renderer.render(scene, camera3d);
  if (statusEl) statusEl.textContent = renderer
    ? CHARACTERS[charKind].name + '已就绪，打开摄像头开始一起跳'
    : '当前设备关闭了 WebGL，将使用简化姿态预览';
  // Expose a one-bit readiness hook for local UI smoke tests; no user data is exposed.
  window.__gardenPoseReady = true;
  window.__gardenPose = {
    character: () => charKind,
    setCharacter: (k) => setCharacter(k, true),
    isCameraOn: () => running,
    startCamera: () => startCamera(),
    stopCamera: () => stopCamera(),
  };
}
