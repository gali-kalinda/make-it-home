# Third-party notices / 第三方来源与许可

Make It Home 是 floorplan-3d 的修改与扩展版本。根目录 LICENSE 保留原作者版权并增加衍生项目贡献者版权；第三方内容不因根许可而改变其原有许可。

| 内容 | 来源 | 许可与本包中的说明 |
| --- | --- | --- |
| 原始应用基础代码与程序生成的基础家具 | [wy51ai/floorplan-3d](https://github.com/wy51ai/floorplan-3d) | MIT；Copyright (c) 2026 wuyi；原文在 `licenses/floorplan-3d-LICENSE` |
| Three.js 0.160.0 与选用的 addons | [mrdoob/three.js](https://github.com/mrdoob/three.js) | MIT；原文在 `vendor/THREE-LICENSE.txt`、`licenses/three-LICENSE.txt` |
| Tesseract.js、worker | [naptha/tesseract.js](https://github.com/naptha/tesseract.js) | Apache-2.0；`vendor/tesseract/LICENSE.md` |
| 前端 OCR bundle 内的 buffer、regenerator-runtime、zlibjs、ieee754 | [buffer](https://github.com/feross/buffer)、[regenerator](https://github.com/facebook/regenerator)、[zlib.js](https://github.com/imaya/zlib.js)、[ieee754](https://github.com/feross/ieee754) | MIT / BSD-3-Clause；许可证在 `licenses/`；保留两个 `vendor/tesseract/*.LICENSE.txt` 打包版权通知 |
| Tesseract.js-core / WebAssembly（通过 npm 安装） | [naptha/tesseract.js-core](https://github.com/naptha/tesseract.js-core) | Apache-2.0；`vendor/tesseract/CORE-LICENSE` 及 `licenses/tesseract.js-core-LICENSE`；WASM 二进制不放入本源码包，由 npm 安装 |
| 英文 OCR 数据 eng.traineddata.gz（通过 npm 安装） | [tesseract-ocr/tessdata](https://github.com/tesseract-ocr/tessdata) / [naptha/tessdata](https://github.com/naptha/tessdata) | 数据仓库 Apache-2.0，见 `licenses/tessdata-Apache-2.0.txt`；npm 包 `@tesseract.js-data/eng@1.0.0` 的包装元数据另标 MIT。训练数据不放入本源码包，由 npm 安装 |
| sharp（通过 npm 安装） | [lovell/sharp](https://github.com/lovell/sharp) | Apache-2.0；`licenses/sharp-LICENSE`；运行时原生依赖另遵循安装包内许可证，包括 libvips 的 LGPL 条款。本源码包不分发 node_modules 或原生二进制 |
| 十组 PBR 材质 | [ambientCG](https://ambientcg.com/) / Lennart Demes | CC0-1.0；来源、哈希及用途见 `THIRD-PARTY-MATERIALS.md` 和 `assets/materials/manifest.json`；[官方许可](https://docs.ambientcg.com/license/) |

## 修改说明

在原始交互和场景基础上，Make It Home 增加或修改了可编辑墙体/门窗结构、比例校准、房间与材质编辑、家具库、历史方案、空白新建、案例入口、模型与图像两类接口、三视图确认流程、接口响应校验和本机密钥保存。此项目不代表上游或任何模型服务商。

## 内置案例

`examples/studio-35m2.json` 来自项目维护者指定的 2026-10-21 保存方案，保留 12 段墙、3 个房间、26 件家具、5 个实际使用的自定义 GLB。自定义 GLB 为本项目制作的程序化近似模型，纹理为程序绘制。已去掉原始参考照片、户型底图、效果图与未使用的库资源；不声称原始家具设计的商标或产品设计权归本项目所有。

案例的结构曾使用本机 CubiCasa5K 做识别。本包只保存该方案的矢量结果，不包含其模型权重、源数据集、Python 包或推理代码。CubiCasa5K 的数据/模型不是本项目 MIT 代码的一部分，不能将其当作 MIT 依赖直接重新打包；如另行安装，须核对 [CubiCasa5k 原仓库](https://github.com/CubiCasa/CubiCasa5k) 的独立许可（本机副本标注 CC BY-NC 4.0）。

## 发布时需要做什么

保留上面的来源链接、完整许可副本和原始版权声明。MIT 不要求在 GitHub 上 @ 作者，也不要求先私信申请许可；README 链接致谢是合适做法，@ 只是自愿礼貌行为。致谢不能替代保留 LICENSE。其他后续加入的模型、照片、字体和贴图需逐项确认授权。
