# CH-LU 成年概念图

- 角色来源：`docs/handoff/current/03_CHARACTERS_AND_ARCS.md`；十九岁维修工兼反抗军成员。
- 工具：ImageGen 内置工具。v2 已完成并目视检查，选作建模候选。
- 用途：单人全身 A pose 图生模型输入。概念候选不代表模型、绑定或动作验收通过。
- 凭证探测：Tripo API 未配置；未提交模型任务。
- v1 原图：`/Users/penguin/.codex/generated_images/01a18ca7-4653-72c2-891d-f97e4eea8615/exec-e38ed863-3cf0-4f1d-97ad-f9997310c392.png`。衣装可用，头部与肢体仍是切面写实比例，未满足方块人。
- 项目选图：`assets/concepts/CH-LU/adult-v2.png`，1024×1536。完整头脚、双臂与双腿分离，明确方块头与分节直棱肢体，保留维修工服识别色。没有武器融合、背景道具或水印。衣物纹理、头发和手部仍可在模型阶段简化。
- 状态：概念完成；3D 未提交，绑定与动作 NOT_RUN。未付费重复提交 Tripo；缺失凭证仅影响这条资产生产线。
- v2 SHA-256：`fc8713e79a52f4d7fcf69243d5ef95e9ab1d1bc831db6028a88ba92260746668`。

## v2 实际修订提示词

```text
Use case: style-transfer.
Image 1 is the edit target, the original Lu Wenchuan character concept. Keep the same young maintenance worker, short dark hair, blue-grey work clothes with restrained orange stripes, gloves, boots, single full-body neutral A-pose, plain pale grey background, framing and soft light.
Change ONE thing: completely rebuild his body geometry as a true BLOCK PERSON. His head must be a literal six-sided rectangular CUBE with flat front, flat sides, a square silhouette, simple dark rectangular eyes and a tiny flat mouth drawn on the cube face; do not retain the realistic cheekbones, jaw, nose or ears. Hair is a few cuboids sitting on top of the cube. Torso, upper arms, forearms, palms, thighs and lower legs are plain rectangular cuboids with straight parallel edges and right-angle corners. Flatten the clothing panels onto these cuboids; pockets and pads are very shallow rectangular plates. Preserve a lean young-adult appearance with approximately six head-heights of total height, clearly articulated limbs and small joint gaps. Hands are rectangular blocks with one simple thumb block, not realistic sculpted fingers. Boots are block-shaped. This is deliberate block animation geometry, not merely a triangulated realistic human. Do not bevel the head into a realistic face or round the body. No added objects, views, weapons, labels or decoration. Show only this corrected block-person concept.
```

## v1 实际生成提示词

```text
Use case: stylized-concept
Asset type: CH-LU adult character concept, a single image-to-3D source for an original Three.js first-person narrative game, Return to Ganymede.
Primary request: Create one original full-body character, Lu Wenchuan, a nineteen-year-old Chinese male maintenance technician and local resistance member living inside a worn industrial settlement on Ganymede. He is competent, practical and observant, not a superhero.
Scene/backdrop: seamless plain pale-grey studio background.
Subject: square low-poly head, short dark hair made of a few clear angular masses, simply modeled young adult face with small dark eyes, lean adult body. Strong block-built construction with rectangular torso, articulated cuboid upper and lower arms, cuboid hands, thighs and shins, flat sturdy boots. A functional worn blue-grey maintenance jacket and trousers, muted warm-orange utility seam accents, dark work gloves and boots, simple work belt, understated reinforcement at knees and elbows. Clothing has large readable panels, restrained wear and a small number of shallow pockets.
Style/medium: clean stylized 3D game character render, deliberately block-shaped low-poly anatomy, flat material colors with subtle roughness. A serious, humane industrial science-fiction tone. Original design, not a reproduction of any existing franchise character.
Composition/framing: ONLY ONE character, full body head to toe, centered with comfortable margin. A balanced symmetric relaxed A-pose, arms clearly separated from torso, straight separated legs and both hands visible. Near-frontal three-quarter camera turned only about 15 degrees, orthographic-like minimal perspective. Clear uninterrupted silhouette for image-to-3D reconstruction and later rigging.
Lighting/mood: soft neutral studio light, visible material separation, minimal soft contact shadow.
Constraints: adult proportions, about six heads tall; retain an unmistakably cuboid head and limbs, no rounded realistic anatomy, no chibi toddler proportions. No gun, tools held in hands, backpack, loose cables, large armor, cape, helmet, visor, scenery, pedestal, duplicate views, text, logos or watermark. Keep both arms and legs unoccluded and distinguishable. No gradients or dramatic lighting that hide geometry.
```
