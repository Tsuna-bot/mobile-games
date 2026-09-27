import * as THREE from 'three';
import { HEROES, HERO_ORDER } from '../data/heroes.js';
import { buildHeroFigure } from './heroView.js';
import { ENEMIES } from '../data/enemies.js';
import { TOWERS } from '../data/towers.js';
import { BUILDINGS, CASTLE_LEVELS } from '../data/realm.js';
import { buildBuildingModel, buildCastleModel } from './realmViews.js';
import { buildTowerModel } from './towerViews.js';

const SIZE = 160;

/**
 * Renders small portraits of every tower and enemy from the real 3D models,
 * used as icons in the build menu, tower panel and wave preview.
 */
export function renderThumbnails(renderer, assets) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x6a5a7a, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-2, 4, 3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(SIZE, SIZE);
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();

  const previousTarget = renderer.getRenderTarget();
  const previousClear = renderer.getClearAlpha();
  renderer.setClearAlpha(0);

  // `frames`: the parts to fit in the picture (defaults to the whole object).
  const partBox = new THREE.Box3();
  const snap = (object, frames = [object]) => {
    scene.add(object);
    object.updateMatrixWorld(true);
    box.makeEmpty();
    for (const frame of frames) box.union(partBox.setFromObject(frame, true));
    box.getCenter(center);
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z) * 0.62;
    const distance = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(center.x + distance * 0.55, center.y + distance * 0.5, center.z + distance * 0.67);
    camera.lookAt(center);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
    // WebGL rows start at the bottom: flip while copying.
    for (let row = 0; row < SIZE; row++) {
      image.data.set(pixels.subarray((SIZE - 1 - row) * SIZE * 4, (SIZE - row) * SIZE * 4), row * SIZE * 4);
    }
    ctx.putImageData(image, 0, 0);
    scene.remove(object);
    return canvas.toDataURL('image/png');
  };

  const thumbnails = { towers: {}, enemies: {}, buildings: {}, castle: [] };
  for (const def of Object.values(TOWERS)) {
    thumbnails.towers[def.id] = def.levels.map((_, level) => snap(buildTowerModel(assets, def, level).root));
  }
  for (const def of Object.values(BUILDINGS)) {
    thumbnails.buildings[def.id] = def.levels.map((_, level) => snap(buildBuildingModel(assets, def, level)));
  }
  thumbnails.portal = snap(assets.clone('spawn-round'));
  // Hero portraits: the figure with its gear, in the idle pose.
  thumbnails.heroes = {};
  for (const id of HERO_ORDER) {
    const figure = buildHeroFigure(assets, id);
    const clip = THREE.AnimationClip.findByName(assets.animations.get(HEROES[id].model) ?? [], 'idle');
    if (clip) {
      const mixer = new THREE.AnimationMixer(figure.model);
      mixer.clipAction(clip).play();
      mixer.update(0.4);
    }
    figure.model.rotation.y = -0.35;
    figure.model.updateMatrixWorld(true);
    // Framed on the body (bust shot), so long staffs do not shrink the hero.
    const frames = ['body-mesh', 'head-mesh'].map((name) => figure.model.getObjectByName(name)).filter(Boolean);
    thumbnails.heroes[id] = snap(figure.model, frames.length ? frames : [figure.model]);
    for (const item of figure.gear) item.dispose();
  }
  thumbnails.hero = thumbnails.heroes.knight;
  const flagMaterial = assets.materials.castle ?? assets.material;
  thumbnails.castle = CASTLE_LEVELS.map((_, level) => snap(buildCastleModel(assets, level, flagMaterial)));
  for (const def of Object.values(ENEMIES)) {
    const model = assets.clone(def.model);
    model.rotation.y = 0.5;
    if (def.tint) {
      const material = assets.material.clone();
      material.color.set(def.tint);
      model.traverse((o) => {
        if (o.isMesh) o.material = material;
      });
    }
    thumbnails.enemies[def.id] = snap(model);
  }

  renderer.setRenderTarget(previousTarget);
  renderer.setClearAlpha(previousClear);
  target.dispose();
  return thumbnails;
}
