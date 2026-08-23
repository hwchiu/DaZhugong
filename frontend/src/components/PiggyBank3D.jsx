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
        const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
        camera.position.set(0, 0.45, 6.3);
        camera.lookAt(0, 0.05, 0);

        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'low-power',
        });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
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

        scene.add(new THREE.HemisphereLight(0xffffff, 0x7c2d12, 2.4));
        const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
        keyLight.position.set(3, 5, 5);
        scene.add(keyLight);
        const rimLight = new THREE.PointLight(0xf9a8d4, 18, 10);
        rimLight.position.set(-3, 1, 3);
        scene.add(rimLight);

        const pig = new THREE.Group();
        pig.rotation.y = -0.16;
        scene.add(pig);

        const trackGeometry = (geometry) => {
          geometries.add(geometry);
          return geometry;
        };
        const trackMaterial = (material) => {
          materials.add(material);
          return material;
        };
        const pinkMaterial = trackMaterial(new THREE.MeshPhysicalMaterial({
          color: 0xfb7185,
          transparent: true,
          opacity: 0.72,
          roughness: 0.2,
          metalness: 0.04,
          clearcoat: 1,
          clearcoatRoughness: 0.12,
          transmission: 0.08,
          depthWrite: false,
        }));
        const darkMaterial = trackMaterial(new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.45,
        }));
        const snoutMaterial = trackMaterial(new THREE.MeshPhysicalMaterial({
          color: 0xfda4af,
          roughness: 0.25,
          clearcoat: 0.8,
          transparent: true,
          opacity: 0.88,
        }));

        function addPart(geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
          const mesh = new THREE.Mesh(trackGeometry(geometry), material);
          mesh.position.set(...position);
          mesh.scale.set(...scale);
          mesh.rotation.set(...rotation);
          pig.add(mesh);
          return mesh;
        }

        addPart(new THREE.SphereGeometry(1, 32, 24), pinkMaterial, [0, 0, 0], [1.35, 1, 0.95]);
        addPart(new THREE.SphereGeometry(0.72, 28, 20), pinkMaterial, [0, 0.4, 0.88], [1, 0.92, 0.86]);
        addPart(new THREE.ConeGeometry(0.3, 0.62, 4), pinkMaterial, [-0.43, 1.02, 1.02], [1, 1, 0.65], [0.12, 0, -0.16]);
        addPart(new THREE.ConeGeometry(0.3, 0.62, 4), pinkMaterial, [0.43, 1.02, 1.02], [1, 1, 0.65], [0.12, 0, 0.16]);
        addPart(new THREE.CylinderGeometry(0.34, 0.39, 0.34, 28), snoutMaterial, [0, 0.22, 1.52], [1, 1, 0.72], [Math.PI / 2, 0, 0]);
        addPart(new THREE.SphereGeometry(0.075, 16, 12), darkMaterial, [-0.24, 0.56, 1.52]);
        addPart(new THREE.SphereGeometry(0.075, 16, 12), darkMaterial, [0.24, 0.56, 1.52]);
        addPart(new THREE.SphereGeometry(0.045, 12, 8), darkMaterial, [-0.12, 0.22, 1.77]);
        addPart(new THREE.SphereGeometry(0.045, 12, 8), darkMaterial, [0.12, 0.22, 1.77]);
        addPart(new THREE.BoxGeometry(0.78, 0.055, 0.16), darkMaterial, [0, 0.94, 0.05], [1, 1, 1], [0, 0, 0]);

        for (const x of [-0.68, 0.68]) {
          for (const z of [-0.42, 0.42]) {
            addPart(new THREE.CylinderGeometry(0.2, 0.23, 0.65, 18), pinkMaterial, [x, -0.83, z]);
          }
        }

        const tokenGeometry = trackGeometry(new THREE.CylinderGeometry(0.13, 0.13, 0.055, 18));
        const tokenMaterials = new Map();
        const tokenMeshes = sample.tokens.map((token, index) => {
          if (!tokenMaterials.has(token.color)) {
            tokenMaterials.set(token.color, trackMaterial(new THREE.MeshStandardMaterial({
              color: token.color,
              metalness: 0.38,
              roughness: 0.32,
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
