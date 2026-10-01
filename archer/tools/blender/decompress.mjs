// Undoes meshopt + quantization so Blender 4.0 can import a game model (hero portraits).
//
//   node decompress.mjs <in.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [src, out] = process.argv.slice(2);
const doc = await io.read(src);
await doc.transform(dequantize());
for (const ext of doc.getRoot().listExtensionsUsed()) if (/meshopt|quantization/.test(ext.extensionName)) ext.dispose();
await io.write(out, doc);
console.log('ok', out);
