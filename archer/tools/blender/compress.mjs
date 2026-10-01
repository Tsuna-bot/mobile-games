// Compresses a .glb exported by the Blender scripts (meshopt + quantization), like the other packs.
//
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   node compress.mjs <in.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(process.argv[2]);
await doc.transform(weld(), dedup(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(process.argv[3], doc);
let tris = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
console.log('meshes', doc.getRoot().listMeshes().length, 'triangles', Math.round(tris));
