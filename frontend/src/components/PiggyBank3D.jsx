import { useEffect, useMemo, useRef, useState } from 'react';
import piggyModelUrl from '../assets/piggy-bank-glass.glb?url';

const MAX_RENDERED_TOKENS = 80;
const DEFAULT_TOKEN_COLOR = '#f472b6';

function toTokenCount(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

function toSafeColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : DEFAULT_TOKEN_COLOR;
}

export function samplePiggyTokens(members, maxRendered = MAX_RENDERED_TOKENS) {
  const normalizedMembers = (Array.isArray(members) ? members : [])
    .map((member, memberIndex) => ({
      memberId: member?.id ?? `member-${memberIndex}`,
      color: toSafeColor(member?.color),
      count: toTokenCount(member?.totalTokens),
    }))
    .filter((member) => member.count > 0);
  const totalCount = normalizedMembers.reduce((sum, member) => sum + member.count, 0);
  const safeCap = Number.isFinite(maxRendered) ? Math.max(0, Math.floor(maxRendered)) : MAX_RENDERED_TOKENS;
  const renderedCount = Math.min(totalCount, safeCap);

  if (!renderedCount) {
    return { totalCount, renderedCount: 0, tokens: [] };
  }

  const cumulativeMembers = [];
  let cumulativeCount = 0;

  for (const member of normalizedMembers) {
    cumulativeCount += member.count;
    cumulativeMembers.push({ ...member, cumulativeCount });
  }

  const tokens = Array.from({ length: renderedCount }, (_, index) => {
    const sourceIndex = Math.min(
      totalCount - 1,
      Math.floor(((index + 0.5) * totalCount) / renderedCount),
    );
    const member = cumulativeMembers.find((candidate) => sourceIndex < candidate.cumulativeCount)
      ?? cumulativeMembers[cumulativeMembers.length - 1];

    return {
      id: `${member.memberId}-${index}`,
      memberId: member.memberId,
      color: member.color,
      sampleIndex: index,
    };
  });

  return { totalCount, renderedCount, tokens };
}

// 依index找出這顆token該落在哪一層(layer)、那一層的第幾個位置(within)、那一層總共能放幾顆(capacity)。
// 每層容量依那個高度身體實際的半徑算出來，讓堆疊貼合豬公圓滾滾的體內容積，
// 不會像固定寬度那樣全部擠在中央一根柱子裡。
function bodyRadiusAtY(y) {
  const R = 1.05;
  const H = 1.35;
  const clamped = Math.max(-H + 0.001, Math.min(H - 0.001, y));
  const t = Math.asin(clamped / H);
  return R * Math.cos(t);
}

function locateTokenSlot(index) {
  let layer = 0;
  let cursor = 0;
  for (let guard = 0; guard < 60; guard += 1) {
    const y = -0.78 + layer * 0.16;
    const availR = bodyRadiusAtY(y);
    const capacity = Math.max(4, Math.round(availR * 11));
    if (index < cursor + capacity) {
      return { layer, within: index - cursor, capacity, targetY: y, availR };
    }
    cursor += capacity;
    layer += 1;
  }
  return { layer, within: 0, capacity: 1, targetY: -0.78 + layer * 0.16, availR: 0.3 };
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function StaticPig({ totalCount, renderedCount, reducedMotion }) {
  const label = `小豬撲滿，內含 ${totalCount} Token，畫面顯示 ${renderedCount} 個代表物件`;

  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-4 text-center">
      <div role="img" aria-label={label} className="w-full max-w-56">
        <svg viewBox="0 0 240 190" className="h-auto w-full" aria-hidden="true">
          <defs>
            <linearGradient id="pig-body" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fda4af" stopOpacity="0.92" />
              <stop offset="100%" stopColor="#fb7185" stopOpacity="0.68" />
            </linearGradient>
          </defs>
          <ellipse cx="113" cy="105" rx="78" ry="57" fill="url(#pig-body)" stroke="#9f1239" strokeWidth="4" />
          <circle cx="165" cy="82" r="39" fill="#fda4af" fillOpacity="0.9" stroke="#9f1239" strokeWidth="4" />
          <path d="M141 53 L145 25 L165 48 Z" fill="#fb7185" stroke="#9f1239" strokeWidth="4" strokeLinejoin="round" />
          <path d="M174 47 L194 25 L195 59 Z" fill="#fb7185" stroke="#9f1239" strokeWidth="4" strokeLinejoin="round" />
          <ellipse cx="192" cy="91" rx="24" ry="17" fill="#fecdd3" stroke="#9f1239" strokeWidth="4" />
          <circle cx="184" cy="91" r="3.5" fill="#881337" />
          <circle cx="198" cy="91" r="3.5" fill="#881337" />
          <circle cx="169" cy="71" r="4.5" fill="#0f172a" />
          <rect x="62" y="151" width="24" height="26" rx="10" fill="#fb7185" stroke="#9f1239" strokeWidth="4" />
          <rect x="132" y="151" width="24" height="26" rx="10" fill="#fb7185" stroke="#9f1239" strokeWidth="4" />
          <rect x="83" y="55" width="54" height="7" rx="3.5" fill="#4c0519" />
          <circle cx="95" cy="110" r="12" fill="#facc15" stroke="#854d0e" strokeWidth="3" />
          <circle cx="123" cy="126" r="10" fill="#38bdf8" stroke="#075985" strokeWidth="3" />
        </svg>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-900">
        WebGL 無法使用，改以靜態小豬呈現。
      </p>
      {reducedMotion ? (
        <p className="mt-1 text-xs leading-5 text-slate-700">已依系統設定關閉動態效果。</p>
      ) : null}
    </div>
  );
}

// 幫每一顆token(五角星星，貼在圓餅正面)算出頂點座標，跟金幣底座一起組成硬幣造型
function buildStarShapePoints(THREE, outerR, innerR) {
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    points.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return points;
}

export default function PiggyBank3D({ members = [] }) {
  const hostRef = useRef(null);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [renderFailed, setRenderFailed] = useState(false);
  const sample = useMemo(() => samplePiggyTokens(members), [members]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => setReducedMotion(event.matches);
    setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener?.('change', handleChange);

    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    let disposed = false;
    let frameId = 0;
    let resizeObserver = null;
    let cleanupScene = () => {};
    setRenderFailed(false);

    async function initialize() {
      try {
        const probeCanvas = document.createElement('canvas');
        const webglContext = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!webglContext) {
          throw new Error('WebGL unavailable');
        }

        const [THREE, { GLTFLoader }, { RoomEnvironment }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/environments/RoomEnvironment.js'),
        ]);
        if (disposed) {
          return;
        }

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
        camera.position.set(0, 0.35, 6.6);
        camera.lookAt(0, 0.05, 0);

        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'low-power',
        });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
        renderer.domElement.className = 'h-full w-full cursor-grab active:cursor-grabbing';
        renderer.domElement.style.touchAction = 'pan-y';
        renderer.domElement.setAttribute('aria-hidden', 'true');
        host.replaceChildren(renderer.domElement);

        const geometries = new Set();
        const materials = new Set();
        let removeInteractionListeners = () => {};
        let envTexture = null;
        cleanupScene = () => {
          window.cancelAnimationFrame(frameId);
          resizeObserver?.disconnect();
          removeInteractionListeners();
          geometries.forEach((geometry) => geometry.dispose());
          materials.forEach((material) => material.dispose());
          envTexture?.dispose();
          renderer.renderLists?.dispose();
          renderer.dispose();
          renderer.forceContextLoss?.();
          renderer.domElement.remove();
          scene.clear();
        };

        const trackGeometry = (geometry) => {
          geometries.add(geometry);
          return geometry;
        };
        const trackMaterial = (material) => {
          materials.add(material);
          return material;
        };

        // 環境貼圖：用three.js官方的RoomEnvironment(合成室內光源場景)產生PMREM，
        // 讓玻璃的transmission/clearcoat有東西可以反射折射。這是正式repo，
        // three.js是完整版(0.185)，可以直接用官方addon，不用像demo那樣自己手刻合成場景。
        const pmrem = new THREE.PMREMGenerator(renderer);
        envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        scene.environment = envTexture;

        scene.add(new THREE.HemisphereLight(0xffffff, 0x7c2d12, 1.6));
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
        keyLight.position.set(3, 5, 5);
        scene.add(keyLight);
        const rimLight = new THREE.PointLight(0xf9a8d4, 14, 10);
        rimLight.position.set(-3, 1, 3);
        scene.add(rimLight);

        const pig = new THREE.Group();
        scene.add(pig);

        // 兩層材質模擬玻璃厚度透光染色：外層極透光玻璃殼 + 內層飽和色果凍芯(同一份geometry縮小當內層)。
        // three@0.185支援真正的attenuationColor/ior/iridescence，比demo版(受限於sandbox的舊three)更準確。
        const outerGlass = trackMaterial(new THREE.MeshPhysicalMaterial({
          color: 0xf3e9ff,
          transmission: 0.72,
          roughness: 0.1,
          ior: 1.35,
          thickness: 0.6,
          attenuationColor: new THREE.Color(0xffb8d9),
          attenuationDistance: 0.7,
          iridescence: 0.35,
          iridescenceIOR: 1.2,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          envMapIntensity: 2.4,
          transparent: true,
        }));
        const innerCore = trackMaterial(new THREE.MeshPhysicalMaterial({
          color: 0xffb8d9,
          transmission: 0.32,
          roughness: 0.2,
          ior: 1.35,
          clearcoat: 0.6,
          clearcoatRoughness: 0.06,
          envMapIntensity: 1.8,
          transparent: true,
          opacity: 0.9,
        }));
        // 模型本身的五官細節原始是深黑色，改成跟整體品牌一致的飽和粉紅
        const pinkAccent = trackMaterial(new THREE.MeshPhysicalMaterial({
          color: 0xff2d7a,
          transmission: 0.15,
          roughness: 0.18,
          clearcoat: 0.9,
          clearcoatRoughness: 0.1,
          envMapIntensity: 1.4,
          transparent: true,
          opacity: 0.99,
        }));
        const darkMaterial = trackMaterial(new THREE.MeshStandardMaterial({
          color: 0x2b2320,
          roughness: 0.7,
        }));

        const gltfLoader = new GLTFLoader();
        const gltf = await gltfLoader.loadAsync(piggyModelUrl);
        if (disposed) {
          geometries.forEach((geometry) => geometry.dispose());
          materials.forEach((material) => material.dispose());
          envTexture?.dispose();
          renderer.dispose();
          return;
        }

        // 自動置中：用實際載入的模型bounding box算平移量，不是寫死數字——
        // 之後模型檔案如果更新替換，這裡不用跟著手動改座標。
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        gltf.scene.position.sub(center);

        // 模型裡有兩個mesh：玻璃身體(含耳朵、腳，同一個連續mesh) + 深色五官細節(眼睛/鼻孔)。
        // 依mesh的原始材質transparency判斷哪個是玻璃身體(alpha<1)、哪個是五官(alpha=1)，
        // 比寫死node名稱更耐用，之後模型檔案node命名改變也不會找不到。
        const meshes = [];
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            meshes.push(child);
            trackGeometry(child.geometry);
          }
        });
        meshes.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count);
        const bodyMesh = meshes[0];
        const faceMesh = meshes[1];

        if (bodyMesh) {
          bodyMesh.geometry.translate(-center.x, -center.y, -center.z);
          const outerBody = new THREE.Mesh(bodyMesh.geometry, outerGlass);
          pig.add(outerBody);
          const innerBody = new THREE.Mesh(bodyMesh.geometry, innerCore);
          innerBody.scale.setScalar(0.92);
          pig.add(innerBody);
        }
        if (faceMesh) {
          faceMesh.geometry.translate(-center.x, -center.y, -center.z);
          pig.add(new THREE.Mesh(faceMesh.geometry, pinkAccent));
        }
        pig.scale.setScalar(1.15);

        // 投幣孔：模型本身沒有做，這裡補上，直的、由後往前
        const slotGeometry = trackGeometry(new THREE.BoxGeometry(0.075, 0.03, 0.22));
        const slot = new THREE.Mesh(slotGeometry, darkMaterial);
        slot.position.set(0, 0.65, 0.03);
        pig.add(slot);

        // Token：金幣造型(圓餅底 + 浮雕星星 + 內外兩圈刻紋環)，顏色依成員實際的token顏色，
        // 不是隨機色——這是跟demo最大的不同，demo是手動按鈕測試用隨機色，這裡要對應真實資料。
        const tokenGroup = new THREE.Group();
        pig.add(tokenGroup);
        const coinBaseGeo = trackGeometry(new THREE.CylinderGeometry(0.15, 0.15, 0.038, 28));
        const starPoints = buildStarShapePoints(THREE, 0.088, 0.038);
        const starShape = new THREE.Shape(starPoints);
        const starGeo = trackGeometry(new THREE.ExtrudeGeometry(starShape, {
          depth: 0.01, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1,
        }));
        const innerRingGeo = trackGeometry(new THREE.RingGeometry(0.1, 0.111, 32));
        const outerRingGeo = trackGeometry(new THREE.RingGeometry(0.128, 0.14, 32));

        const tokenMeshes = sample.tokens.map((token, index) => {
          const slotInfo = locateTokenSlot(index);
          const spread = Math.min(slotInfo.availR * 0.78, 1.0);
          const goldenAngle = Math.PI * (3 - Math.sqrt(5));
          const angle = slotInfo.within * goldenAngle + slotInfo.layer * 0.6;
          const r = spread * Math.sqrt((slotInfo.within + 1) / slotInfo.capacity);
          const targetX = Math.cos(angle) * r;
          const targetZ = Math.sin(angle) * r;
          const targetY = slotInfo.targetY;

          const coin = new THREE.Group();
          const base = new THREE.Mesh(coinBaseGeo, trackMaterial(new THREE.MeshStandardMaterial({
            color: token.color, metalness: 0.75, roughness: 0.3,
          })));
          coin.add(base);
          const star = new THREE.Mesh(starGeo, trackMaterial(new THREE.MeshStandardMaterial({
            color: token.color, metalness: 0.35, roughness: 0.5,
          })));
          star.rotation.x = -Math.PI / 2;
          star.position.y = 0.02 + 0.005;
          coin.add(star);
          const ringColor = new THREE.Color(token.color).multiplyScalar(0.7);
          const ringMat = trackMaterial(new THREE.MeshStandardMaterial({
            color: ringColor, metalness: 0.6, roughness: 0.42, side: THREE.DoubleSide,
          }));
          const innerRing = new THREE.Mesh(innerRingGeo, ringMat);
          innerRing.rotation.x = -Math.PI / 2;
          innerRing.position.y = 0.021;
          coin.add(innerRing);
          const outerRing = new THREE.Mesh(outerRingGeo, ringMat);
          outerRing.rotation.x = -Math.PI / 2;
          outerRing.position.y = 0.021;
          coin.add(outerRing);

          coin.rotation.set(Math.sin(index) * 0.3, 0, index * 0.7);
          coin.userData.targetY = targetY;
          coin.position.set(
            targetX,
            reducedMotion ? targetY : 1.8 + (index % 9) * 0.12,
            targetZ,
          );
          tokenGroup.add(coin);
          return coin;
        });

        const render = () => renderer.render(scene, camera);
        const resize = () => {
          if (disposed) {
            return;
          }

          const width = Math.max(1, host.clientWidth || host.getBoundingClientRect().width || 1);
          const height = Math.max(1, host.clientHeight || 288);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
          render();
        };

        let dragging = false;
        let pointerX = 0;
        let angularVelocity = 0.00016;
        const handlePointerDown = (event) => {
          dragging = true;
          pointerX = event.clientX;
          renderer.domElement.setPointerCapture?.(event.pointerId);
        };
        const handlePointerMove = (event) => {
          if (!dragging) {
            return;
          }

          const deltaX = event.clientX - pointerX;
          pointerX = event.clientX;
          pig.rotation.y += deltaX * 0.012;
          angularVelocity = deltaX * 0.012;
          render();
        };
        const handlePointerUp = (event) => {
          dragging = false;
          renderer.domElement.releasePointerCapture?.(event.pointerId);
        };

        renderer.domElement.addEventListener('pointerdown', handlePointerDown);
        renderer.domElement.addEventListener('pointermove', handlePointerMove);
        renderer.domElement.addEventListener('pointerup', handlePointerUp);
        renderer.domElement.addEventListener('pointercancel', handlePointerUp);
        window.addEventListener('resize', resize);
        removeInteractionListeners = () => {
          window.removeEventListener('resize', resize);
          renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
          renderer.domElement.removeEventListener('pointermove', handlePointerMove);
          renderer.domElement.removeEventListener('pointerup', handlePointerUp);
          renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
        };
        if (typeof ResizeObserver === 'function') {
          resizeObserver = new ResizeObserver(resize);
          resizeObserver.observe(host);
        }
        resize();

        if (!reducedMotion) {
          const startedAt = performance.now();
          let previousTime = startedAt;
          const animate = (time) => {
            if (disposed) {
              return;
            }

            const delta = Math.min(40, time - previousTime);
            previousTime = time;
            if (!dragging) {
              pig.rotation.y += angularVelocity;
              angularVelocity *= 0.95;
              if (Math.abs(angularVelocity) < 0.00012) angularVelocity = 0.00016;
            }

            const progress = Math.min(1, (time - startedAt) / 950);
            const eased = 1 - ((1 - progress) ** 3);
            for (const coin of tokenMeshes) {
              const startY = 1.8 + (coin.userData.targetY * -0.25);
              coin.position.y = startY + (coin.userData.targetY - startY) * eased;
            }
            render();
            frameId = window.requestAnimationFrame(animate);
          };
          frameId = window.requestAnimationFrame(animate);
        } else {
          render();
        }
      } catch (err) {
        if (!disposed) {
          console.error('PiggyBank3D 初始化失敗，改用靜態小豬：', err);
          cleanupScene();
          setRenderFailed(true);
        }
      }
    }

    void initialize();

    return () => {
      disposed = true;
      cleanupScene();
      host.replaceChildren();
    };
  }, [reducedMotion, sample.tokens]);

  const visualSummary = sample.totalCount > sample.renderedCount
    ? `以 ${sample.renderedCount} 個代表物件呈現，共 ${sample.totalCount} Token`
    : `共 ${sample.totalCount} Token`;

  return (
    <figure className="relative overflow-hidden rounded-[1.75rem] border border-white/15 bg-gradient-to-br from-rose-300/20 to-white/5">
      <div className="absolute left-4 top-4 z-10 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-semibold text-white">
        {visualSummary}
      </div>
      {renderFailed ? (
        <StaticPig
          totalCount={sample.totalCount}
          renderedCount={sample.renderedCount}
          reducedMotion={reducedMotion}
        />
      ) : (
        <div
          ref={hostRef}
          className="h-72 w-full"
          role="img"
          aria-label={`可水平拖曳旋轉的小豬撲滿，內含 ${sample.totalCount} Token`}
        />
      )}
      <figcaption className="sr-only">
        小豬內的彩色 Token 依成員累計數量取樣呈現，最多顯示 {MAX_RENDERED_TOKENS} 個物件。
      </figcaption>
    </figure>
  );
}
