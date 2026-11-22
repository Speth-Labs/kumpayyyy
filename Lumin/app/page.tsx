'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Lenis from 'lenis';
import * as THREE from 'three';

const memorySource = (assetNumber: number) => `/memories/memory-${String(assetNumber).padStart(3, '0')}.jpg`;
// Keep the source order unique and exhaustive so every supplied memory appears
// exactly once per side, without repeating a neighbouring photo.
const memorySources = Array.from({ length: 64 }, (_, index) => memorySource(index + 1));
// The supplied collection is split evenly so every photo appears once on
// either face of the composition.
const photosPerFace = 32;
const frontMemorySources = memorySources.slice(0, photosPerFace);
const backMemorySources = memorySources.slice(photosPerFace, photosPerFace * 2);

type NCardLayout = {
  x: number;
  y: number;
  z: number;
  rotation: number;
  tiltX: number;
  tiltY: number;
  scale: number;
};

const cardFootprintWidth = 1.02;
const cardFootprintHeight = 1.3;
// Keep a visible, even breathing room like the reference collage while
// letting the rows stay close enough to read as one connected mark.
const cardGap = 0.05;
// Keep enough source detail for a close zoom while staying practical for a
// wall made from 100 photos.
const preparedTextureWidth = 768;
const preparedTextureHeight = 979;
// Keep phone textures below the source resolution, but large enough for a
// close look on a modern display without making the initial scene expensive.
const mobileTextureWidth = 360;
const mobileTextureHeight = 459;
// Low-memory phones get a smaller working texture while normal phones keep
// the clearer mobile size above. This keeps the same crop and card footprint.
const lowMemoryTextureWidth = 320;
const lowMemoryTextureHeight = 408;
const memoryGradeFilter = 'grayscale(0.08) saturate(0.96) brightness(1.04) contrast(1.03)';
const mobileMemoryGradeFilter = 'grayscale(0.06) saturate(0.98) brightness(1.04) contrast(1.03)';

const seededRandom = (seed: number) => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const backBlurVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const backBlurFragmentShader = `
  uniform sampler2D uTexture;
  uniform float uBlur;
  uniform vec2 uTexelSize;
  varying vec2 vUv;

  void main() {
    vec4 sharp = texture2D(uTexture, vUv);
    vec2 radius = uTexelSize * (1.0 + uBlur * 7.0);
    vec4 blurred = texture2D(uTexture, vUv) * 0.28;
    blurred += texture2D(uTexture, vUv + vec2(radius.x, 0.0)) * 0.12;
    blurred += texture2D(uTexture, vUv - vec2(radius.x, 0.0)) * 0.12;
    blurred += texture2D(uTexture, vUv + vec2(0.0, radius.y)) * 0.12;
    blurred += texture2D(uTexture, vUv - vec2(0.0, radius.y)) * 0.12;
    blurred += texture2D(uTexture, vUv + radius) * 0.06;
    blurred += texture2D(uTexture, vUv - radius) * 0.06;
    blurred += texture2D(uTexture, vUv + vec2(radius.x, -radius.y)) * 0.06;
    blurred += texture2D(uTexture, vUv + vec2(-radius.x, radius.y)) * 0.06;
    gl_FragColor = mix(sharp, blurred, clamp(uBlur, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

// Phones use a smaller blur kernel. The back face is intentionally soft, so
// eight texture reads per card are unnecessary on a small screen and make the
// GPU work much harder while the user is dragging.
const mobileBackBlurFragmentShader = `
  uniform sampler2D uTexture;
  uniform float uBlur;
  uniform vec2 uTexelSize;
  varying vec2 vUv;

  void main() {
    vec4 sharp = texture2D(uTexture, vUv);
    if (uBlur < 0.001) {
      gl_FragColor = sharp;
    } else {
      vec2 radius = uTexelSize * (1.0 + uBlur * 6.0);
      vec4 blurred = sharp * 0.4;
      blurred += texture2D(uTexture, vUv + vec2(radius.x, 0.0)) * 0.15;
      blurred += texture2D(uTexture, vUv - vec2(radius.x, 0.0)) * 0.15;
      blurred += texture2D(uTexture, vUv + vec2(0.0, radius.y)) * 0.15;
      blurred += texture2D(uTexture, vUv - vec2(0.0, radius.y)) * 0.15;
      gl_FragColor = mix(sharp, blurred, clamp(uBlur, 0.0, 1.0));
    }
    #include <colorspace_fragment>
  }
`;

const buildNLayout = (photoCount: number): NCardLayout[] => {
  // A single, clean Y: two upper arms and one lower stem. Each stroke uses
  // parallel photo lanes so the full collection stays dense without putting
  // one memory on top of another.
  const cardCount = Math.max(photoCount, 1);
  const cardScale = 0.34;
  // Extend each straight stroke from its junction instead of scaling the
  // whole Y. This opens the gaps between memories while keeping the center
  // anchored and recognizable.
  const pathStretch = 1.1;
  const segments = [
    {
      start: new THREE.Vector2(-0.25, 0.6),
      end: new THREE.Vector2(-1.95, 2.75),
      weight: 0.3125,
      laneOffsets: [-0.23, 0.23],
    },
    {
      start: new THREE.Vector2(0.25, 0.6),
      end: new THREE.Vector2(1.95, 2.75),
      weight: 0.3125,
      laneOffsets: [-0.23, 0.23],
    },
    {
      start: new THREE.Vector2(0, 0.66),
      end: new THREE.Vector2(0, -2.65),
      weight: 0.375,
      laneOffsets: [-0.35, 0, 0.35],
    },
  ];
  const counts = segments.map((segment) => Math.floor(cardCount * segment.weight));
  let remainder = cardCount - counts.reduce((sum, count) => sum + count, 0);
  const priorityOrder = [2, 0, 1];
  priorityOrder.forEach((segmentIndex) => {
    if (remainder > 0) {
      counts[segmentIndex] += 1;
      remainder -= 1;
    }
  });
  const layouts: NCardLayout[] = [];

  segments.forEach((segment, segmentIndex) => {
    const count = counts[segmentIndex];
    if (count === 0) return;
    const pathEnd = new THREE.Vector2().lerpVectors(segment.start, segment.end, pathStretch);
    const direction = new THREE.Vector2().subVectors(pathEnd, segment.start);
    const normal = new THREE.Vector2(-direction.y, direction.x).normalize();
    const isStem = segmentIndex === 2;
    // Keep the lower stem upright instead of letting atan2 turn it by π.
    // The diagonal strokes still follow their natural direction.
    const baseRotation = isStem ? 0 : Math.atan2(direction.y, direction.x) - Math.PI / 2;
    const pathInset = Math.min(0.08, cardGap / Math.max(direction.length(), 1));
    const laneCounts = segment.laneOffsets.map((_, laneIndex) => (
      Math.floor(count / segment.laneOffsets.length) + (laneIndex < count % segment.laneOffsets.length ? 1 : 0)
    ));
    segment.laneOffsets.forEach((laneOffset, laneIndex) => {
      const laneCount = laneCounts[laneIndex];
      for (let item = 0; item < laneCount; item += 1) {
        const seed = segmentIndex * 1000 + laneIndex * 100 + item + 1;
        const baseProgress = laneCount === 1
          ? 0.5
          : pathInset + ((item + 0.5) / laneCount) * (1 - pathInset * 2);
        const progress = baseProgress;
        const point = new THREE.Vector2().lerpVectors(segment.start, pathEnd, progress);
        // Keep the three strokes straight. A tiny bounded wave only breaks up
        // the machine-perfect spacing without bending the Y silhouette.
        const relaxedWave = Math.sin(progress * Math.PI * 2.1 + laneIndex * 0.7) * 0.014;
        const jitter = (seededRandom(seed + 17) - 0.5) * 0.014;
        // Taper only the width of the stem near the junction. Every lane
        // keeps the same row rhythm, so the center becomes compact without
        // creating a vertical hole between photos.
        const junctionTaper = isStem ? 0.86 + progress * 0.14 : 1;
        point.addScaledVector(normal, laneOffset * junctionTaper + relaxedWave + jitter);
        const tangent = direction.clone().normalize();
        const editorialStagger = ((item + laneIndex + segmentIndex) % 2 === 0 ? 1 : -1) * 0.018;
        point.addScaledVector(tangent, editorialStagger);
        if (isStem) {
          // Keep the center stroke aligned while allowing a nearly invisible
          // hand-placed offset between neighboring photos.
          point.x += Math.sin(progress * Math.PI * 2) * 0.016;
        }
        point.x += (seededRandom(seed + 23) - 0.5) * 0.008;
        point.y += (seededRandom(seed + 29) - 0.5) * 0.008;
        layouts.push({
          x: point.x,
          y: point.y,
          z: 0.5 - layouts.length * 0.002,
          rotation: baseRotation
            + Math.sin(progress * Math.PI * 2.4 + laneIndex * 0.55) * 0.045
            + ((item + laneIndex + segmentIndex) % 2 === 0 ? 1 : -1) * 0.035
            + (seededRandom(seed + 37) - 0.5) * 0.075,
          tiltX: 0,
          tiltY: 0,
          scale: cardScale,
        });
      }
    });
  });

  return layouts;
};

const frontN = buildNLayout(frontMemorySources.length);
const backN = buildNLayout(backMemorySources.length).map((card) => ({
  ...card,
  x: card.x,
  y: card.y,
  z: -0.96,
  rotation: card.rotation,
  tiltX: 0,
  tiltY: Math.PI,
  scale: card.scale,
}));

type MemoryTrack = {
  title: string;
  artist: string;
  videoId: string;
};

// Keep the playlist on official artist uploads so the site can switch tracks
// without copying or bundling copyrighted audio into the project.
const memoryPlaylist: MemoryTrack[] = [
  { title: 'Gala Bunga Matahari', artist: 'Sal Priadi', videoId: 'AQpEIZ8dNcU' },
  { title: 'Rehat', artist: 'Kunto Aji', videoId: 'yNcGtKAacts' },
  { title: 'Rumpang', artist: 'Nadin Amizah', videoId: 'XshVws8BE3A' },
];

const memoryMusicEmbed = (videoId: string) => (
  `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=0&start=0&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&enablejsapi=1`
);

const memoryChapters = [
  {
    eyebrow: '01 / yang tertinggal',
    title: 'Ada yang tetap tinggal',
    body: 'Kita mungkin sudah asing, tapi beberapa momen masih tahu jalan pulang.',
    image: memorySource(33),
    imageAlt: 'Dua teman duduk bersama di luar ruangan dengan langit terbuka.',
  },
  {
    eyebrow: '02 / dulu',
    title: 'Kita pernah sedekat itu',
    body: 'Foto-foto ini tidak meminta kita kembali. Mereka hanya mengingatkan bahwa kita pernah bahagia.',
    image: memorySource(64),
    imageAlt: 'Dua teman tersenyum dekat di bawah pepohonan.',
  },
  {
    eyebrow: '03 / pesan',
    title: 'Semoga baik-baik saja',
    body: 'Kalau nanti kita benar-benar jadi orang asing, semoga hidup tetap memperlakukanmu dengan lembut.',
    image: memorySource(12),
    imageAlt: 'Dua teman bercanda bersama di sofa.',
  },
];

type CardOptions = {
  source: string;
  x: number;
  y: number;
  z: number;
  rotation: number;
  tiltX?: number;
  tiltY?: number;
  scale?: number;
  background?: boolean;
  cardId: number;
};

type IntroCardState = {
  startPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  startScale: THREE.Vector3;
  lovePosition: THREE.Vector3;
  loveQuaternion: THREE.Quaternion;
  loveScale: THREE.Vector3;
};

type PhotoFocusSnapshot = {
  arrangementPosition: THREE.Vector3;
  arrangementRotation: THREE.Vector3;
  arrangementScale: THREE.Vector3;
  cardPosition: THREE.Vector3;
  cardQuaternion: THREE.Quaternion;
  cardScale: THREE.Vector3;
  cardScales: Map<THREE.Group, THREE.Vector3>;
  cameraZoom: number;
  panOffset: { x: number; y: number };
  dragRotation: { x: number; y: number };
};

function PhotoN({ introReady }: { introReady: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const introReadyRef = useRef(introReady);

  useEffect(() => {
    introReadyRef.current = introReady;
  }, [introReady]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const isMobileDevice = window.matchMedia('(max-width: 720px)').matches
      || window.matchMedia('(pointer: coarse)').matches
      || (typeof deviceMemory === 'number' && deviceMemory <= 4);
    const isLowMemoryMobile = isMobileDevice
      && typeof deviceMemory === 'number'
      && deviceMemory <= 4;
    const textureWidth = isMobileDevice
      ? (isLowMemoryMobile ? lowMemoryTextureWidth : mobileTextureWidth)
      : preparedTextureWidth;
    const textureHeight = isMobileDevice
      ? (isLowMemoryMobile ? lowMemoryTextureHeight : mobileTextureHeight)
      : preparedTextureHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !isMobileDevice,
      precision: isMobileDevice ? 'mediump' : 'highp',
      powerPreference: isMobileDevice ? 'low-power' : 'default',
    });

    // A small amount of device-pixel density keeps distant cards crisp on
    // normal phones. Low-memory phones stay at 1x to avoid trading clarity
    // for a sluggish first view.
    // A 1x drawing buffer is already native-sized on the phone viewport. It
    // avoids the large fill-rate jump caused by rendering every frame at 1.2x
    // or higher on high-density mobile screens.
    const mobilePixelRatio = 1;
    renderer.setPixelRatio(isMobileDevice ? mobilePixelRatio : Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const useMipmapFiltering = !isMobileDevice && renderer.capabilities.isWebGL2;
    const maxTextureAnisotropy = Math.max(1, renderer.capabilities.getMaxAnisotropy());
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Satu koleksi foto kenangan yang menyatu membentuk huruf Y. Klik atau tap foto untuk memusatkan foto itu, lalu cubit untuk memperbesar dan geser untuk melihat detail. Klik lagi atau tekan Escape untuk kembali. Geser vertikal halaman untuk membuka landing page dan pesan berikutnya; geser diagonal di tampilan Y untuk memutar dua sumbu, Ctrl plus scroll atau cubit untuk zoom, zoom out penuh untuk melihat sisi belakang, atau zoom in penuh untuk masuk dekat lalu kembali ke awal.');
    mount.appendChild(renderer.domElement);

    const arrangement = new THREE.Group();
    arrangement.rotation.set(0, 0, 0);
    scene.add(arrangement);
    const introGroup = new THREE.Group();
    arrangement.add(introGroup);

    const photoGeometry = new THREE.PlaneGeometry(1, 1);
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');
    const cards: THREE.Group[] = [];
    const preparedTextures = new Map<string, THREE.CanvasTexture>();
    const pendingTextures = new Map<string, Promise<THREE.CanvasTexture>>();
    const textureQueue: Array<() => void> = [];
    let activeTextureLoads = 0;
    // Request the full memory set up front so the opening love shape does not fill
    // in photo-by-photo. Keep a small cap on phones to avoid a decode spike.
    const maxConcurrentTextureLoads = isLowMemoryMobile ? 2 : isMobileDevice ? 4 : 8;
    const mobileTexturePumpDelay = isLowMemoryMobile ? 18 : isMobileDevice ? 4 : 0;
    let texturePumpTimer = 0;
    const backBlurMaterials: THREE.ShaderMaterial[] = [];
    const frontCards: THREE.Group[] = [];
    const backCards: THREE.Group[] = [];
    const placeholderData = new Uint8Array([38, 52, 56, 255]);
    const placeholderTexture = new THREE.DataTexture(placeholderData, 1, 1, THREE.RGBAFormat);
    placeholderTexture.needsUpdate = true;
    let backBlurStrength = 1;
    let isDisposed = false;

    const pumpTextureQueue = () => {
      while (!isDisposed && activeTextureLoads < maxConcurrentTextureLoads && textureQueue.length > 0) {
        textureQueue.shift()?.();
      }
    };

    const scheduleTextureQueue = () => {
      if (isDisposed || texturePumpTimer) return;
      if (!isMobileDevice || mobileTexturePumpDelay === 0) {
        pumpTextureQueue();
        return;
      }
      // Yield between mobile texture preparations so decoding and canvas work
      // do not monopolize a low-memory phone while the first view is interactive.
      texturePumpTimer = window.setTimeout(() => {
        texturePumpTimer = 0;
        pumpTextureQueue();
      }, mobileTexturePumpDelay);
    };

    const prepareTexture = (source: string) => {
      const cached = preparedTextures.get(source);
      if (cached) return Promise.resolve(cached);

      const pending = pendingTextures.get(source);
      if (pending) return pending;

      const promise = new Promise<THREE.CanvasTexture>((resolve, reject) => {
        textureQueue.push(() => {
          if (isDisposed) {
            reject(new Error('Texture loading cancelled'));
            return;
          }

          activeTextureLoads += 1;
          const finishLoad = () => {
            activeTextureLoads -= 1;
            scheduleTextureQueue();
          };

          textureLoader.load(
            source,
            (texture) => {
              const canvas = document.createElement('canvas');
              const image = texture.image;
            canvas.width = textureWidth;
            canvas.height = textureHeight;
            const context = canvas.getContext('2d');

            if (!context) {
              texture.dispose();
              finishLoad();
              reject(new Error('Canvas context unavailable'));
              return;
            }

            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';

            // Give every card one identical footprint. A clean cover fill
            // preserves the full photo without adding white bars or changing
            // the size of cards with different ratios.
            const coverScale = Math.max(canvas.width / image.width, canvas.height / image.height);
            const coverWidth = image.width * coverScale;
            const coverHeight = image.height * coverScale;
            if (isMobileDevice) {
              // One cover draw is enough on a phone: it removes white bars,
              // keeps every card's footprint identical, and halves the canvas
              // work needed to prepare each memory.
              context.save();
              context.filter = mobileMemoryGradeFilter;
              context.drawImage(
                image,
                (canvas.width - coverWidth) / 2,
                (canvas.height - coverHeight) / 2,
                coverWidth,
                coverHeight,
              );
              context.restore();
              context.fillStyle = 'rgba(17, 27, 29, 0.035)';
              context.fillRect(0, 0, canvas.width, canvas.height);
            } else {
              // Desktop keeps the extra contain pass for the closest zoom
              // view, where the larger working texture has room to benefit.
              context.save();
              context.filter = memoryGradeFilter;
              context.drawImage(
                image,
                (canvas.width - coverWidth) / 2,
                (canvas.height - coverHeight) / 2,
                coverWidth,
                coverHeight,
              );
              context.restore();

              context.fillStyle = 'rgba(17, 27, 29, 0.08)';
              context.fillRect(0, 0, canvas.width, canvas.height);

              const containScale = Math.min(canvas.width / image.width, canvas.height / image.height);
              const containWidth = image.width * containScale;
              const containHeight = image.height * containScale;
              context.save();
              context.filter = memoryGradeFilter;
              context.drawImage(
                image,
                (canvas.width - containWidth) / 2,
                (canvas.height - containHeight) / 2,
                containWidth,
                containHeight,
              );
              context.restore();
            }

            const grade = context.createLinearGradient(0, 0, canvas.width, canvas.height);
            grade.addColorStop(0, 'rgba(166, 187, 186, 0.06)');
            grade.addColorStop(0.52, 'rgba(36, 52, 55, 0)');
            grade.addColorStop(1, 'rgba(10, 19, 22, 0.105)');
            context.globalCompositeOperation = 'source-atop';
            context.fillStyle = grade;
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.globalCompositeOperation = 'source-over';

            texture.dispose();
            const prepared = new THREE.CanvasTexture(canvas);
            prepared.colorSpace = THREE.SRGBColorSpace;
            prepared.minFilter = useMipmapFiltering ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
            prepared.magFilter = THREE.LinearFilter;
            prepared.generateMipmaps = useMipmapFiltering;
            prepared.anisotropy = Math.min(
              maxTextureAnisotropy,
              isLowMemoryMobile ? 1 : isMobileDevice ? 2 : 4,
            );

            if (isDisposed) {
              prepared.dispose();
            } else {
              preparedTextures.set(source, prepared);
            }
            finishLoad();
            resolve(prepared);
            },
            undefined,
            (error) => {
              finishLoad();
              reject(error);
            },
          );
        });
        pumpTextureQueue();
      });

      pendingTextures.set(source, promise);
      promise.then(
        () => pendingTextures.delete(source),
        () => pendingTextures.delete(source),
      );
      return promise;
    };

    const createCard = ({ source, x, y, z, rotation, tiltX = 0, tiltY = 0, scale = 1, background = false, cardId }: CardOptions) => {
      const card = new THREE.Group();
      const material = background
            ? new THREE.ShaderMaterial({
            uniforms: {
              uTexture: { value: placeholderTexture },
              uBlur: { value: backBlurStrength },
              uTexelSize: { value: new THREE.Vector2(1 / textureWidth, 1 / textureHeight) },
            },
            vertexShader: backBlurVertexShader,
            fragmentShader: isMobileDevice ? mobileBackBlurFragmentShader : backBlurFragmentShader,
            side: THREE.DoubleSide,
          })
        : new THREE.MeshBasicMaterial({
            color: new THREE.Color(0xb7aaa0),
            side: THREE.DoubleSide,
          });

      if (background) backBlurMaterials.push(material as THREE.ShaderMaterial);

      const photo = new THREE.Mesh(
        photoGeometry,
        material,
      );
      // The footprint never changes after loading, so every memory stays the
      // same size and neighboring cards cannot jump or collapse while assets
      // resolve.
      photo.scale.set(cardFootprintWidth, cardFootprintHeight, 1);

      let textureRequested = false;
      const ensureTexture = () => {
        if (textureRequested || isDisposed) return;
        textureRequested = true;
        prepareTexture(source).then((texture) => {
          if (isDisposed) return;
          if (background) {
            const backMaterial = photo.material as THREE.ShaderMaterial;
            backMaterial.uniforms.uTexture.value = texture;
            backMaterial.uniforms.uTexelSize.value.set(1 / textureWidth, 1 / textureHeight);
            backMaterial.uniforms.uBlur.value = backBlurStrength;
            backMaterial.needsUpdate = true;
          } else {
            const frontMaterial = photo.material as THREE.MeshBasicMaterial;
            frontMaterial.map = texture;
            frontMaterial.color.set(0xffffff);
            frontMaterial.needsUpdate = true;
          }
        }).catch(() => {
          textureRequested = false;
          // Keep the soft color block if a temporary placeholder image cannot load.
        });
      };

      card.position.set(x, y, z);
      card.scale.setScalar(scale);
      card.rotation.set(tiltX, tiltY, rotation);
      card.userData = { x, y, z, rotation, tiltX, tiltY, scale, cardId, background, ensureTexture };
      card.add(photo);
      introGroup.add(card);
      cards.push(card);
      return card;
    };

    let backCardsCreated = false;
    const createBackCards = () => {
      if (backCardsCreated || isDisposed) return;
      backCardsCreated = true;
      backN.forEach((layout, index) => {
        const card = createCard({
          source: backMemorySources[index % backMemorySources.length],
          ...layout,
          background: true,
          cardId: index,
        });
        backCards.push(card);
      });
    };

    frontN.forEach((layout, index) => {
      const card = createCard({
        source: frontMemorySources[index % frontMemorySources.length],
        ...layout,
        background: false,
        cardId: backN.length + index,
      });
      frontCards.push(card);
    });

    const ensureCardTextures = (cardList: THREE.Group[]) => {
      cardList.forEach((card) => {
        const ensureTexture = card.userData.ensureTexture as (() => void) | undefined;
        ensureTexture?.();
      });
    };
    ensureCardTextures(frontCards);
    let backTexturesRequested = false;
    const requestBackTextures = () => {
      if (backTexturesRequested) return;
      backTexturesRequested = true;
      // Build the back face when it becomes relevant. The opening intro is
      // one intentional exception because it uses every memory at once.
      createBackCards();
      ensureCardTextures(backCards);
    };

    const introCardStates = new Map<THREE.Group, IntroCardState>();
    let introActive = true;
    let introStarted = false;
    let introStartTime = 0;
    // Give the opening room to breathe, especially on a phone where the
    // memories need a little more time to read as individual photos.
    // Slow the love reveal down without adding any extra objects or render
    // work. Phones keep the existing 30fps frame cap while the timing gets
    // more breathing room.
    const introDuration = isMobileDevice ? 11.4 : 10.8;
    const introScreenForward = new THREE.Vector3(0, 0, 1);

    const prepareIntroCards = () => {
      backBlurStrength = 0;
      requestBackTextures();
      backBlurMaterials.forEach((material) => {
        material.uniforms.uBlur.value = 0;
      });

      // Use a deliberate row rhythm instead of a noisy equation sample. Two
      // separated top rows make the lobes and notch obvious; the rows then
      // taper evenly into one clean point so the love shape reads at a glance.
      const loveCardScale = 0.57;
      const heartRows = [
        { y: 1.35, positions: [-0.75, -0.45, 0.45, 0.75] },
        { y: 1.05, positions: [-1.05, -0.75, -0.45, 0.45, 0.75, 1.05] },
        { y: 0.75, positions: [-1.2, -0.9, -0.6, -0.3, 0.3, 0.6, 0.9, 1.2] },
        { y: 0.45, positions: [-1.35, -1.05, -0.75, -0.45, -0.15, 0.15, 0.45, 0.75, 1.05, 1.35] },
        { y: 0.15, positions: [-1.35, -1.05, -0.75, -0.45, -0.15, 0.15, 0.45, 0.75, 1.05, 1.35] },
        { y: -0.15, positions: [-1.2, -0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2] },
        { y: -0.45, positions: [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9] },
        { y: -0.75, positions: [-0.6, -0.3, 0, 0.3, 0.6] },
        { y: -1.05, positions: [-0.45, -0.15, 0.15, 0.45] },
        { y: -1.35, positions: [0] },
      ];
      const heartSamples = heartRows.flatMap((row) => (
        row.positions.map((x) => new THREE.Vector2(x, row.y))
      ));
      cards.forEach((card, index) => {
        const sample = heartSamples[index % heartSamples.length];
        // Keep the silhouette deliberate, then soften the perfect grid with
        // a slow, bounded drift. The wave is shared by nearby cards so the
        // heart feels hand-placed instead of individually jittered.
        const rowPhase = (sample.y + 1.35) / 2.7;
        const relaxedSway = Math.sin(index * 0.72 + rowPhase * 2.1) * 0.026
          + Math.sin(sample.x * 2.2) * 0.018;
        const relaxedLift = Math.sin(sample.x * Math.PI) * 0.025
          + Math.cos(index * 0.58 + sample.x) * 0.012;
        const lovePosition = new THREE.Vector3(
          sample.x * 1.04 + relaxedSway + (seededRandom(index + 191) - 0.5) * 0.008,
          sample.y * 1.18 - 0.08 + relaxedLift + (seededRandom(index + 197) - 0.5) * 0.008,
          (seededRandom(index + 203) - 0.5) * 0.12,
        );
        const loveRotation = new THREE.Euler(
          Math.sin(index * 0.43 + rowPhase) * 0.028 + (seededRandom(index + 211) - 0.5) * 0.045,
          card.userData.background
            ? Math.PI + (seededRandom(index + 223) - 0.5) * 0.09
            : (seededRandom(index + 223) - 0.5) * 0.09,
          Math.sin(index * 0.61 + sample.x) * 0.045 + (seededRandom(index + 227) - 0.5) * 0.07,
        );
        const loveQuaternion = new THREE.Quaternion().setFromEuler(loveRotation);
        const loveScale = card.scale.clone().multiplyScalar(loveCardScale);
        introCardStates.set(card, {
          startPosition: card.position.clone(),
          startQuaternion: card.quaternion.clone(),
          startScale: card.scale.clone(),
          lovePosition,
          loveQuaternion,
          loveScale,
        });
      });
    };

    const introEase = (value: number) => value * value * (3 - 2 * value);
    const updateIntro = (progress: number) => {
      const gatherEnd = 0.4;
      const paradeStart = 0.48;
      const surgeEnd = 0.82;

      if (progress < gatherEnd) {
        const gather = introEase(progress / gatherEnd);
        introGroup.position.set(0, 0, 0);
        introGroup.rotation.set(0, 0, 0);
        introGroup.scale.setScalar(1);
        introCardStates.forEach((state, card) => {
          card.position.lerpVectors(state.startPosition, state.lovePosition, gather);
          card.quaternion.slerpQuaternions(state.startQuaternion, state.loveQuaternion, gather);
          card.scale.lerpVectors(state.startScale, state.loveScale, gather);
        });
      } else if (progress < paradeStart) {
        // Let the love shape settle for a moment before the memories begin their
        // individual approach, so the two beats read as separate moments.
        introGroup.position.set(0, 0, 0);
        introGroup.rotation.set(0, 0, 0);
        introGroup.scale.setScalar(1);
        introCardStates.forEach((state, card) => {
          card.position.copy(state.lovePosition);
          card.quaternion.copy(state.loveQuaternion);
          card.scale.copy(state.loveScale);
        });
      } else if (progress < surgeEnd) {
        const surge = introEase((progress - paradeStart) / (surgeEnd - paradeStart));
        const thrust = Math.sin(surge * Math.PI);
        introGroup.position.set(0, 0, thrust * 4.35);
        introGroup.rotation.set(
          Math.sin(surge * Math.PI * 2) * 0.34,
          surge * Math.PI * 2.4,
          Math.sin(surge * Math.PI) * 0.08,
        );
        introGroup.scale.setScalar(1 + thrust * 1.18);
        // Sweep a restrained forward pulse across the love shape. Each memory
        // advances a little on its own while the whole mark moves toward the
        // viewer, keeping the animation legible on a phone as well.
        const cardCount = Math.max(introCardStates.size, 1);
        const sequenceWindow = Math.min(2.8, Math.max(2.2, cardCount * 0.028));
        const sequence = surge * (cardCount + sequenceWindow);
        let cardIndex = 0;
        introCardStates.forEach((state, card) => {
          const cardProgress = THREE.MathUtils.clamp(
            (sequence - cardIndex) / sequenceWindow,
            0,
            1,
          );
          const cardPulse = Math.sin(cardProgress * Math.PI);
          card.position.copy(state.lovePosition);
          card.position.addScaledVector(introScreenForward, cardPulse * 0.28);
          // Turn the active memory gently toward the viewer while it steps
          // forward, then return it to the love shape's orientation.
          card.quaternion.slerpQuaternions(
            state.loveQuaternion,
            state.startQuaternion,
            cardPulse * 0.72,
          );
          card.scale.copy(state.loveScale).multiplyScalar(1 + cardPulse * 0.08);
          cardIndex += 1;
        });
      } else {
        const returnProgress = introEase((progress - surgeEnd) / (1 - surgeEnd));
        introGroup.position.set(0, 0, 0);
        introGroup.rotation.set(0, Math.PI * 2.4 * (1 - returnProgress), 0);
        introGroup.scale.setScalar(1);
        introCardStates.forEach((state, card) => {
          card.position.lerpVectors(state.lovePosition, state.startPosition, returnProgress);
          card.quaternion.slerpQuaternions(state.loveQuaternion, state.startQuaternion, returnProgress);
          card.scale.lerpVectors(state.loveScale, state.startScale, returnProgress);
        });
      }

      if (progress >= 1) {
        introCardStates.forEach((state, card) => {
          card.position.copy(state.startPosition);
          card.quaternion.copy(state.startQuaternion);
          card.scale.copy(state.startScale);
        });
        introGroup.position.set(0, 0, 0);
        introGroup.rotation.set(0, 0, 0);
        introGroup.scale.setScalar(1);
        introActive = false;
        renderer.domElement.style.cursor = 'grab';
      }
    };

    const startIntro = () => {
      if (introStarted) return;
      introStarted = true;
      prepareIntroCards();
      renderer.domElement.style.cursor = 'wait';
    };

    const pointer = new THREE.Vector2();
    const targetTilt = new THREE.Vector2();
    const activePointers = new Map<number, { x: number; y: number }>();
    const minZoom = 0.62;
    // Let the automatic deep-zoom reveal go twice as far while keeping the same home point.
    const maxZoom = 19.2;
    let targetZoom = 1;
    let cameraBaseDistance = 13.6;
    let pinchStartDistance = 0;
    let pinchStartZoom = 1;
    let dragging = false;
    let lastPointer = { x: 0, y: 0 };
    let frameId = 0;
    let dragRotation = { x: 0, y: 0 };
    let dragVelocity = { x: 0, y: 0 };
    let wheelZoomVelocity = 0;
    let panOffset = { x: 0, y: 0 };
    let dragMode: 'rotate' | 'pan' = 'rotate';
    const horizontalRotationPerPixel = 0.005;
    const panSensitivity = 0.39;
    const momentumScale = 0.32;
    const momentumDamping = 0.86;
    const maxMomentumStep = 0.12;
    const wheelZoomDamping = 0.78;
    const rotationFollow = 0.045;
    const zoomPanThreshold = 1.15;
    const panLimit = { x: 3.8, y: 2.8 };
    let isFlipCycling = false;
    let flipProgress = 0;
    let flipStartRotation = 0;
    let flipStartZoom = 1;
    let isDeepZoomCycling = false;
    let deepZoomProgress = 0;
    let deepZoomStartZoom = 1;
    const frameInterval = isMobileDevice ? 1000 / 30 : 0;
    let lastRenderedTime = Number.NEGATIVE_INFINITY;

    const isZoomCycling = () => isFlipCycling || isDeepZoomCycling;
    const isZoomedForPan = () => targetZoom > zoomPanThreshold;
    const focusRaycaster = new THREE.Raycaster();
    const focusPointer = new THREE.Vector2();
    const focusOrigin = new THREE.Vector3();
    const focusUnitScale = new THREE.Vector3(1, 1, 1);
    const focusZeroScale = new THREE.Vector3(0.0001, 0.0001, 0.0001);
    const focusScaleVector = new THREE.Vector3();
    const focusPosition = new THREE.Vector3();
    const focusIdentity = new THREE.Quaternion();
    const pointerStarts = new Map<number, { x: number; y: number }>();
    let multiPointerGesture = false;
    let focusCard: THREE.Group | null = null;
    let focusSnapshot: PhotoFocusSnapshot | null = null;
    let focusTarget = 0;
    let focusProgress = 0;
    let focusZoom = 1;
    let focusTargetZoom = 1;
    let focusPan = { x: 0, y: 0 };
    let focusPanTarget = { x: 0, y: 0 };
    let focusPinchStartDistance = 0;
    let focusPinchStartZoom = 1;
    let focusDragging = false;
    let focusLastPointer = { x: 0, y: 0 };
    let focusMultiPointerGesture = false;
    let focusPointerStart: { x: number; y: number } | null = null;
    const focusFrame = 0.86;
    const focusMaxZoom = 4.5;

    const getFocusScale = () => {
      const visibleWorldHeight = 2 * cameraBaseDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const visibleWorldWidth = visibleWorldHeight * camera.aspect;
      return Math.min(
        (visibleWorldWidth * focusFrame) / cardFootprintWidth,
        (visibleWorldHeight * focusFrame) / cardFootprintHeight,
      );
    };

    const getFocusPanLimits = () => {
      const visibleWorldHeight = 2 * cameraBaseDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const visibleWorldWidth = visibleWorldHeight * camera.aspect;
      const cardWidth = cardFootprintWidth * getFocusScale() * focusZoom;
      const cardHeight = cardFootprintHeight * getFocusScale() * focusZoom;
      return {
        x: Math.max(0, (cardWidth - visibleWorldWidth * focusFrame) / 2),
        y: Math.max(0, (cardHeight - visibleWorldHeight * focusFrame) / 2),
      };
    };

    const openPhotoFocus = (card: THREE.Group) => {
      if (introActive || isZoomCycling() || focusSnapshot) return;
      const ensureTexture = card.userData.ensureTexture as (() => void) | undefined;
      ensureTexture?.();
      focusCard = card;
      focusSnapshot = {
        arrangementPosition: arrangement.position.clone(),
        arrangementRotation: new THREE.Vector3(
          arrangement.rotation.x,
          arrangement.rotation.y,
          arrangement.rotation.z,
        ),
        arrangementScale: arrangement.scale.clone(),
        cardPosition: card.position.clone(),
        cardQuaternion: card.quaternion.clone(),
        cardScale: card.scale.clone(),
        cardScales: new Map(cards.map((item) => [item, item.scale.clone()])),
        cameraZoom: targetZoom,
        panOffset: { ...panOffset },
        dragRotation: { ...dragRotation },
      };
      focusTarget = 1;
      focusProgress = 0;
      focusZoom = 1;
      focusTargetZoom = 1;
      focusPan = { x: 0, y: 0 };
      focusPanTarget = { x: 0, y: 0 };
      focusDragging = false;
      focusMultiPointerGesture = false;
      dragging = false;
      dragVelocity = { x: 0, y: 0 };
      wheelZoomVelocity = 0;
      panOffset = { x: 0, y: 0 };
      activePointers.clear();
      targetTilt.set(0, 0);
      mount.dataset.focus = 'true';
      renderer.domElement.style.cursor = 'zoom-out';
    };

    const closePhotoFocus = () => {
      if (!focusSnapshot) return;
      focusTarget = 0;
      focusTargetZoom = 1;
      focusPanTarget = { x: 0, y: 0 };
      focusDragging = false;
      dragging = false;
      dragVelocity = { x: 0, y: 0 };
      activePointers.clear();
      targetTilt.set(0, 0);
      renderer.domElement.style.cursor = 'wait';
    };

    const updatePhotoFocus = () => {
      const snapshot = focusSnapshot;
      const selectedCard = focusCard;
      if (!snapshot || !selectedCard) return;

      focusProgress += (focusTarget - focusProgress) * 0.09;
      if (Math.abs(focusTarget - focusProgress) < 0.002) focusProgress = focusTarget;
      focusZoom += (focusTargetZoom - focusZoom) * 0.14;
      focusPan.x += (focusPanTarget.x - focusPan.x) * 0.14;
      focusPan.y += (focusPanTarget.y - focusPan.y) * 0.14;
      const focusPanLimits = getFocusPanLimits();
      focusPanTarget = {
        x: THREE.MathUtils.clamp(focusPanTarget.x, -focusPanLimits.x, focusPanLimits.x),
        y: THREE.MathUtils.clamp(focusPanTarget.y, -focusPanLimits.y, focusPanLimits.y),
      };
      const eased = focusProgress * focusProgress * (3 - 2 * focusProgress);
      focusScaleVector.setScalar(getFocusScale() * focusZoom);
      focusPosition.set(focusPan.x, focusPan.y, 0);

      arrangement.position.lerpVectors(snapshot.arrangementPosition, focusOrigin, eased);
      arrangement.rotation.set(
        THREE.MathUtils.lerp(snapshot.arrangementRotation.x, 0, eased),
        THREE.MathUtils.lerp(snapshot.arrangementRotation.y, 0, eased),
        THREE.MathUtils.lerp(snapshot.arrangementRotation.z, 0, eased),
      );
      arrangement.scale.lerpVectors(snapshot.arrangementScale, focusUnitScale, eased);
      selectedCard.position.lerpVectors(snapshot.cardPosition, focusPosition, eased);
      selectedCard.quaternion.slerpQuaternions(snapshot.cardQuaternion, focusIdentity, eased);
      selectedCard.scale.lerpVectors(snapshot.cardScale, focusScaleVector, eased);
      cards.forEach((card) => {
        if (card === selectedCard) return;
        const savedScale = snapshot.cardScales.get(card);
        if (savedScale) card.scale.lerpVectors(savedScale, focusZeroScale, eased);
      });
      targetZoom = THREE.MathUtils.lerp(snapshot.cameraZoom, 1, eased);

      if (focusTarget === 0 && focusProgress === 0) {
        arrangement.position.copy(snapshot.arrangementPosition);
        arrangement.rotation.set(
          snapshot.arrangementRotation.x,
          snapshot.arrangementRotation.y,
          snapshot.arrangementRotation.z,
        );
        arrangement.scale.copy(snapshot.arrangementScale);
        selectedCard.position.copy(snapshot.cardPosition);
        selectedCard.quaternion.copy(snapshot.cardQuaternion);
        selectedCard.scale.copy(snapshot.cardScale);
        snapshot.cardScales.forEach((scale, card) => card.scale.copy(scale));
        targetZoom = snapshot.cameraZoom;
        panOffset = { ...snapshot.panOffset };
        dragRotation = { ...snapshot.dragRotation };
        focusCard = null;
        focusSnapshot = null;
        focusZoom = 1;
        focusTargetZoom = 1;
        focusPan = { x: 0, y: 0 };
        focusPanTarget = { x: 0, y: 0 };
        focusPinchStartDistance = 0;
        focusDragging = false;
        focusMultiPointerGesture = false;
        mount.dataset.focus = 'false';
        renderer.domElement.style.cursor = isZoomedForPan() ? 'move' : 'grab';
      }
    };

    const updateCursor = () => {
      if (!isZoomCycling() && !introActive) {
        renderer.domElement.style.cursor = isZoomedForPan() ? 'move' : 'grab';
      }
    };

    const beginFlipCycle = (startingZoom: number) => {
      if (isZoomCycling()) return;
      isFlipCycling = true;
      requestBackTextures();
      flipProgress = 0;
      flipStartRotation = arrangement.rotation.y;
      flipStartZoom = startingZoom;
      targetZoom = minZoom;
      dragging = false;
      dragVelocity = { x: 0, y: 0 };
      panOffset = { x: 0, y: 0 };
      dragMode = 'rotate';
      activePointers.clear();
      targetTilt.set(0, 0);
      renderer.domElement.style.cursor = 'wait';
    };

    const beginDeepZoomCycle = (startingZoom: number) => {
      if (isZoomCycling()) return;
      isDeepZoomCycling = true;
      deepZoomProgress = 0;
      deepZoomStartZoom = startingZoom;
      targetZoom = maxZoom;
      dragging = false;
      dragVelocity = { x: 0, y: 0 };
      panOffset = { x: 0, y: 0 };
      dragMode = 'rotate';
      activePointers.clear();
      targetTilt.set(0, 0);
      renderer.domElement.style.cursor = 'wait';
    };

    const setZoom = (value: number) => {
      const previousZoom = targetZoom;
      targetZoom = THREE.MathUtils.clamp(value, minZoom, maxZoom);
      if (value <= minZoom + 0.004 && !isZoomCycling()) {
        beginFlipCycle(previousZoom);
      } else if (value >= maxZoom - 0.004 && !isZoomCycling()) {
        beginDeepZoomCycle(previousZoom);
      }
      updateCursor();
    };

    const getPinchDistance = () => {
      const points = Array.from(activePointers.values());
      if (points.length < 2) return 0;
      return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };

    const updatePointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    };

    const findCardFromObject = (object: THREE.Object3D | null) => {
      let current: THREE.Object3D | null = object;
      while (current) {
        const card = cards.find((item) => item === current);
        if (card) return card;
        current = current.parent;
      }
      return null;
    };

    const focusCardAtPointer = (event: PointerEvent) => {
      if (introActive || isZoomCycling() || focusSnapshot) return;
      updatePointer(event);
      focusPointer.copy(pointer);
      focusRaycaster.setFromCamera(focusPointer, camera);
      const intersections = focusRaycaster.intersectObjects(cards, true);
      const hit = intersections.find((intersection) => findCardFromObject(intersection.object));
      const card = hit ? findCardFromObject(hit.object) : null;
      if (card) openPhotoFocus(card);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (focusSnapshot) {
        const wasFirstPointer = activePointers.size === 0;
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (wasFirstPointer) focusPointerStart = { x: event.clientX, y: event.clientY };
        renderer.domElement.setPointerCapture(event.pointerId);
        if (activePointers.size >= 2) {
          focusMultiPointerGesture = true;
          focusDragging = false;
          focusPinchStartDistance = getPinchDistance();
          focusPinchStartZoom = focusTargetZoom;
        } else {
          focusDragging = true;
          focusLastPointer = { x: event.clientX, y: event.clientY };
        }
        return;
      }
      if (isZoomCycling() || introActive) return;
      wheelZoomVelocity = 0;
      pointerStarts.set(event.pointerId, { x: event.clientX, y: event.clientY });
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      renderer.domElement.setPointerCapture(event.pointerId);

      if (activePointers.size >= 2) {
        multiPointerGesture = true;
        dragging = false;
        dragVelocity = { x: 0, y: 0 };
        dragMode = 'rotate';
        pinchStartDistance = getPinchDistance();
        pinchStartZoom = targetZoom;
        targetTilt.set(0, 0);
        renderer.domElement.style.cursor = 'grabbing';
        return;
      }

      dragging = true;
      dragVelocity = { x: 0, y: 0 };
      dragMode = isZoomedForPan() ? 'pan' : 'rotate';
      if (dragMode === 'pan') targetTilt.set(0, 0);
      lastPointer = { x: event.clientX, y: event.clientY };
      renderer.domElement.style.cursor = 'grabbing';
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (focusSnapshot) {
        if (activePointers.has(event.pointerId)) {
          activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }
        if (activePointers.size >= 2) {
          const currentDistance = getPinchDistance();
          if (focusPinchStartDistance > 0 && currentDistance > 0) {
            focusTargetZoom = THREE.MathUtils.clamp(
              focusPinchStartZoom * (currentDistance / focusPinchStartDistance),
              1,
              focusMaxZoom,
            );
          }
          return;
        }
        if (focusDragging && activePointers.size === 1) {
          const deltaX = event.clientX - focusLastPointer.x;
          const deltaY = event.clientY - focusLastPointer.y;
          const bounds = renderer.domElement.getBoundingClientRect();
          const visibleWorldHeight = 2 * cameraBaseDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
          const visibleWorldWidth = visibleWorldHeight * camera.aspect;
          const panLimits = getFocusPanLimits();
          focusPanTarget = {
            x: THREE.MathUtils.clamp(
              focusPanTarget.x + (deltaX * visibleWorldWidth) / Math.max(bounds.width, 1),
              -panLimits.x,
              panLimits.x,
            ),
            y: THREE.MathUtils.clamp(
              focusPanTarget.y - (deltaY * visibleWorldHeight) / Math.max(bounds.height, 1),
              -panLimits.y,
              panLimits.y,
            ),
          };
          focusLastPointer = { x: event.clientX, y: event.clientY };
        }
        return;
      }
      if (isZoomCycling() || introActive) return;
      if (activePointers.has(event.pointerId)) {
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (activePointers.size >= 2) {
        const currentDistance = getPinchDistance();
        if (pinchStartDistance > 0 && currentDistance > 0) {
          setZoom(pinchStartZoom * (currentDistance / pinchStartDistance));
        }
        return;
      }

      if (dragMode === 'pan') {
        if (!dragging) {
          targetTilt.set(0, 0);
          return;
        }
        const deltaX = event.clientX - lastPointer.x;
        const deltaY = event.clientY - lastPointer.y;
        const bounds = renderer.domElement.getBoundingClientRect();
        const cameraDistance = cameraBaseDistance / Math.max(targetZoom, 1);
        const visibleWorldHeight = 2 * cameraDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const panScaleX = (visibleWorldHeight * camera.aspect * panSensitivity) / Math.max(bounds.width, 1);
        const panScaleY = (visibleWorldHeight * panSensitivity) / Math.max(bounds.height, 1);
        panOffset = {
          x: THREE.MathUtils.clamp(panOffset.x + deltaX * panScaleX, -panLimit.x, panLimit.x),
          y: THREE.MathUtils.clamp(panOffset.y + deltaY * panScaleY, -panLimit.y, panLimit.y),
        };
        targetTilt.set(0, 0);
        lastPointer = { x: event.clientX, y: event.clientY };
        return;
      }

      updatePointer(event);
      targetTilt.set(pointer.x, pointer.y);
      if (!dragging) return;
      const deltaX = event.clientX - lastPointer.x;
      const deltaY = event.clientY - lastPointer.y;
      const { height } = renderer.domElement.getBoundingClientRect();
      const verticalRotationPerPixel = (Math.PI * 2) / Math.max(height, 1);
      const rotationDelta = {
        x: deltaY * verticalRotationPerPixel,
        y: deltaX * horizontalRotationPerPixel,
      };
      dragRotation = {
        x: dragRotation.x + rotationDelta.x,
        y: dragRotation.y + rotationDelta.y,
      };
      dragVelocity = {
        x: THREE.MathUtils.clamp(rotationDelta.x * momentumScale, -maxMomentumStep, maxMomentumStep),
        y: THREE.MathUtils.clamp(rotationDelta.y * momentumScale, -maxMomentumStep, maxMomentumStep),
      };
      lastPointer = { x: event.clientX, y: event.clientY };
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      if (focusSnapshot) {
        const focusTap = event.type === 'pointerup'
          && focusPointerStart !== null
          && activePointers.size === 1
          && !focusMultiPointerGesture
          && Math.hypot(event.clientX - focusPointerStart.x, event.clientY - focusPointerStart.y) <= 10;
        activePointers.delete(event.pointerId);
        if (activePointers.size < 2) focusPinchStartDistance = 0;
        if (activePointers.size === 1) {
          const remainingPointer = Array.from(activePointers.values())[0];
          focusDragging = true;
          focusLastPointer = { ...remainingPointer };
        } else {
          focusDragging = false;
        }
        if (activePointers.size === 0) {
          focusPointerStart = null;
          focusMultiPointerGesture = false;
        }
        if (focusTap) closePhotoFocus();
        return;
      }
      const pointerStart = pointerStarts.get(event.pointerId);
      const wasTap = event.type === 'pointerup'
        && pointerStart !== undefined
        && activePointers.size === 1
        && !multiPointerGesture
        && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) <= 10;
      pointerStarts.delete(event.pointerId);
      activePointers.delete(event.pointerId);
      if (activePointers.size < 2) {
        pinchStartDistance = 0;
        dragging = false;
      }
      if (activePointers.size === 0) {
        // Mobile browsers can emit a tiny final move on tap. Clear the
        // cursor-follow offset with the pointer so it cannot kick the N when
        // the gesture ends.
        targetTilt.set(0, 0);
        updateCursor();
        if (wasTap) focusCardAtPointer(event);
        multiPointerGesture = false;
      }
    };

    const handlePointerLeave = () => {
      if (focusSnapshot) return;
      targetTilt.set(0, 0);
      updateCursor();
    };

    const handleWheel = (event: WheelEvent) => {
      // Leave ordinary vertical scrolling to the page so the Lenis story can
      // reveal its notes. Ctrl+wheel remains a deliberate zoom gesture, and
      // the focused/zoomed photo keeps its close-up controls.
      if (!focusSnapshot && !event.ctrlKey && !isZoomedForPan()) return;
      event.preventDefault();
      if (focusSnapshot) {
        const deltaY = THREE.MathUtils.clamp(event.deltaY, -120, 120);
        focusTargetZoom = THREE.MathUtils.clamp(
          focusTargetZoom * Math.exp(deltaY * 0.0018),
          1,
          focusMaxZoom,
        );
        return;
      }
      if (isZoomCycling() || introActive) return;
      // Keep the zoom direction aligned with the user's scroll input so a
      // positive wheel delta moves the camera forward into the memories.
      const deltaY = THREE.MathUtils.clamp(event.deltaY, -120, 120);
      wheelZoomVelocity = THREE.MathUtils.clamp(
        wheelZoomVelocity + deltaY * 0.00028,
        -0.08,
        0.08,
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (focusSnapshot) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closePhotoFocus();
        } else if (event.key === '+' || event.key === '=') {
          event.preventDefault();
          focusTargetZoom = THREE.MathUtils.clamp(focusTargetZoom * 1.16, 1, focusMaxZoom);
        } else if (event.key === '-' || event.key === '_') {
          event.preventDefault();
          focusTargetZoom = THREE.MathUtils.clamp(focusTargetZoom / 1.16, 1, focusMaxZoom);
        } else if (event.key === '0') {
          event.preventDefault();
          focusTargetZoom = 1;
          focusPanTarget = { x: 0, y: 0 };
        }
        return;
      }
      if (isZoomCycling() || introActive) return;
      wheelZoomVelocity = 0;
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setZoom(targetZoom * 1.12);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setZoom(targetZoom / 1.12);
      } else if (event.key === '0') {
        event.preventDefault();
        setZoom(1);
      }
    };

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      const safeWidth = Math.max(width, 320);
      const safeHeight = Math.max(height, 320);
      const aspect = safeWidth / safeHeight;
      camera.aspect = aspect;
      // On a narrow phone, fit the full N to the horizontal viewport while
      // keeping the desktop framing unchanged. This makes the same wall
      // usable in portrait without shrinking it more than necessary.
      const nFootprintWidth = 6.8;
      const horizontalFitDistance = nFootprintWidth
        / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect);
      cameraBaseDistance = Math.max(13.6, horizontalFitDistance * 1.08);
      camera.position.z = cameraBaseDistance / targetZoom;
      camera.updateProjectionMatrix();
      renderer.setSize(safeWidth, safeHeight, false);
    };

    const updateBackBlur = (targetBlur: number) => {
      backBlurStrength = THREE.MathUtils.clamp(targetBlur, 0, 1);
      backBlurMaterials.forEach((material) => {
        const currentBlur = material.uniforms.uBlur.value as number;
        material.uniforms.uBlur.value = THREE.MathUtils.lerp(currentBlur, backBlurStrength, 0.12);
      });
    };

    const animate = (time: number) => {
      if (frameInterval > 0 && time - lastRenderedTime < frameInterval) {
        frameId = requestAnimationFrame(animate);
        return;
      }
      lastRenderedTime = time;
      const elapsed = time * 0.001;
      if (introActive && introReadyRef.current) {
        if (introStartTime === 0) introStartTime = time;
        updateIntro(Math.min((time - introStartTime) / (introDuration * 1000), 1));
      }
      // Keep the ambient wave independent from input state. Dragging, zooming,
      // and pinching should control the N without freezing its breathing motion.
      // Make the existing transform-only wave easier to feel. This changes
      // no geometry or texture work, so it stays friendly to mobile devices.
      const ambientMotion = 1.3;
      const photoFocusActive = focusSnapshot !== null;
      if (photoFocusActive) {
        updatePhotoFocus();
      } else if (isFlipCycling) {
        flipProgress = Math.min(flipProgress + 0.0045, 1);
        const ease = (value: number) => value * value * (3 - 2 * value);
        const approachEnd = 0.18;
        const spinEnd = 0.72;
        const zoomOutPhase = Math.min(flipProgress / approachEnd, 1);
        const zoomInPhase = Math.min(Math.max((flipProgress - spinEnd) / (1 - spinEnd), 0), 1);
        targetZoom = flipProgress < spinEnd
          ? THREE.MathUtils.lerp(flipStartZoom, minZoom, ease(zoomOutPhase))
          : THREE.MathUtils.lerp(minZoom, 1, ease(zoomInPhase));

        if (flipProgress < approachEnd) {
          const approach = ease(zoomOutPhase);
          arrangement.rotation.x = THREE.MathUtils.lerp(dragRotation.x, 0, approach);
          arrangement.rotation.y = THREE.MathUtils.lerp(flipStartRotation, 0, approach);
        } else if (flipProgress < spinEnd) {
          const spin = ease(Math.min(Math.max((flipProgress - approachEnd) / (spinEnd - approachEnd), 0), 1));
          arrangement.rotation.x += (0 - arrangement.rotation.x) * 0.08;
          arrangement.rotation.y = spin * Math.PI * 2;
        } else {
          // Finish the full turn before easing back in. Keeping the completed
          // 2π rotation avoids a visible snap when the cycle unlocks.
          arrangement.rotation.x += (0 - arrangement.rotation.x) * 0.08;
          arrangement.rotation.y = Math.PI * 2;
        }
        arrangement.rotation.z += (0 - arrangement.rotation.z) * 0.08;

        const cameraIsHome = Math.abs(camera.position.z - cameraBaseDistance) < 0.012;
        const arrangementIsSettled = Math.abs(arrangement.rotation.x) < 0.004
          && Math.abs(arrangement.rotation.z) < 0.004;
        if (flipProgress >= 1 && cameraIsHome && arrangementIsSettled) {
          isFlipCycling = false;
          flipProgress = 0;
          targetZoom = 1;
          dragRotation = { x: 0, y: 0 };
          // The camera and turn are already home before releasing input, so
          // there is no end-of-cycle cut back to the opening view.
          arrangement.rotation.x = 0;
          arrangement.rotation.y = Math.PI * 2;
          arrangement.rotation.z = 0;
          renderer.domElement.style.cursor = 'grab';
        }
      } else if (isDeepZoomCycling) {
        deepZoomProgress = Math.min(deepZoomProgress + 0.006, 1);
        const ease = (value: number) => value * value * (3 - 2 * value);
        const zoomInEnd = 0.58;
        const zoomOutStart = 0.74;
        const zoomInPhase = Math.min(deepZoomProgress / zoomInEnd, 1);
        const zoomOutPhase = Math.min(
          Math.max((deepZoomProgress - zoomOutStart) / (1 - zoomOutStart), 0),
          1,
        );
        targetZoom = deepZoomProgress < zoomInEnd
          ? THREE.MathUtils.lerp(deepZoomStartZoom, maxZoom, ease(zoomInPhase))
          : deepZoomProgress < zoomOutStart
            ? maxZoom
            : THREE.MathUtils.lerp(maxZoom, 1, ease(zoomOutPhase));

        arrangement.rotation.x += (0 - arrangement.rotation.x) * 0.04;
        arrangement.rotation.y += (0 - arrangement.rotation.y) * 0.04;
        arrangement.rotation.z += (0 - arrangement.rotation.z) * 0.04;

        const cameraIsHome = Math.abs(camera.position.z - cameraBaseDistance) < 0.012;
        const arrangementIsSettled = Math.abs(arrangement.rotation.x) < 0.004
          && Math.abs(arrangement.rotation.y) < 0.004
          && Math.abs(arrangement.rotation.z) < 0.004;
        if (deepZoomProgress >= 1 && cameraIsHome && arrangementIsSettled) {
          isDeepZoomCycling = false;
          deepZoomProgress = 0;
          targetZoom = 1;
          dragRotation = { x: 0, y: 0 };
          // Release input only after the camera has fully returned, so the
          // zoom-in cycle finishes naturally without snapping to the start.
          renderer.domElement.style.cursor = 'grab';
        }
      } else {
        if (!dragging && activePointers.size === 0 && Math.abs(wheelZoomVelocity) > 0.0001) {
          setZoom(targetZoom * Math.exp(wheelZoomVelocity));
          wheelZoomVelocity *= wheelZoomDamping;
          if (Math.abs(wheelZoomVelocity) < 0.0001) wheelZoomVelocity = 0;
        }
        if (!dragging && activePointers.size === 0) {
          dragRotation.x += dragVelocity.x;
          dragRotation.y += dragVelocity.y;
          dragVelocity.x *= momentumDamping;
          dragVelocity.y *= momentumDamping;
          if (Math.abs(dragVelocity.x) < 0.0002) dragVelocity.x = 0;
          if (Math.abs(dragVelocity.y) < 0.0002) dragVelocity.y = 0;
        }
        if (dragging && dragMode === 'rotate') {
          arrangement.rotation.x = dragRotation.x;
          arrangement.rotation.y = dragRotation.y;
        } else {
          arrangement.rotation.x += (dragRotation.x - arrangement.rotation.x) * rotationFollow;
          arrangement.rotation.y += (dragRotation.y - arrangement.rotation.y) * rotationFollow;
        }
        arrangement.rotation.z += (Math.sin(elapsed * 0.18) * 0.022 - arrangement.rotation.z) * 0.03;
      }
      if (!photoFocusActive) {
        const backFaceExposure = Math.max(0, -Math.cos(arrangement.rotation.y));
        const sideTurnExposure = Math.max(
          Math.abs(Math.sin(arrangement.rotation.x)),
          Math.abs(Math.sin(arrangement.rotation.y)),
        );
        if (sideTurnExposure > 0.14 || (isFlipCycling && flipProgress > 0.12)) {
          requestBackTextures();
        }
        const shouldKeepBackBlurred = isFlipCycling && (flipProgress < 0.18 || flipProgress > 0.82);
        updateBackBlur(introActive ? 0 : shouldKeepBackBlurred ? 1 : 1 - backFaceExposure);
        const floatX = Math.sin(elapsed * 0.34) * 0.06 * ambientMotion;
        const floatY = Math.cos(elapsed * 0.28) * 0.045 * ambientMotion;
        const breathing = 1 + Math.sin(elapsed * 0.58) * 0.011 * ambientMotion;
        if (!isZoomedForPan()) {
          panOffset.x += (0 - panOffset.x) * 0.08;
          panOffset.y += (0 - panOffset.y) * 0.08;
        }
        if (dragging && dragMode === 'pan') {
          // Keep the ambient wave layered on top of direct pan tracking. This
          // prevents a tap from snapping the N to its static pan coordinates.
          arrangement.position.x = panOffset.x + floatX;
          arrangement.position.y = panOffset.y + floatY;
        } else {
          const positionFollow = dragMode === 'pan' ? 0.18 : 0.03;
          arrangement.position.x += (panOffset.x + targetTilt.x * 0.07 + floatX - arrangement.position.x) * positionFollow;
          arrangement.position.y += (panOffset.y + targetTilt.y * -0.06 + floatY - arrangement.position.y) * positionFollow;
        }
        arrangement.scale.set(breathing, breathing, breathing);

        if (!introActive) {
          // A restrained per-photo wave keeps the straight Y relaxed without
          // changing its geometry. The offset follows each card's local
          // cross-axis, so the arms and stem breathe in their own direction.
          cards.forEach((card, index) => {
            const { x, y, rotation } = card.userData as {
              x: number;
              y: number;
              rotation: number;
            };
            const phase = elapsed * 0.72 + index * 0.48;
            const wave = Math.sin(phase) * 0.018 * ambientMotion;
            const secondaryWave = Math.cos(phase * 0.82) * 0.004;
            card.position.x = x - Math.cos(rotation) * wave - Math.sin(rotation) * secondaryWave;
            card.position.y = y - Math.sin(rotation) * wave + Math.cos(rotation) * secondaryWave;
            card.rotation.z = rotation + Math.sin(phase * 0.9) * 0.009;
          });
        }
      }
      camera.position.z += (cameraBaseDistance / targetZoom - camera.position.z) * 0.08;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerUp);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    renderer.domElement.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    startIntro();
    resize();
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      renderer.domElement.removeEventListener('keydown', handleKeyDown);
      cards.forEach((card) => {
        card.children.forEach((child) => {
          const mesh = child as THREE.Mesh;
          const material = mesh.material as THREE.MeshBasicMaterial;
          material.dispose();
        });
      });
      isDisposed = true;
      if (texturePumpTimer) window.clearTimeout(texturePumpTimer);
      textureQueue.length = 0;
      preparedTextures.forEach((texture) => texture.dispose());
      preparedTextures.clear();
      placeholderTexture.dispose();
      photoGeometry.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="photo-n-canvas" />;
}

function MemoryIntro({ leaving, onComplete }: { leaving: boolean; onComplete: () => void }) {
  const completedRef = useRef(false);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    }, 1350);
    return () => window.clearTimeout(timer);
  }, [leaving, onComplete]);

  return (
    <section className={`memory-intro${leaving ? ' memory-intro--leaving' : ''}`} aria-label="Pembuka Lumin">
      <div className="memory-intro__veil" aria-hidden="true" />
      <p className="memory-intro__name" data-text="LUMIN">LUMIN</p>
    </section>
  );
}

function MemoryMusic() {
  const playerRef = useRef<HTMLIFrameElement>(null);
  const toggleSoundRef = useRef<() => void>(() => {});
  const soundEnabledRef = useRef(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const currentTrack = memoryPlaylist[trackIndex];

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    // Supplying the current origin makes the YouTube player API reliable on
    // localhost and on the eventual public host instead of silently dropping
    // play/unmute messages from the hidden iframe.
    player.setAttribute(
      'src',
      `${memoryMusicEmbed(currentTrack.videoId)}&origin=${encodeURIComponent(window.location.origin)}`,
    );

    let hasStarted = false;
    let hasUserInteracted = false;
    let retryTimer = 0;
    const sendPlayerCommand = (func: string, args: unknown[] = []) => {
      player.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args }),
        '*',
      );
    };
    const startPlayback = () => {
      if (!soundEnabledRef.current) return;
      if (hasStarted) {
        sendPlayerCommand('unMute');
        sendPlayerCommand('setVolume', [100]);
        sendPlayerCommand('playVideo');
        return;
      }
      hasStarted = true;
      // The iframe already has an autoplay source in the markup, so the
      // browser can begin loading the track immediately with the page.
      // Keep this first call as an API nudge for browsers that allow audible
      // autoplay; the first gesture remains only a fallback for stricter
      // autoplay policies.
      sendPlayerCommand('unMute');
      sendPlayerCommand('setVolume', [100]);
      sendPlayerCommand('playVideo');
    };
    const stopPlayback = () => {
      if (!hasStarted) {
        hasStarted = true;
      }
      sendPlayerCommand('pauseVideo');
      sendPlayerCommand('mute');
    };
    const handlePlayerLoad = () => {
      if (!soundEnabledRef.current) {
        stopPlayback();
        return;
      }
      if (!hasStarted) return;
      const sendPlayCommand = () => {
        if (!soundEnabledRef.current) return;
        sendPlayerCommand('unMute');
        sendPlayerCommand('setVolume', [100]);
        sendPlayerCommand('playVideo');
      };
      sendPlayCommand();
      retryTimer = window.setTimeout(sendPlayCommand, 350);
    };
    const handleInteraction = () => {
      // The browser may reject the initial audible autoplay while still
      // allowing the very first gesture. Do not let the initial failed
      // attempt mark the player as permanently started.
      if (hasUserInteracted) return;
      hasUserInteracted = true;
      startPlayback();
    };
    const listenerOptions = { capture: true };

    toggleSoundRef.current = () => {
      soundEnabledRef.current = !soundEnabledRef.current;
      setSoundEnabled(soundEnabledRef.current);
      if (soundEnabledRef.current) startPlayback();
      else stopPlayback();
    };

    player.addEventListener('load', handlePlayerLoad);
    window.addEventListener('pointerdown', handleInteraction, listenerOptions);
    window.addEventListener('keydown', handleInteraction, listenerOptions);

    // Ask every browser to start the selected track as soon as the player is mounted.
    // Browsers that allow audible autoplay will begin immediately; browsers
    // that enforce a gesture policy still have the existing first-tap fallback.
    if (soundEnabledRef.current) startPlayback();
    else stopPlayback();

    return () => {
      window.clearTimeout(retryTimer);
      toggleSoundRef.current = () => {};
      player.removeEventListener('load', handlePlayerLoad);
      window.removeEventListener('pointerdown', handleInteraction, listenerOptions);
      window.removeEventListener('keydown', handleInteraction, listenerOptions);
    };
  }, [currentTrack.videoId]);

  return (
    <>
      <aside className="memory-music" aria-label={`Pemutar lagu ${currentTrack.title} oleh ${currentTrack.artist}`}>
        <iframe
          ref={playerRef}
          className="memory-music__player"
          key={currentTrack.videoId}
          title={`${currentTrack.title} — ${currentTrack.artist} (Official Upload)`}
          loading="eager"
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </aside>
      <section className={`memory-playlist${playlistOpen ? ' is-open' : ''}`} aria-label="Pilih lagu kenangan">
        <button
          type="button"
          className="memory-playlist__toggle"
          aria-label={playlistOpen ? 'Tutup daftar lagu' : 'Buka daftar lagu'}
          aria-controls="memory-playlist-details"
          aria-expanded={playlistOpen}
          onClick={() => setPlaylistOpen((open) => !open)}
        >
          <span className="memory-playlist__toggle-copy">
            <span className="memory-playlist__eyebrow">Memory playlist</span>
            <span className="memory-playlist__now">{currentTrack.title}</span>
          </span>
          <span className="memory-playlist__toggle-chevron" aria-hidden="true">
            {playlistOpen ? '−' : '+'}
          </span>
        </button>
        <div
          id="memory-playlist-details"
          className="memory-playlist__details"
          aria-hidden={!playlistOpen}
        >
          <div className="memory-playlist__header">
            <span className="memory-playlist__eyebrow">Choose a memory</span>
            <div className="memory-playlist__transport" aria-label="Navigasi lagu">
              <button
                type="button"
                className="memory-playlist__transport-button"
                aria-label="Lagu sebelumnya"
                tabIndex={playlistOpen ? 0 : -1}
                onClick={() => setTrackIndex((index) => (index - 1 + memoryPlaylist.length) % memoryPlaylist.length)}
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                type="button"
                className="memory-playlist__transport-button"
                aria-label="Lagu berikutnya"
                tabIndex={playlistOpen ? 0 : -1}
                onClick={() => setTrackIndex((index) => (index + 1) % memoryPlaylist.length)}
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>
          <ul className="memory-playlist__tracks">
            {memoryPlaylist.map((track, index) => (
              <li key={track.videoId}>
                <button
                  type="button"
                  className={`memory-playlist__track${index === trackIndex ? ' is-active' : ''}`}
                  aria-current={index === trackIndex ? 'true' : undefined}
                  tabIndex={playlistOpen ? 0 : -1}
                  onClick={() => setTrackIndex(index)}
                >
                  <span className="memory-playlist__number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="memory-playlist__track-copy">
                    <span className="memory-playlist__track-title">{track.title}</span>
                    <span className="memory-playlist__track-artist">{track.artist}</span>
                  </span>
                  <span className="memory-playlist__track-dot" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <button
        type="button"
        className="memory-sound-toggle"
        aria-label={soundEnabled ? 'Matikan suara' : 'Nyalakan suara'}
        aria-pressed={soundEnabled}
        onClick={() => toggleSoundRef.current()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {soundEnabled ? (
            <>
              <path d="M4 9v6h4l5 4V5L8 9H4Z" />
              <path d="M16 9.5a4 4 0 0 1 0 5" />
              <path d="M18.5 7a7.5 7.5 0 0 1 0 10" />
            </>
          ) : (
            <>
              <path d="M4 9v6h4l5 4V5L8 9H4Z" />
              <path d="m17 9 4 6" />
              <path d="m21 9-4 6" />
            </>
          )}
        </svg>
        <span className="sr-only">{soundEnabled ? 'Suara aktif' : 'Suara mati'}</span>
      </button>
    </>
  );
}

function MemoryStory() {
  const storyRef = useRef<HTMLElement>(null);
  const [activePage, setActivePage] = useState(-1);

  useEffect(() => {
    const story = storyRef.current;
    if (!story) return;

    const lenis = new Lenis({
      autoRaf: true,
      duration: 1.12,
      smoothWheel: true,
      syncTouch: false,
      respectReducedMotion: true,
    });

    const pages = Array.from(story.querySelectorAll<HTMLElement>('[data-memory-page]'));
    if (pages.length === 0) {
      lenis.destroy();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visiblePage = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visiblePage) return;
        const pageIndex = Number(visiblePage.target.getAttribute('data-memory-page'));
        if (Number.isFinite(pageIndex)) setActivePage(pageIndex);
      },
      { threshold: [0.18, 0.42, 0.68], rootMargin: '-14% 0px -14% 0px' },
    );

    pages.forEach((page) => observer.observe(page));

    return () => {
      observer.disconnect();
      lenis.destroy();
    };
  }, []);

  return (
    <section ref={storyRef} className="memory-story" aria-label="Catatan kenangan">
      <article
        className={`memory-page memory-page--intro${activePage === 0 ? ' is-active' : ''}`}
        data-memory-page="0"
      >
        <div className="memory-page__content">
          <span className="memory-story__eyebrow">LUMIN / RUANG KENANGAN</span>
          <h1>Yang pernah dekat, tak benar-benar hilang.</h1>
          <p>
            Sebuah ruang kecil untuk menyimpan momen yang mungkin sudah jauh,
            tapi belum sepenuhnya pergi.
          </p>
          <span className="memory-page__scroll-mark">scroll perlahan / buka halaman berikutnya</span>
        </div>
        <span className="memory-page__counter" aria-hidden="true">01 — 04</span>
      </article>
      {memoryChapters.map((chapter, index) => (
        <article
          className={`memory-page memory-page--note${index % 2 === 1 ? ' memory-page--reverse' : ''}${activePage === index + 1 ? ' is-active' : ''}`}
          data-memory-page={index + 1}
          key={chapter.eyebrow}
        >
          <div className="memory-page__layout">
            <div className="memory-page__content">
              <span className="memory-story__eyebrow">{chapter.eyebrow}</span>
              <h2>{chapter.title}</h2>
              <p>{chapter.body}</p>
              <span className="memory-page__scroll-mark">
                {index === memoryChapters.length - 1 ? 'lumin / tetap tinggal' : 'scroll untuk lanjut'}
              </span>
            </div>
            <figure className="memory-page__visual" aria-label={chapter.imageAlt}>
              <div className="memory-page__image-frame">
                <Image
                  className="memory-page__image"
                  src={chapter.image}
                  alt={chapter.imageAlt}
                  width={768}
                  height={979}
                  sizes="(max-width: 720px) 82vw, 34vw"
                />
              </div>
            </figure>
          </div>
          <span className="memory-page__counter" aria-hidden="true">
            {String(index + 2).padStart(2, '0')} — 04
          </span>
        </article>
      ))}
    </section>
  );
}

export default function Home() {
  const [introPhase, setIntroPhase] = useState<'name' | 'love'>('name');
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    if (introPhase !== 'name') return;
    const timer = window.setTimeout(() => setIntroPhase('love'), 2600);
    return () => window.clearTimeout(timer);
  }, [introPhase]);

  return (
    <main className="photo-wall">
      <div className="memory-stage">
        <PhotoN introReady={introPhase === 'love'} />
        <MemoryMusic />
        {showIntro && (
          <MemoryIntro
            leaving={introPhase === 'love'}
            onComplete={() => setShowIntro(false)}
          />
        )}
      </div>
      <MemoryStory />
    </main>
  );
}
