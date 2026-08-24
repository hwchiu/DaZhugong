import { useEffect, useMemo, useRef, useState } from 'react';

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

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function StaticPig({ totalCount, renderedCount, reducedMotion }) {
  const label = `小豬撲滿，內含 ${totalCount} Token，畫面顯示 ${renderedCount} 個代表物件`;

  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-4 text-center">
      <div role="img" aria-label={label} className="w-full max-w-64">
        <svg viewBox="0 0 280 220" className="h-auto w-full" aria-hidden="true">
          <defs>
            <radialGradient id="pig-body" cx="38%" cy="32%" r="65%">
              <stop offset="0%" stopColor="#fecdd3" />
              <stop offset="55%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#e11d48" stopOpacity="0.85" />
            </radialGradient>
            <radialGradient id="pig-head" cx="38%" cy="32%" r="65%">
              <stop offset="0%" stopColor="#fecdd3" />
              <stop offset="60%" stopColor="#fda4af" />
              <stop offset="100%" stopColor="#fb7185" />
            </radialGradient>
            <radialGradient id="pig-snout" cx="42%" cy="36%" r="60%">
              <stop offset="0%" stopColor="#fff1f2" />
              <stop offset="100%" stopColor="#fda4af" />
            </radialGradient>
            <radialGradient id="pig-cheek" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#fda4af" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fb7185" stopOpacity="0.5" />
            </radialGradient>
            <filter id="soft-shadow" x="-10%" y="-10%" width="120%" height="130%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" floodColor="#9f1239" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* Shadow */}
          <ellipse cx="128" cy="196" rx="68" ry="10" fill="#9f1239" fillOpacity="0.12" />

          {/* Body */}
          <ellipse cx="122" cy="126" rx="82" ry="62" fill="url(#pig-body)" stroke="#be123c" strokeWidth="2.5" filter="url(#soft-shadow)" />

          {/* Head */}
          <circle cx="190" cy="96" r="50" fill="url(#pig-head)" stroke="#be123c" strokeWidth="2.5" filter="url(#soft-shadow)" />

          {/* Ear left */}
          <ellipse cx="168" cy="54" rx="16" ry="22" fill="#fb7185" stroke="#be123c" strokeWidth="2" transform="rotate(-18 168 54)" />
          <ellipse cx="168" cy="54" rx="9" ry="14" fill="#fda4af" transform="rotate(-18 168 54)" />

          {/* Ear right */}
          <ellipse cx="214" cy="50" rx="16" ry="22" fill="#fb7185" stroke="#be123c" strokeWidth="2" transform="rotate(18 214 50)" />
          <ellipse cx="214" cy="50" rx="9" ry="14" fill="#fda4af" transform="rotate(18 214 50)" />

          {/* Snout */}
          <ellipse cx="217" cy="108" rx="26" ry="20" fill="url(#pig-snout)" stroke="#be123c" strokeWidth="2" />
          <circle cx="209" cy="107" r="5" fill="#9f1239" fillOpacity="0.7" />
          <circle cx="224" cy="107" r="5" fill="#9f1239" fillOpacity="0.7" />

          {/* Eye */}
          <circle cx="188" cy="82" r="7" fill="#1e293b" />
          <circle cx="190" cy="80" r="2.5" fill="white" fillOpacity="0.7" />

          {/* Cheek blush */}
          <ellipse cx="175" cy="100" rx="12" ry="8" fill="url(#pig-cheek)" />

          {/* Smile */}
          <path d="M196 116 Q206 124 216 116" stroke="#be123c" strokeWidth="2.5" fill="none" strokeLinecap="round" />

          {/* Coin slot */}
          <rect x="96" y="70" width="58" height="8" rx="4" fill="#9f1239" fillOpacity="0.75" />

          {/* Legs */}
          <rect x="72" y="172" width="26" height="28" rx="12" fill="#fb7185" stroke="#be123c" strokeWidth="2" />
          <rect x="108" y="175" width="26" height="25" rx="12" fill="#fb7185" stroke="#be123c" strokeWidth="2" />
          <rect x="143" y="175" width="26" height="25" rx="12" fill="#fb7185" stroke="#be123c" strokeWidth="2" />
          <rect x="178" y="172" width="26" height="28" rx="12" fill="#fb7185" stroke="#be123c" strokeWidth="2" />

          {/* Tail */}
          <path d="M45 100 Q28 82 38 68 Q48 54 38 44" stroke="#fb7185" strokeWidth="5" fill="none" strokeLinecap="round" />

          {/* Tokens */}
          <circle cx="108" cy="130" r="13" fill="#facc15" stroke="#854d0e" strokeWidth="2.5" />
          <circle cx="136" cy="146" r="11" fill="#38bdf8" stroke="#075985" strokeWidth="2.5" />
          <circle cx="83" cy="144" r="10" fill="#a78bfa" stroke="#5b21b6" strokeWidth="2.5" />
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

        const THREE = await import('three');
        if (disposed) {
          return;
        }

        const scene = new THREE.Scene();
        // Narrower FOV makes the pig larger and less distorted
        const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
        camera.position.set(0, 0.55, 7.2);
        camera.lookAt(0, 0.1, 0);

        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'low-power',
        });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.className = 'h-full w-full cursor-grab active:cursor-grabbing';
        renderer.domElement.style.touchAction = 'pan-y';
        renderer.domElement.setAttribute('aria-hidden', 'true');
        host.replaceChildren(renderer.domElement);

        const geometries = new Set();
        const materials = new Set();
        let removeInteractionListeners = () => {};
        cleanupScene = () => {
          window.cancelAnimationFrame(frameId);
          resizeObserver?.disconnect();
          removeInteractionListeners();
          geometries.forEach((geometry) => geometry.dispose());
          materials.forEach((material) => material.dispose());
          renderer.renderLists?.dispose();
          renderer.dispose();
          renderer.forceContextLoss?.();
          renderer.domElement.remove();
          scene.clear();
        };

        // Soft ambient fill
        scene.add(new THREE.HemisphereLight(0xfff0f3, 0x7c2d12, 1.8));
        // Warm key light from upper-right
        const keyLight = new THREE.DirectionalLight(0xfff5ee, 4.5);
        keyLight.position.set(4, 6, 6);
        scene.add(keyLight);
        // Cool fill light from the left
        const fillLight = new THREE.DirectionalLight(0xc7d2fe, 1.6);
        fillLight.position.set(-5, 2, 2);
        scene.add(fillLight);
        // Pink rim/back light for cute glow
        const rimLight = new THREE.PointLight(0xff88aa, 28, 12);
        rimLight.position.set(-2.5, 2, -2);
        scene.add(rimLight);
        // Soft under fill so legs aren't too dark
        const underLight = new THREE.PointLight(0xffdde5, 8, 6);
        underLight.position.set(0, -2.5, 1);
        scene.add(underLight);

        const pig = new THREE.Group();
        pig.rotation.y = -0.2;
        scene.add(pig);

        const trackGeometry = (geometry) => {
          geometries.add(geometry);
          return geometry;
        };
        const trackMaterial = (material) => {
          materials.add(material);
          return material;
        };

        // Main pig body — vibrant pink, glossy clearcoat, slight subsurface
        const pinkMaterial = trackMaterial(new THREE.MeshPhysicalMaterial({
          color: 0xf43f6e,
          roughness: 0.18,
          metalness: 0.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.08,
          sheen: 0.6,
          sheenColor: new THREE.Color(0xfda4af),
          sheenRoughness: 0.4,
        }));

        // Lighter inner-ear / highlight areas
        const lightPinkMaterial = trackMaterial(new THREE.MeshPhysicalMaterial({
          color: 0xfecdd3,
          roughness: 0.22,
          clearcoat: 0.8,
          clearcoatRoughness: 0.1,
        }));

        // Dark material for eyes and nostrils
        const darkMaterial = trackMaterial(new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.3,
          metalness: 0.1,
        }));
        // White highlight for eye sparkle
        const whiteMaterial = trackMaterial(new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.1,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 0.5,
        }));
        // Snout — warm, slightly glossy
        const snoutMaterial = trackMaterial(new THREE.MeshPhysicalMaterial({
          color: 0xfda4af,
          roughness: 0.2,
          clearcoat: 0.9,
          clearcoatRoughness: 0.06,
          sheen: 0.3,
          sheenColor: new THREE.Color(0xfecdd3),
          sheenRoughness: 0.3,
        }));
        // Cheek blush — translucent overlay
        const blushMaterial = trackMaterial(new THREE.MeshPhysicalMaterial({
          color: 0xfb7185,
          transparent: true,
          opacity: 0.45,
          roughness: 0.6,
          depthWrite: false,
        }));
        // Coin slot
        const slotMaterial = trackMaterial(new THREE.MeshStandardMaterial({
          color: 0x4c0519,
          roughness: 0.55,
        }));

        function addPart(geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
          const mesh = new THREE.Mesh(trackGeometry(geometry), material);
          mesh.position.set(...position);
          mesh.scale.set(...scale);
          mesh.rotation.set(...rotation);
          pig.add(mesh);
          return mesh;
        }

        // --- Body (wider, rounder) ---
        addPart(new THREE.SphereGeometry(1, 48, 36), pinkMaterial, [0, 0, 0], [1.42, 1.05, 1.0]);

        // --- Head (bigger, cuter proportion) ---
        addPart(new THREE.SphereGeometry(0.82, 48, 36), pinkMaterial, [0, 0.45, 1.0], [1.0, 0.97, 0.94]);

        // --- Ears: ellipsoid outer + lighter inner ---
        for (const [sign, rotZ] of [[-1, 0.22], [1, -0.22]]) {
          const ex = sign * 0.5;
          addPart(new THREE.SphereGeometry(0.32, 24, 18), pinkMaterial, [ex, 1.18, 0.92], [1, 1.35, 0.55], [0.1, 0, rotZ]);
          addPart(new THREE.SphereGeometry(0.19, 18, 14), lightPinkMaterial, [ex * 0.94, 1.18, 1.0], [1, 1.2, 0.45], [0.1, 0, rotZ]);
        }

        // --- Snout ---
        addPart(new THREE.CylinderGeometry(0.38, 0.42, 0.32, 36), snoutMaterial, [0, 0.26, 1.68], [1, 1, 0.74], [Math.PI / 2, 0, 0]);
        // Nostrils
        addPart(new THREE.SphereGeometry(0.065, 14, 10), darkMaterial, [-0.15, 0.24, 1.88]);
        addPart(new THREE.SphereGeometry(0.065, 14, 10), darkMaterial, [0.15, 0.24, 1.88]);

        // --- Eyes ---
        addPart(new THREE.SphereGeometry(0.1, 20, 16), darkMaterial, [-0.3, 0.68, 1.54]);
        addPart(new THREE.SphereGeometry(0.1, 20, 16), darkMaterial, [0.3, 0.68, 1.54]);
        // Eye sparkle highlights
        addPart(new THREE.SphereGeometry(0.04, 10, 8), whiteMaterial, [-0.27, 0.72, 1.63]);
        addPart(new THREE.SphereGeometry(0.04, 10, 8), whiteMaterial, [0.33, 0.72, 1.63]);

        // --- Cheek blush circles ---
        addPart(new THREE.SphereGeometry(0.22, 18, 14), blushMaterial, [-0.54, 0.34, 1.62], [1, 0.5, 0.6]);
        addPart(new THREE.SphereGeometry(0.22, 18, 14), blushMaterial, [0.54, 0.34, 1.62], [1, 0.5, 0.6]);

        // --- Coin slot on top of body ---
        addPart(new THREE.BoxGeometry(0.8, 0.06, 0.18), slotMaterial, [0, 1.04, 0.1], [1, 1, 1], [0, 0, 0]);

        // --- Legs (4, shorter and rounder) ---
        for (const x of [-0.62, 0.62]) {
          for (const z of [-0.44, 0.38]) {
            addPart(new THREE.CylinderGeometry(0.22, 0.25, 0.6, 24), pinkMaterial, [x, -0.86, z]);
            // Hoof tip
            addPart(new THREE.SphereGeometry(0.24, 18, 14), pinkMaterial, [x, -1.12, z], [1, 0.55, 1]);
          }
        }

        // --- Tail (torus arc) ---
        addPart(new THREE.TorusGeometry(0.22, 0.055, 12, 24, Math.PI * 1.5), pinkMaterial, [-1.3, 0.2, -0.3], [1, 1, 1], [0.4, -0.4, 1.1]);

        const tokenGeometry = trackGeometry(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 24));
        const tokenMaterials = new Map();
        const tokenMeshes = sample.tokens.map((token, index) => {
          if (!tokenMaterials.has(token.color)) {
            tokenMaterials.set(token.color, trackMaterial(new THREE.MeshPhysicalMaterial({
              color: token.color,
              metalness: 0.7,
              roughness: 0.22,
              clearcoat: 0.8,
              clearcoatRoughness: 0.1,
            })));
          }

          const mesh = new THREE.Mesh(tokenGeometry, tokenMaterials.get(token.color));
          const column = index % 8;
          const row = Math.floor(index / 8);
          const targetY = -0.62 + row * 0.105;
          mesh.position.set(
            -0.79 + column * 0.225 + Math.sin(index * 2.17) * 0.035,
            reducedMotion ? targetY : 1.8 + (index % 9) * 0.12,
            -0.35 + (index % 5) * 0.17,
          );
          mesh.rotation.set(Math.PI / 2, 0, index * 0.61);
          mesh.userData.targetY = targetY;
          pig.add(mesh);
          return mesh;
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
              pig.rotation.y += delta * 0.00016;
            }

            const progress = Math.min(1, (time - startedAt) / 950);
            const eased = 1 - ((1 - progress) ** 3);
            for (const mesh of tokenMeshes) {
              const startY = 1.8 + (mesh.userData.targetY * -0.25);
              mesh.position.y = startY + (mesh.userData.targetY - startY) * eased;
            }
            render();
            frameId = window.requestAnimationFrame(animate);
          };
          frameId = window.requestAnimationFrame(animate);
        } else {
          render();
        }
      } catch {
        if (!disposed) {
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
