'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const memorySource = (assetNumber: number) => `/memories/memory-${String(assetNumber).padStart(3, '0')}.jpg`;
// Keep the source order unique and exhaustive so every supplied memory appears
// exactly once per side, without repeating a neighbouring photo.
const memorySources = Array.from({ length: 107 }, (_, index) => memorySource(index + 1));
// Match the two faces so the N keeps the same weight during a full turn.
// The remaining seven files stay in the folder for future additions without
// making this symmetric composition overfull.
const photosPerFace = 50;
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

const minimumVisibleCards = 36;
const cardFootprintWidth = 1.02;
const cardFootprintHeight = 1.3;
// Keep a visible, even breathing room like the reference collage while
// letting the rows stay close enough to read as one N.
const cardGap = 0.045;
const diagonalPathWidth = 2.9;
const diagonalPathHeight = 4.34;
const diagonalNormalX = 0.831;
const diagonalNormalY = 0.557;
const verticalCenterX = 2.72;
const verticalLaneCount = 4;
const diagonalLaneCount = 3;
const minimumLayoutRows = 8;
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
const memoryGradeFilter = 'grayscale(0.11) saturate(0.92) brightness(1.02) contrast(1.01)';
const mobileMemoryGradeFilter = 'grayscale(0.09) saturate(0.96) brightness(1.02) contrast(1.01)';

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

const buildNLayout = (photoCount: number): NCardLayout[] => {
  // Keep the silhouette fixed and use several compact lanes in each stroke.
  // Give the diagonal a little more visual weight so the center reads as a
  // continuous, relaxed stroke instead of a thin bridge between the sides.
  const cardCount = Math.max(photoCount, minimumVisibleCards);
  const leftCount = Math.max(1, Math.floor(cardCount * 0.32));
  const rightCount = Math.max(1, Math.floor(cardCount * 0.32));
  const diagonalCount = cardCount - leftCount - rightCount;
  const maxRows = Math.max(
    minimumLayoutRows,
    Math.ceil(leftCount / verticalLaneCount),
    Math.ceil(diagonalCount / diagonalLaneCount),
    Math.ceil(rightCount / verticalLaneCount),
  );
  const availableHeight = 4.34 - (maxRows - 1) * cardGap;
  const equalCardScale = availableHeight / Math.max((maxRows - 1) * cardFootprintHeight, 1);
  const cardScale = Math.min(0.48, equalCardScale);
  const cardWidth = cardFootprintWidth * cardScale;
  const cardHeight = cardFootprintHeight * cardScale;
  // Use the exact same footprint for every card. The gap is part of the
  // placement math, so the diagonal stays as compact as the vertical strokes.
  const laneStep = cardWidth + cardGap;
  const diagonalLaneStep = laneStep / diagonalNormalX;
  const centerStepY = cardHeight + cardGap;
  const verticalInset = Math.max(0, (4.34 - (maxRows - 1) * centerStepY) / 2);
  const verticalTop = 2.17 - verticalInset;
  const verticalBottom = -2.17 + verticalInset;
  const layouts: NCardLayout[] = [];

  const addSegment = (count: number, segment: 'left' | 'diagonal' | 'right', segmentIndex: number) => {
    const laneCount = segment === 'diagonal' ? diagonalLaneCount : verticalLaneCount;
    const rows = Math.max(1, maxRows);
    const baseCount = Math.floor(count / rows);
    const remainder = count % rows;
    const extraRows = new Set(
      Array.from(
        { length: remainder },
        (_, extraIndex) => Math.round(((extraIndex + 1) * (rows - 1)) / (remainder + 1)),
      ),
    );
    const rowCounts = Array.from({ length: rows }, (_, row) => baseCount + (extraRows.has(row) ? 1 : 0));
    const diagonalStepT = Math.min(
      (cardWidth + cardGap) / diagonalPathWidth,
      centerStepY / diagonalPathHeight,
      1 / Math.max(rows - 1, 1),
    );
    const diagonalStartT = 0.5 - ((rows - 1) * diagonalStepT) / 2;

    for (let item = 0; item < count; item += 1) {
      let row = 0;
      let itemInRow = item;
      while (itemInRow >= rowCounts[row] && row < rows - 1) {
        itemInRow -= rowCounts[row];
        row += 1;
      }
      const rowLaneCount = rowCounts[row];
      const lane = itemInRow + (laneCount - rowLaneCount) / 2;
      const seed = segmentIndex * 1000 + item + 1;
      const progress = rows === 1 ? 0.5 : row / (rows - 1);
      const positionJitterX = (seededRandom(seed + 17) - 0.5) * 0.018;
      const positionJitterY = (seededRandom(seed + 23) - 0.5) * 0.012;
      const pathT = THREE.MathUtils.clamp(
        segment === 'diagonal'
          ? diagonalStartT + row * diagonalStepT + (seededRandom(seed + 29) - 0.5) * 0.001
          : progress + (seededRandom(seed + 31) - 0.5) * 0.002,
        0,
        1,
      );
      const offset = segment === 'diagonal'
        ? (lane - (diagonalLaneCount - 1) / 2) * diagonalLaneStep
        : (lane - (verticalLaneCount - 1) / 2) * laneStep;
      let x = 0;
      let y = 0;

      if (segment === 'left') {
        const relaxedBow = Math.sin(pathT * Math.PI) * 0.24;
        const laneWave = Math.sin(pathT * Math.PI * 1.2 + lane * 0.7) * 0.006;
        x = -verticalCenterX + offset + relaxedBow + laneWave + positionJitterX;
        y = verticalTop - pathT * (verticalTop - verticalBottom) + positionJitterY;
      } else if (segment === 'right') {
        const relaxedBow = Math.sin(pathT * Math.PI) * 0.24;
        const laneWave = Math.sin(pathT * Math.PI * 1.2 + lane * 0.7 + 0.6) * 0.006;
        x = verticalCenterX + offset - relaxedBow + laneWave + positionJitterX;
        y = verticalBottom + pathT * (verticalTop - verticalBottom) + positionJitterY;
      } else {
        const relaxedCurve = Math.sin(pathT * Math.PI) * 0.15;
        const laneWave = Math.sin(pathT * Math.PI * 1.35 + lane * 0.9) * 0.006;
        x = -(diagonalPathWidth / 2) + pathT * diagonalPathWidth + relaxedCurve + laneWave + diagonalNormalX * offset + positionJitterX;
        y = 2.17 - pathT * diagonalPathHeight + diagonalNormalY * offset + positionJitterY;
      }

      const cardIndex = layouts.length;
      const depth = cardIndex / Math.max(cardCount - 1, 1);
      layouts.push({
        x,
        y,
        // Each later slot sits a little farther back, so extra photos add
        // depth to the N rather than changing its outer silhouette.
        z: 0.42 - depth * 0.04,
        // Keep the cards upright and aligned so equal-sized photos never
        // collide at their corners while a tiny rotation keeps the collage
        // from feeling mechanically stamped into a grid.
        rotation: (seededRandom(seed + 37) - 0.5) * 0.02,
        tiltX: 0,
        tiltY: 0,
        scale: cardScale,
      });
    }
  };

  addSegment(leftCount, 'left', 0);
  addSegment(diagonalCount, 'diagonal', 1);
  addSegment(rightCount, 'right', 2);
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

// Use the official auto-generated audio upload for .Feast's full track, so no
// commentary, lyric intro, or alternate upload is included.
const memoryMusicEmbed = 'https://www.youtube-nocookie.com/embed/iLOq3u5LH0U?autoplay=1&mute=0&start=0&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&enablejsapi=1';

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
  spherePosition: THREE.Vector3;
  sphereQuaternion: THREE.Quaternion;
  sphereScale: THREE.Vector3;
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
    const mobilePixelRatio = isLowMemoryMobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.2);
    renderer.setPixelRatio(isMobileDevice ? mobilePixelRatio : Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const useMipmapFiltering = !isMobileDevice && renderer.capabilities.isWebGL2;
    const maxTextureAnisotropy = Math.max(1, renderer.capabilities.getMaxAnisotropy());
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Satu koleksi foto kenangan yang menyatu membentuk huruf N. Klik atau tap foto untuk memusatkan foto itu, lalu scroll atau cubit untuk memperbesar dan geser untuk melihat detail. Klik lagi atau tekan Escape untuk kembali. Geser ke atas atau bawah untuk memutar 360 derajat, geser diagonal untuk memutar dua sumbu, scroll atau cubit di tampilan N untuk zoom, zoom out penuh untuk melihat sisi belakang, atau zoom in penuh untuk masuk dekat lalu kembali ke awal.');
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
    // Request the full memory set up front so the opening globe does not fill
    // in photo-by-photo. Keep a small cap on phones to avoid a decode spike.
    const maxConcurrentTextureLoads = isLowMemoryMobile ? 3 : isMobileDevice ? 6 : 8;
    const mobileTexturePumpDelay = isLowMemoryMobile ? 12 : 0;
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
            context.save();
            // Keep the edge fill sharp too, so a distant card never reads as
            // blurred. The quiet mood still comes from the grade and tint.
            context.filter = isMobileDevice ? mobileMemoryGradeFilter : memoryGradeFilter;
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
            context.filter = isMobileDevice ? mobileMemoryGradeFilter : memoryGradeFilter;
            context.drawImage(
              image,
              (canvas.width - containWidth) / 2,
              (canvas.height - containHeight) / 2,
              containWidth,
              containHeight,
            );
            context.restore();

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
            fragmentShader: backBlurFragmentShader,
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
    // Slow the globe reveal down without adding any extra objects or render
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

      const forward = new THREE.Vector3(0, 0, 1);
      // Leave a generous inset for each rectangular card inside the globe.
      // The cards are tangent to the sphere, so a radius that only fits their
      // centers still lets the outer corners poke past the silhouette.
      const maxCardRadius = cards.reduce(
        (largest, card) => Math.max(
          largest,
          Math.hypot(
            cardFootprintWidth * card.scale.x,
            cardFootprintHeight * card.scale.y,
          ) * 0.5,
        ),
        0,
      );
      // Keep the photo cards on an inset globe. The extra margin is needed
      // because a flat rectangle's corners extend beyond the radius of its
      // center point when the globe is viewed from the side.
      const sphereRadius = Math.max(1.3, 1.72 - maxCardRadius * 0.92);
      const sphereCardScale = 0.7;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      cards.forEach((card, index) => {
        const normalized = (index + 0.5) / Math.max(cards.length, 1);
        const normalY = 1 - normalized * 2;
        const ringRadius = Math.sqrt(Math.max(0, 1 - normalY * normalY));
        const angle = index * goldenAngle + 0.26;
        const normal = new THREE.Vector3(
          ringRadius * Math.cos(angle),
          normalY,
          ringRadius * Math.sin(angle),
        );
        const sphereQuaternion = new THREE.Quaternion().setFromUnitVectors(forward, normal);
        const spherePosition = normal.multiplyScalar(sphereRadius);
        const sphereScale = card.scale.clone().multiplyScalar(sphereCardScale);
        introCardStates.set(card, {
          startPosition: card.position.clone(),
          startQuaternion: card.quaternion.clone(),
          startScale: card.scale.clone(),
          spherePosition,
          sphereQuaternion,
          sphereScale,
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
          card.position.lerpVectors(state.startPosition, state.spherePosition, gather);
          card.quaternion.slerpQuaternions(state.startQuaternion, state.sphereQuaternion, gather);
          card.scale.lerpVectors(state.startScale, state.sphereScale, gather);
        });
      } else if (progress < paradeStart) {
        // Let the sphere settle for a moment before the memories begin their
        // individual approach, so the two beats read as separate moments.
        introGroup.position.set(0, 0, 0);
        introGroup.rotation.set(0, 0, 0);
        introGroup.scale.setScalar(1);
        introCardStates.forEach((state, card) => {
          card.position.copy(state.spherePosition);
          card.quaternion.copy(state.sphereQuaternion);
          card.scale.copy(state.sphereScale);
        });
      } else if (progress < surgeEnd) {
        const surge = introEase((progress - paradeStart) / (surgeEnd - paradeStart));
        const thrust = Math.sin(surge * Math.PI);
        introGroup.position.set(0, 0, thrust * 4.35);
        introGroup.rotation.set(
          Math.sin(surge * Math.PI * 2) * 0.34,
          surge * Math.PI * 6,
          Math.sin(surge * Math.PI) * 0.08,
        );
        introGroup.scale.setScalar(1 + thrust * 1.18);
        // Sweep a restrained forward pulse across the sphere. The globe still
        // travels toward the viewer as one composition, but each memory only
        // advances a little so its rectangular edges stay inside the globe.
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
          card.position.copy(state.spherePosition);
          card.position.addScaledVector(introScreenForward, cardPulse * 0.28);
          // Turn the active memory gently toward the viewer while it steps
          // forward, then return it to the globe's surface orientation.
          card.quaternion.slerpQuaternions(
            state.sphereQuaternion,
            state.startQuaternion,
            cardPulse * 0.72,
          );
          card.scale.copy(state.sphereScale).multiplyScalar(1 + cardPulse * 0.08);
          cardIndex += 1;
        });
      } else {
        const returnProgress = introEase((progress - surgeEnd) / (1 - surgeEnd));
        introGroup.position.set(0, 0, 0);
        introGroup.rotation.set(0, Math.PI * 6 * (1 - returnProgress), 0);
        introGroup.scale.setScalar(1);
        introCardStates.forEach((state, card) => {
          card.position.lerpVectors(state.spherePosition, state.startPosition, returnProgress);
          card.quaternion.slerpQuaternions(state.sphereQuaternion, state.startQuaternion, returnProgress);
          card.scale.lerpVectors(state.sphereScale, state.startScale, returnProgress);
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

function MemoryIntro({ onComplete }: { onComplete: () => void }) {
  const completedRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete();
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <section className="memory-intro" aria-label="Pembuka Lutfi">
      <div className="memory-intro__veil" aria-hidden="true" />
      <p className="memory-intro__name" data-text="LUTFI">LUTFI</p>
    </section>
  );
}

function MemoryMusic() {
  const playerRef = useRef<HTMLIFrameElement>(null);
  const toggleSoundRef = useRef<() => void>(() => {});
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    let hasStarted = false;
    let isSoundEnabled = true;
    let retryTimer = 0;
    const sendPlayerCommand = (func: string, args: unknown[] = []) => {
      player.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args }),
        'https://www.youtube-nocookie.com',
      );
    };
    const startPlayback = () => {
      if (!isSoundEnabled) return;
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
      if (!hasStarted) return;
      sendPlayerCommand('pauseVideo');
      sendPlayerCommand('mute');
    };
    const handlePlayerLoad = () => {
      if (!hasStarted || !isSoundEnabled) return;
      const sendPlayCommand = () => {
        if (!isSoundEnabled) return;
        sendPlayerCommand('unMute');
        sendPlayerCommand('setVolume', [100]);
        sendPlayerCommand('playVideo');
      };
      sendPlayCommand();
      retryTimer = window.setTimeout(sendPlayCommand, 350);
    };
    const handleInteraction = () => {
      // Only the first user gesture needs to wake the embedded player. Sending
      // play commands on every tap can briefly compete with the canvas frame.
      if (!hasStarted) startPlayback();
    };
    const listenerOptions = { capture: true };

    toggleSoundRef.current = () => {
      isSoundEnabled = !isSoundEnabled;
      setSoundEnabled(isSoundEnabled);
      if (isSoundEnabled) startPlayback();
      else stopPlayback();
    };

    player.addEventListener('load', handlePlayerLoad);
    window.addEventListener('pointerdown', handleInteraction, listenerOptions);
    window.addEventListener('keydown', handleInteraction, listenerOptions);

    // Ask every browser to start the track as soon as the player is mounted.
    // Browsers that allow audible autoplay will begin immediately; browsers
    // that enforce a gesture policy still have the existing first-tap fallback.
    startPlayback();

    return () => {
      window.clearTimeout(retryTimer);
      toggleSoundRef.current = () => {};
      player.removeEventListener('load', handlePlayerLoad);
      window.removeEventListener('pointerdown', handleInteraction, listenerOptions);
      window.removeEventListener('keydown', handleInteraction, listenerOptions);
    };
  }, []);

  return (
    <>
      <aside className="memory-music" aria-label="Pemutar lagu Tarot oleh .Feast">
        <iframe
          ref={playerRef}
          className="memory-music__player"
          src={memoryMusicEmbed}
          title="Tarot — .Feast (Official Audio)"
          loading="eager"
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </aside>
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

export default function Home() {
  const [introPhase, setIntroPhase] = useState<'name' | 'n-hold' | 'globe'>('name');

  useEffect(() => {
    if (introPhase !== 'n-hold') return;
    const timer = window.setTimeout(() => setIntroPhase('globe'), 2600);
    return () => window.clearTimeout(timer);
  }, [introPhase]);

  return (
    <main className="photo-wall">
      <PhotoN introReady={introPhase === 'globe'} />
      <MemoryMusic />
      {introPhase === 'name' && <MemoryIntro onComplete={() => setIntroPhase('n-hold')} />}
    </main>
  );
}
