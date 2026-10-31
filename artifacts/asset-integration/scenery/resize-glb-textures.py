#!/usr/bin/env python3
"""Deterministically resize embedded GLB PBR images; preserve all non-image views.

Requires existing local Pillow. No network, generation service, new extension,
mesh simplification, material rewrite, source overwrite or animation conversion.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct

import PIL
from PIL import Image, ImageMath


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_glb(data):
    if len(data) < 20 or struct.unpack_from('<4sII', data) != (b'glTF', 2, len(data)):
        raise ValueError('Expected glTF 2.0 GLB')
    chunks = {}
    offset = 12
    while offset < len(data):
        size, kind = struct.unpack_from('<II', data, offset)
        if offset + 8 + size > len(data) or kind in chunks:
            raise ValueError('Invalid or repeated GLB chunk')
        chunks[kind] = data[offset + 8:offset + 8 + size]
        offset += 8 + size
    if set(chunks) != {0x4E4F534A, 0x004E4942}:
        raise ValueError('Expected one JSON and one embedded BIN chunk')
    doc = json.loads(chunks[0x4E4F534A])
    if len(doc.get('buffers', [])) != 1 or 'uri' in doc['buffers'][0]:
        raise ValueError('Only self-contained one-buffer GLBs are supported')
    return doc, chunks[0x004E4942]


def image_roles(doc):
    roles = {i: set() for i in range(len(doc.get('images', [])))}
    def add(texture, role):
        if texture is not None:
            entry = doc['textures'][texture['index']]
            if 'source' not in entry:
                raise ValueError('An extension-based image source needs a separate preparation path')
            roles[entry['source']].add(role)
    for material in doc.get('materials', []):
        pbr = material.get('pbrMetallicRoughness', {})
        add(pbr.get('baseColorTexture'), 'baseColor-sRGB')
        add(pbr.get('metallicRoughnessTexture'), 'metallicRoughness-linear')
        add(material.get('normalTexture'), 'normal-linear')
        add(material.get('occlusionTexture'), 'occlusion-linear')
        add(material.get('emissiveTexture'), 'emissive-sRGB')
    return roles


def normalize_normals(image):
    """Filter normal-map samples as data, then restore unit XYZ without a Y flip."""
    rgb = image.convert('RGB')
    xyz = [channel.convert('F').point(lambda value: value * (2.0 / 255.0) - 1.0) for channel in rgb.split()]
    length = ImageMath.lambda_eval(lambda a: (a['x'] * a['x'] + a['y'] * a['y'] + a['z'] * a['z'] + 1e-12) ** 0.5,
                                  x=xyz[0], y=xyz[1], z=xyz[2]).convert('F')
    channels = [ImageMath.lambda_eval(lambda a: (a['v'] / a['n'] + 1.0) * 127.5 + 0.5,
                                     v=channel, n=length).convert('L') for channel in xyz]
    result = Image.merge('RGB', channels)
    if 'A' in image.getbands():
        result.putalpha(image.getchannel('A'))
    return result


def resize(data, mime, roles, maximum, quality):
    if mime not in ('image/png', 'image/jpeg'):
        raise ValueError(f'Unsupported embedded image type: {mime}')
    with Image.open(io.BytesIO(data)) as original:
        before = original.size
        factor = min(1.0, maximum / max(before))
        after = tuple(max(1, round(value * factor)) for value in before)
        alpha = 'A' in original.getbands() or 'transparency' in original.info
        if before == after:
            return data, before, after, alpha, False
        if 'normal-linear' in roles and roles != {'normal-linear'}:
            raise ValueError('A normal image shared with another PBR semantic needs manual review')
        image = original.convert('RGBA' if alpha else 'RGB').resize(after, Image.Resampling.LANCZOS)
        normalized = 'normal-linear' in roles
        if normalized:
            image = normalize_normals(image)
        out = io.BytesIO()
        if mime == 'image/jpeg':
            if alpha:
                raise ValueError('JPEG source unexpectedly carried alpha')
            image.save(out, format='JPEG', quality=quality, subsampling=0, optimize=False, progressive=False,
                       **({'icc_profile': original.info['icc_profile']} if 'icc_profile' in original.info else {}))
        else:
            image.save(out, format='PNG', optimize=False, compress_level=9,
                       **({'icc_profile': original.info['icc_profile']} if 'icc_profile' in original.info else {}))
        return out.getvalue(), before, after, alpha, normalized


def convert(source, destination, maximum=1024, quality=90):
    source, destination = Path(source), Path(destination)
    if source.resolve() == destination.resolve():
        raise ValueError('Source and runtime destination must differ')
    if maximum < 1 or not 1 <= quality <= 100:
        raise ValueError('Invalid image budget')
    original = source.read_bytes()
    doc, binary = read_glb(original)
    source_doc = json.loads(json.dumps(doc))
    roles = image_roles(doc)
    views = doc.get('bufferViews', [])
    payloads = []
    for view in views:
        if view.get('buffer', 0) != 0:
            raise ValueError('Unexpected non-embedded buffer view')
        start, length = view.get('byteOffset', 0), view['byteLength']
        if start < 0 or start + length > len(binary):
            raise ValueError('Buffer view exceeds embedded BIN')
        payloads.append(binary[start:start + length])
    source_payloads = list(payloads)
    accessor_views = {a['bufferView'] for a in doc.get('accessors', []) if 'bufferView' in a}
    for accessor in doc.get('accessors', []):
        if 'sparse' in accessor:
            accessor_views.update(accessor['sparse'][kind]['bufferView'] for kind in ('indices', 'values'))
    changed_views = set()
    image_records = []
    for index, image in enumerate(doc.get('images', [])):
        if 'uri' in image or 'bufferView' not in image:
            raise ValueError('All runtime images must already be embedded')
        view_id = image['bufferView']
        if view_id in accessor_views or view_id in changed_views:
            raise ValueError('Shared image/accessor or repeated image buffer view needs manual review')
        encoded, before, after, alpha, normalized = resize(payloads[view_id], image['mimeType'], roles[index], maximum, quality)
        payloads[view_id] = encoded; changed_views.add(view_id)
        image_records.append({'image': index, 'mimeType': image['mimeType'], 'roles': sorted(roles[index]),
                              'sourceDimensions': list(before), 'runtimeDimensions': list(after), 'alphaPreserved': alpha,
                              'sourceBytes': len(source_payloads[view_id]), 'runtimeBytes': len(encoded),
                              'sourceSha256': sha(source_payloads[view_id]), 'runtimeSha256': sha(encoded),
                              'normalRenormalized': normalized})
    packed = bytearray()
    for view, payload in zip(views, payloads):
        packed.extend(b'\x00' * ((-len(packed)) % 4))
        view['byteOffset'] = len(packed); view['byteLength'] = len(payload)
        packed.extend(payload)
    doc['buffers'][0]['byteLength'] = len(packed)
    packed.extend(b'\x00' * ((-len(packed)) % 4))
    json_bytes = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    json_bytes += b' ' * ((-len(json_bytes)) % 4)
    result = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(json_bytes) + 8 + len(packed))
    result += struct.pack('<II', len(json_bytes), 0x4E4F534A) + json_bytes
    result += struct.pack('<II', len(packed), 0x004E4942) + packed
    runtime_doc, runtime_binary = read_glb(result)
    invariant_keys = ('asset', 'scenes', 'scene', 'nodes', 'meshes', 'accessors', 'materials', 'textures', 'samplers', 'skins', 'animations', 'extensionsUsed', 'extensionsRequired')
    for key in invariant_keys:
        if runtime_doc.get(key) != source_doc.get(key):
            raise AssertionError(f'Unexpected change to {key}')
    preserved = []
    for index, view in enumerate(runtime_doc.get('bufferViews', [])):
        if index in changed_views:
            continue
        payload = runtime_binary[view['byteOffset']:view['byteOffset'] + view['byteLength']]
        if payload != source_payloads[index]:
            raise AssertionError(f'Non-image data changed: buffer view {index}')
        preserved.append({'bufferView': index, 'bytes': len(payload), 'sha256': sha(payload)})
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + '.tmp')
    temporary.write_bytes(result); temporary.replace(destination)
    if sha(source.read_bytes()) != sha(original):
        raise AssertionError('Source changed during processing; do not use this result')
    return {'source': str(source), 'runtime': str(destination), 'sourceSha256': sha(original), 'runtimeSha256': sha(result),
            'sourceBytes': len(original), 'runtimeBytes': len(result), 'maxTextureEdge': maximum,
            'encoding': {'Pillow': PIL.__version__, 'JPEGQuality': quality, 'JPEGSubsampling': 0, 'PNGCompressLevel': 9, 'resample': 'LANCZOS'},
            'images': image_records, 'nonImageBufferViewsPreserved': preserved,
            'jsonInvariantsPreserved': list(invariant_keys),
            'estimatedRGBA8WithMipmapsBytes': {
                'source': round(sum(4 * r['sourceDimensions'][0] * r['sourceDimensions'][1] * 4 / 3 for r in image_records)),
                'runtime': round(sum(4 * r['runtimeDimensions'][0] * r['runtimeDimensions'][1] * 4 / 3 for r in image_records))},
            'limitations': ['Estimated uncompressed RGBA8+mipmaps only; actual renderer allocation requires runtime profiling.',
                            'Image resizing does not establish rendered PBR, collision, gameplay or Windows acceptance.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--report', required=True, type=Path)
    parser.add_argument('--max-size', type=int, default=1024)
    parser.add_argument('--jpeg-quality', type=int, default=90)
    args = parser.parse_args()
    report = convert(args.input, args.output, args.max_size, args.jpeg_quality)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ('sourceSha256', 'runtimeSha256', 'sourceBytes', 'runtimeBytes')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
