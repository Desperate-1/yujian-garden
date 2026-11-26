/* 混元 3D 舞伴「歪歪」展示位
 * --------------------------------------------------------------
 * 选舞伴处的「🧊 3D 版歪歪」按钮 → 弹出可旋转查看的展示卡。
 * 模型：/static/models/hunyuan3d/blob_mascot.glb（腾讯混元生3D 极速版）。
 * 惰性加载：第一次打开才拉 GLTFLoader 和 5.8MB 模型；自动慢转，
 * 按住拖动可手动旋转，松手 2 秒后恢复自动转。
 * 加载失败不炸页面：卡片里给一句软提示，其余功能不受影响。
 */
import * as THREE from '../vendor/mediapipe/three.module.js';

const openBtn = document.getElementById('blob3dOpenBtn');
const viewer = document.getElementById('blob3dViewer');
const closeBtn = document.getElementById('blob3dCloseBtn');
const canvas = document.getElementById('blob3dCanvas');
const loadingEl = document.getElementById('blob3dLoading');

if (openBtn && viewer && canvas) {
  const GLB_URL = '/static/models/hunyuan3d/blob_mascot.glb';

  let renderer = null, scene = null, camera3d = null, model = null;
  let loadState = 'idle';            // idle | loading | ready | failed
  let rafId = 0, opened = false;
  let dragging = false, lastX = 0, velocity = 0, idleTimer = 0;

  function setLoading(text) {
    if (!loadingEl) return;
    if (text) { loadingEl.textContent = text; loadingEl.hidden = false; }
    else loadingEl.hidden = true;
  }

  function buildScene() {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    scene = new THREE.Scene();
    camera3d = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera3d.position.set(0, 1.1, 4.6);
    camera3d.lookAt(0, 0.75, 0);

    // 和舞池同款三灯：暖主光 + 冷轮廓光 + 天光，毛绒质感才出得来
    scene.add(new THREE.HemisphereLight(0xfff6e0, 0x8a9a7c, 1.9));
    const key = new THREE.DirectionalLight(0xffeecf, 2.6);
    key.position.set(-3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xd8e8ff, 1.2);
    rim.position.set(3.5, 2.5, -3);
    scene.add(rim);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 48),
      new THREE.MeshBasicMaterial({ color: 0xf3e3b8, transparent: true, opacity: 0.35 })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.02;
    scene.add(disc);
  }

  function fitModel(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const targetH = 2.1;
    const s = targetH / (size.y || 1);
    obj.scale.setScalar(s);
    obj.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  }

  async function ensureModel() {
    if (loadState === 'ready' || loadState === 'loading') return;
    loadState = 'loading';
    setLoading('正在唤醒 3D 歪歪…（首次要下载约 6MB 模型）');
    try {
      if (!renderer) buildScene();
      const { GLTFLoader } = await import('../vendor/mediapipe/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync(GLB_URL);
      model = gltf.scene;
      fitModel(model);
      scene.add(model);
      loadState = 'ready';
      setLoading(null);
    } catch (err) {
      console.error('[BlobViewer] 3D 模型加载失败', err);
      loadState = 'failed';
      setLoading('3D 歪歪没请来 😥 刷新页面再试一次');
    }
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height || !renderer) return;
    renderer.setSize(rect.width, rect.height, false);
    camera3d.aspect = rect.width / rect.height;
    camera3d.updateProjectionMatrix();
  }

  function tick() {
    if (!opened) return;
    rafId = requestAnimationFrame(tick);
    if (model && !dragging) {
      if (performance.now() > idleTimer) velocity += (0.005 - velocity) * 0.04;  // 缓回自动转速
      model.rotation.y += velocity;
    }
    if (renderer) renderer.render(scene, camera3d);
  }

  function open() {
    viewer.hidden = false;
    opened = true;
    ensureModel();
    setTimeout(resize, 60);
    rafId = requestAnimationFrame(tick);
  }
  function close() {
    viewer.hidden = true;
    opened = false;
    cancelAnimationFrame(rafId);
  }

  /* 拖动旋转：水平拖 = 绕 Y 轴，带点惯性 */
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; velocity = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || !model) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    model.rotation.y += dx * 0.012;
    velocity = dx * 0.012;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    idleTimer = performance.now() + 2000;   // 2 秒后恢复自动转
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  openBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  viewer.addEventListener('click', (e) => { if (e.target === viewer) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && opened) close(); });
  window.addEventListener('resize', () => { if (opened) resize(); });
}
