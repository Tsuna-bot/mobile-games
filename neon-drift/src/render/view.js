import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from '../config.js';
import { QUALITY_PRESETS } from './quality.js';

/** Owns the WebGL renderer, scene, camera and optional bloom post-processing. */
export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 600);

    this.composer = null;
    this.bloomPass = null;
    this.qualityLevel = 'high';
    this.preset = QUALITY_PRESETS.high;
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.contextLost = false;

    this.onResize = null;
    this.onContextLost = null;
    this.onContextRestored = null;

    this.handleContextLost = (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.onContextLost?.();
    };
    this.handleContextRestored = () => {
      // three.js re-uploads scene resources by itself. The composer's render targets
      // still reference GL objects of the lost context, so they are replaced (not
      // disposed: deleting objects from a dead context only produces GL warnings).
      this.contextLost = false;
      if (this.composer) {
        this.composer = null;
        this.createComposer();
        this.resize();
      }
      this.onContextRestored?.();
    };
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  get maxAnisotropy() {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  applyQuality(level) {
    this.qualityLevel = level;
    this.preset = QUALITY_PRESETS[level];
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.preset.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);

    if (this.preset.bloom && !this.composer) this.createComposer();
    if (!this.preset.bloom && this.composer) this.disposeComposer();

    this.resize();
  }

  createComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(this.width, this.height), 0.6, 0.4, 0.85);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  disposeComposer() {
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.dispose();
    this.composer = null;
    this.bloomPass = null;
  }

  resize() {
    const width = Math.max(1, Math.floor(this.canvas.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight || window.innerHeight));
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(width, height);
    }
    this.onResize?.(width, height);
  }

  render() {
    if (this.contextLost) return;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    if (this.composer) this.disposeComposer();
    this.renderer.dispose();
  }
}
