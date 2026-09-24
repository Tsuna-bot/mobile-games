import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { damp } from '../core/math.js';
import { seededRandom } from '../core/random.js';
import { CHARACTER_MODELS } from './assets.js';

const TOP = CONFIG.world.tileTop;
const NODE_MODELS = {
  tree: ['survival/tree', 'survival/tree-tall', 'survival/tree-autumn'],
  rock: ['survival/rock-a', 'survival/rock-b', 'survival/rock-c'],
  crystal: ['detail-crystal-large', 'detail-crystal-large', 'detail-crystal'],
};
const NODE_SCALE = { tree: 1.55, rock: 1.55, crystal: 1.05 };
const LEFTOVER = { tree: 'survival/tree-trunk', rock: 'survival/rock-flat' };
const LEFTOVER_SCALE = { tree: 1.6, rock: 1.3 };
const WORKER_SCALE = 0.72;
const BAR_WIDTH = 0.8;
const BAR_HEIGHT = 0.1;
const CLIPS = { walk: 'walk', idle: 'idle', work: 'interact-right' };
const CARRY_MODELS = { wood: 'survival/resource-wood', stone: 'survival/resource-stone', crystal: 'detail-crystal' };
const CARRY_SCALE = { wood: 1.5, stone: 1.5, crystal: 0.28 };

function shortestAngle(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Model of a Kingdom building level (walls: see `buildWallModel`). */
export function buildBuildingModel(assets, def, level) {
  const root = new THREE.Group();
  const add = (name, scale, x = 0, z = 0, rotation = 0, y = 0) => {
    const mesh = assets.clone(name);
    mesh.scale.setScalar(scale);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    root.add(mesh);
    return mesh;
  };
  if (def.id === 'house') {
    add(['tower-square-roof-a', 'tower-square-roof-b', 'tower-square-roof-c'][level], [0.7, 0.8, 0.9][level]);
    add('survival/barrel', 1.2, 0.36, 0.34);
    if (level > 0) add('survival/box', 1.3, -0.36, 0.34, 0.4);
  } else if (def.id === 'depot') {
    add('survival/structure-roof', level ? 1.95 : 1.8);
    add('survival/barrel', 1.4, -0.25, -0.2);
    add('survival/chest', 1.4, 0.2, -0.18, 0.3);
    add('survival/box-large', 1.2, 0.2, 0.22, 1.57);
    if (level > 0) {
      add('survival/resource-planks', 1.6, -0.2, 0.25);
      add('survival/resource-stone', 1.6, -0.3, 0.05);
      add('survival/barrel', 1.4, 0.35, 0.35);
    }
  } else if (def.id === 'academy') {
    add('tower-round-build-d', 0.9);
    add('survival/workbench-anvil', 1.4, 0.42, 0.35, -0.6);
  } else if (def.id === 'wall') {
    root.add(buildWallModel(assets, level, true, false));
  }
  return root;
}

/** A palisade (level 0) runs along its neighbors; a stone wall (level 1) is a block. */
export function buildWallModel(assets, level, alongX, alongZ) {
  const root = new THREE.Group();
  if (level > 0) {
    const block = assets.clone('tower-square-bottom-a');
    block.scale.set(0.98, 1.25, 0.98);
    root.add(block);
    return root;
  }
  const fence = (rotation) => {
    const holder = new THREE.Group();
    const mesh = assets.clone('survival/fence-fortified');
    // The Kenney fence stands on the back edge of its tile: center it.
    mesh.position.z = 0.225;
    holder.add(mesh);
    holder.scale.setScalar(2);
    holder.rotation.y = rotation;
    root.add(holder);
  };
  if (alongX || !alongZ) fence(0);
  if (alongZ) fence(Math.PI / 2);
  return root;
}

/**
 * Kingdom visuals on top of the World island: resource nodes (instanced),
 * buildings and walls, workers (skinned, animated), portals and damage bars.
 */
export class RealmViews {
  constructor(scene, assets, world) {
    this.scene = scene;
    this.assets = assets;
    this.world = world;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.nodeMeshes = [];
    this.nodes = new Map();
    this.animating = new Set();
    this.structures = new Map();
    this.workers = new Map();
    this.dummy = new THREE.Object3D();
    this.cameraQuaternion = new THREE.Quaternion();
    this.pickGeometry = new THREE.BoxGeometry(0.9, 1, 0.9);
    this.pickGeometry.translate(0, 0.5, 0);
    this.pickMaterial = new THREE.MeshBasicMaterial({ visible: false });
    this.barGeometry = new THREE.PlaneGeometry(1, 1);
    this.barGeometry.translate(0.5, 0, 0);
    const barMaterial = (color) => new THREE.MeshBasicMaterial({ color, depthWrite: false, depthTest: false, toneMapped: false, fog: false });
    this.barBack = barMaterial(0x0b0a14);
    this.barFill = barMaterial(0x6ad0ff);
    this.barLow = barMaterial(0xff5a5a);
    this.shadowTexture = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(0,0,0,0.5)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    })();
    this.shadowMaterial = new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false });
    this.discGeometry = new THREE.PlaneGeometry(1, 1);
    this.discGeometry.rotateX(-Math.PI / 2);
  }

  // ------------------------------------------------------------ build

  build(sim) {
    this.clear();
    this.sim = sim;
    const random = seededRandom(sim.seed ^ 0x9e37);
    const groups = new Map();
    const push = (model, entry) => {
      if (!groups.has(model)) groups.set(model, []);
      groups.get(model).push(entry);
    };
    for (const cell of sim.level.cells) {
      const node = cell.node;
      if (!node) continue;
      const entry = {
        cell,
        type: node.type,
        rotation: random() * Math.PI * 2,
        size: NODE_SCALE[node.type] * (0.88 + random() * 0.26),
        offsetX: (random() - 0.5) * 0.12,
        offsetZ: (random() - 0.5) * 0.12,
        current: 0,
        target: 0,
        shake: 0,
      };
      push(NODE_MODELS[node.type][node.variant % 3], entry);
      if (LEFTOVER[node.type]) push(LEFTOVER[node.type], { ...entry, leftover: true, size: LEFTOVER_SCALE[node.type] * (0.9 + random() * 0.2) });
      this.nodes.set(cell.index, this.nodes.get(cell.index) ?? {});
    }
    const survivalFoliage = this.world.survivalFoliage ?? this.assets.materials.survival;
    for (const [model, list] of groups) {
      const material = model.startsWith('survival/tree') && model !== 'survival/tree-trunk' ? survivalFoliage : model.startsWith('survival/') ? this.assets.materials.survival : this.assets.material;
      const mesh = new THREE.InstancedMesh(this.assets.geometry(model), material, list.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = !model.includes('rock-flat');
      mesh.receiveShadow = true;
      list.forEach((entry, i) => {
        entry.mesh = mesh;
        entry.index = i;
        entry.current = 1;
        this.writeNode(entry);
      });
      mesh.computeBoundingSphere();
      mesh.userData.entries = list;
      this.root.add(mesh);
      this.nodeMeshes.push(mesh);
      for (const entry of list) {
        const slot = this.nodes.get(entry.cell.index);
        if (entry.leftover) slot.leftover = entry;
        else slot.node = entry;
      }
    }
    for (const slot of this.nodes.values()) this.syncNode(slot, true);
    for (const building of sim.buildings) this.addStructure(building);
    for (const tower of sim.towers) this.trackTower(tower);
    this.refreshWalls();
    for (const worker of sim.workers) this.addWorker(worker);
  }

  writeNode(entry) {
    const d = this.dummy;
    const s = Math.max(0.0001, entry.current * entry.size);
    d.position.set(entry.cell.x + entry.offsetX, TOP, entry.cell.z + entry.offsetZ);
    d.rotation.set(Math.sin(entry.shake * 40) * entry.shake * 0.35, entry.rotation, Math.cos(entry.shake * 33) * entry.shake * 0.25);
    d.scale.setScalar(s);
    d.updateMatrix();
    entry.mesh.setMatrixAt(entry.index, d.matrix);
    entry.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Targets the node (and its stump) scale from the simulated amount. */
  syncNode(slot, instant = false) {
    const node = slot.node?.cell.node;
    const alive = Boolean(node && node.amount > 0);
    if (slot.node) {
      slot.node.target = alive ? 0.82 + 0.18 * (node.amount / node.max) : 0;
      if (instant) slot.node.current = slot.node.target;
      this.animating.add(slot.node);
    }
    if (slot.leftover) {
      slot.leftover.target = node && !alive ? 1 : 0;
      if (instant) slot.leftover.current = slot.leftover.target;
      this.animating.add(slot.leftover);
    }
  }

  nodeChanged(cell) {
    const slot = this.nodes.get(cell.index);
    if (slot) this.syncNode(slot);
  }

  harvestHit(cell) {
    const entry = this.nodes.get(cell.index)?.node;
    if (!entry) return;
    entry.shake = 0.35;
    this.animating.add(entry);
  }

  // ------------------------------------------------------------ structures

  addStructure(structure) {
    const view = {
      structure,
      group: new THREE.Group(),
      model: null,
      pop: 1,
      shake: 0,
      bar: null,
      key: '',
    };
    view.group.position.set(structure.cell.x, TOP, structure.cell.z);
    view.pick = new THREE.Mesh(this.pickGeometry, this.pickMaterial);
    view.pick.userData.structure = structure;
    view.pick.scale.y = structure.def.id === 'wall' ? 0.8 : 1.3;
    view.group.add(view.pick);
    this.root.add(view.group);
    structure.view = view;
    this.structures.set(structure, view);
    this.rebuildStructure(view);
    if (structure.def.id === 'wall') this.refreshWalls(structure.cell);
    return view;
  }

  /** Towers are drawn by TowerViews; here they only get a damage bar. */
  trackTower(tower) {
    const view = { structure: tower, group: new THREE.Group(), tower: true, shake: 0, bar: null };
    view.group.position.set(tower.cell.x, TOP, tower.cell.z);
    this.root.add(view.group);
    tower.realmView = view;
    this.structures.set(tower, view);
  }

  rebuildStructure(view) {
    const s = view.structure;
    let key = `${s.def.id}:${s.level}`;
    let model;
    if (s.def.id === 'wall') {
      const along = this.wallNeighbors(s.cell);
      key += `:${along.x}:${along.z}`;
      if (key === view.key) return;
      model = buildWallModel(this.assets, s.level, along.x, along.z);
    } else {
      if (key === view.key) return;
      model = buildBuildingModel(this.assets, s.def, s.level);
    }
    if (view.model) view.group.remove(view.model);
    view.model = model;
    view.key = key;
    view.group.add(model);
  }

  upgradeStructure(structure) {
    const view = this.structures.get(structure);
    if (!view || view.tower) return;
    view.key = '';
    view.pop = 1;
    this.rebuildStructure(view);
  }

  removeStructure(structure) {
    const view = this.structures.get(structure);
    if (!view) return;
    view.group.removeFromParent();
    this.structures.delete(structure);
    structure.view = view.tower ? structure.view : null;
    if (view.tower) structure.realmView = null;
    if (structure.def.id === 'wall') this.refreshWalls(structure.cell);
  }

  wallNeighbors(cell) {
    const level = this.sim.level;
    const isWall = (dc, dr) => level.cellAt(cell.col + dc, cell.row + dr)?.structure?.def?.id === 'wall';
    return { x: isWall(1, 0) || isWall(-1, 0), z: isWall(0, 1) || isWall(0, -1) };
  }

  /** Re-orients the palisades around `cell` (or all of them). */
  refreshWalls(cell = null) {
    for (const view of this.structures.values()) {
      const s = view.structure;
      if (view.tower || s.def.id !== 'wall') continue;
      if (cell && Math.abs(s.cell.col - cell.col) + Math.abs(s.cell.row - cell.row) > 1) continue;
      this.rebuildStructure(view);
    }
  }

  hitStructure(structure) {
    const view = this.structures.get(structure);
    if (view) view.shake = 0.3;
  }

  /** The live resource node drawn under a screen ray (tall trees hide the cells behind them). */
  pickNode(raycaster) {
    const meshes = this.nodeMeshes.filter((mesh) => !mesh.userData.entries[0]?.leftover);
    for (const hit of raycaster.intersectObjects(meshes, false)) {
      const entry = hit.object.userData.entries[hit.instanceId];
      if (entry?.cell.node?.amount > 0) return entry.cell;
    }
    return null;
  }

  /** Buildings under a screen ray, nearest first. */
  pick(raycaster) {
    const boxes = [];
    for (const view of this.structures.values()) if (view.pick) boxes.push(view.pick);
    return raycaster.intersectObjects(boxes, false).map((hit) => hit.object.userData.structure);
  }

  ensureBar(view) {
    if (view.bar) return view.bar;
    const bar = new THREE.Group();
    const back = new THREE.Mesh(this.barGeometry, this.barBack);
    back.scale.set(BAR_WIDTH + 0.06, BAR_HEIGHT + 0.05, 1);
    back.position.x = -(BAR_WIDTH + 0.06) / 2;
    back.renderOrder = 20;
    const fill = new THREE.Mesh(this.barGeometry, this.barFill);
    fill.scale.set(BAR_WIDTH, BAR_HEIGHT, 1);
    fill.position.x = -BAR_WIDTH / 2;
    fill.renderOrder = 21;
    bar.add(back, fill);
    bar.position.y = view.tower ? 2.1 : view.structure.def.id === 'wall' ? 1.05 : 1.6;
    bar.userData.fill = fill;
    view.group.add(bar);
    view.bar = bar;
    return bar;
  }

  // ------------------------------------------------------------ workers

  addWorker(worker) {
    const name = CHARACTER_MODELS[(worker.id - 1) % CHARACTER_MODELS.length];
    const root = new THREE.Group();
    const model = this.assets.clone(name);
    model.scale.setScalar(WORKER_SCALE);
    model.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    root.add(model);
    const shadow = new THREE.Mesh(this.discGeometry, this.shadowMaterial);
    shadow.scale.setScalar(0.45);
    shadow.position.y = 0.012;
    shadow.renderOrder = 1;
    root.add(shadow);
    const mixer = new THREE.AnimationMixer(model);
    const clips = this.assets.animations.get(name) ?? [];
    const actions = {};
    for (const [key, clipName] of Object.entries(CLIPS)) {
      const clip = THREE.AnimationClip.findByName(clips, clipName);
      if (clip) actions[key] = mixer.clipAction(clip);
    }
    const hand = model.getObjectByName('arm-right');
    const tools = {};
    for (const [key, toolName] of [['axe', 'survival/tool-axe'], ['pickaxe', 'survival/tool-pickaxe']]) {
      const tool = this.assets.clone(toolName);
      tool.scale.setScalar(1.25);
      tool.rotation.set(Math.PI / 2, 0, 0);
      tool.position.set(-0.02, -0.08, 0.05);
      tool.visible = false;
      (hand ?? model).add(tool);
      tools[key] = tool;
    }
    const loads = {};
    for (const [resource, loadName] of Object.entries(CARRY_MODELS)) {
      const load = this.assets.clone(loadName);
      load.scale.setScalar(CARRY_SCALE[resource]);
      load.position.set(0, 0.56, -0.02);
      load.visible = false;
      root.add(load);
      loads[resource] = load;
    }
    root.position.set(worker.x, TOP, worker.z);
    this.root.add(root);
    const view = { worker, root, model, mixer, actions, current: null, tools, loads, yaw: Math.atan2(worker.dirX, worker.dirZ), phase: Math.random() * 10 };
    worker.view = view;
    this.workers.set(worker, view);
    this.play(view, 'idle');
    return view;
  }

  removeWorker(worker) {
    const view = this.workers.get(worker);
    if (!view) return;
    view.mixer.stopAllAction();
    view.root.removeFromParent();
    this.workers.delete(worker);
    worker.view = null;
  }

  play(view, key) {
    if (view.current === key || !view.actions[key]) return;
    const next = view.actions[key];
    next.reset().fadeIn(0.2).play();
    if (view.current && view.actions[view.current]) view.actions[view.current].fadeOut(0.2);
    view.current = key;
  }

  // ------------------------------------------------------------ frame

  update(dt, time, camera) {
    this.cameraQuaternion.copy(camera.quaternion);
    for (const entry of this.animating) {
      entry.current = damp(entry.current, entry.target, entry.target > entry.current ? 3 : 7, dt);
      if (entry.shake > 0) entry.shake = Math.max(0, entry.shake - dt);
      if (Math.abs(entry.current - entry.target) < 0.002) entry.current = entry.target;
      this.writeNode(entry);
      if (entry.current === entry.target && entry.shake === 0) this.animating.delete(entry);
    }

    const sim = this.sim;
    if (sim) {
      const open = sim.activePortals().length;
      (this.world.portals ?? []).forEach((portal, i) => {
        portal.visible = i < open;
      });
      // Workers chop and mine: their target node shakes on each swing.
      for (const worker of sim.workers) if (worker.state === 'harvest' && worker.node) {
        const entry = this.nodes.get(worker.node.index)?.node;
        if (entry && Math.sin(time * 9 + worker.id) > 0.97) {
          entry.shake = 0.18;
          this.animating.add(entry);
        }
      }
    }

    for (const view of this.structures.values()) {
      const s = view.structure;
      if (view.model && view.pop > 0) {
        view.pop = Math.max(0, view.pop - dt * 2.2);
        const t = 1 - view.pop;
        const bounce = Math.sin(t * Math.PI * 2.5) * (1 - t) * 0.35;
        view.model.scale.set(1 - bounce * 0.5, 1 + bounce, 1 - bounce * 0.5);
      }
      if (view.shake > 0) {
        view.shake = Math.max(0, view.shake - dt);
        const target = view.tower ? s.view?.group : view.model;
        if (target) target.position.x = (view.tower ? s.cell.x : 0) + Math.sin(time * 60) * view.shake * 0.12;
      } else if (view.tower && s.view?.group) {
        s.view.group.position.x = s.cell.x;
      } else if (view.model) {
        view.model.position.x = 0;
      }
      const damaged = s.hp < s.maxHp - 0.5;
      if (damaged || view.bar) {
        const bar = this.ensureBar(view);
        bar.visible = damaged;
        if (damaged) {
          const fraction = Math.max(0, s.hp / s.maxHp);
          const fill = bar.userData.fill;
          fill.scale.x = Math.max(0.001, BAR_WIDTH * fraction);
          fill.material = fraction < 0.35 ? this.barLow : this.barFill;
          bar.quaternion.copy(this.cameraQuaternion);
        }
      }
    }

    for (const view of this.workers.values()) {
      const w = view.worker;
      const visible = w.state !== 'hidden';
      view.root.visible = visible;
      if (!visible) continue;
      view.root.position.x = damp(view.root.position.x, w.x, 18, dt);
      view.root.position.z = damp(view.root.position.z, w.z, 18, dt);
      const moving = w.path.length > 0 && w.pathIndex < w.path.length && w.state !== 'harvest';
      const desired = Math.atan2(w.dirX, w.dirZ);
      view.yaw += shortestAngle(view.yaw, desired) * Math.min(1, dt * 10);
      view.root.rotation.y = view.yaw;
      this.play(view, w.state === 'harvest' ? 'work' : moving ? 'walk' : 'idle');
      const toolKey = w.job === 'wood' ? 'axe' : w.job ? 'pickaxe' : null;
      const holdTool = !w.carry && (w.state === 'harvest' || w.state === 'toNode');
      view.tools.axe.visible = holdTool && toolKey === 'axe';
      view.tools.pickaxe.visible = holdTool && toolKey === 'pickaxe';
      for (const [resource, load] of Object.entries(view.loads)) load.visible = w.carry?.resource === resource;
      if (w.carry) {
        const load = view.loads[w.carry.resource];
        load.position.y = 0.56 + (moving ? Math.abs(Math.sin(time * 9 + view.phase)) * 0.03 : 0);
      }
      view.mixer.update(dt * (moving ? 1.15 : 1));
    }
  }

  clear() {
    for (const mesh of this.nodeMeshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    this.nodeMeshes = [];
    this.nodes.clear();
    this.animating.clear();
    for (const view of this.structures.values()) view.group.removeFromParent();
    this.structures.clear();
    for (const view of this.workers.values()) {
      view.mixer.stopAllAction();
      view.root.removeFromParent();
    }
    this.workers.clear();
    this.sim = null;
  }

  dispose() {
    this.clear();
    this.pickGeometry.dispose();
    this.pickMaterial.dispose();
    this.barGeometry.dispose();
    this.barBack.dispose();
    this.barFill.dispose();
    this.barLow.dispose();
    this.shadowTexture.dispose();
    this.shadowMaterial.dispose();
    this.discGeometry.dispose();
  }
}
