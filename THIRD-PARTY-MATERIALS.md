# 本地材质来源与铺贴

新增 10 组 ambientCG 材质，作者为 Lennart Demes / ambientCG 贡献者，使用 [CC0 1.0 许可](https://docs.ambientcg.com/license/)。官方许可允许复制、修改及随项目分发，包括商业用途。原始 1K JPG 下载包中的 Color、NormalGL、Roughness 三张贴图保存在 `assets/materials/`，共 30 张、22,513,305 字节；运行网页时只读取本地文件，不向素材网站上传户型或方案。

| 网页名称 | 原始素材 | 默认铺贴规格 mm | 默认分缝 |
| --- | --- | --- | --- |
| 云纹白大理石 | [Marble012](https://ambientcg.com/view?id=Marble012) | 1200 × 600 | 2 mm 通缝 |
| 墨灰大理石 | [Marble006](https://ambientcg.com/view?id=Marble006) | 1200 × 600 | 2 mm 通缝 |
| 米白洞石 | [Travertine009](https://ambientcg.com/view?id=Travertine009) | 1200 × 600 | 2 mm 通缝 |
| 灰褐洞石 | [Travertine004](https://ambientcg.com/view?id=Travertine004) | 1200 × 600 | 2 mm 通缝 |
| 暖砂花岗岩 | [Granite001A](https://ambientcg.com/view?id=Granite001A) | 600 × 600 | 2 mm 通缝 |
| 灰粒花岗岩 | [Granite002B](https://ambientcg.com/view?id=Granite002B) | 600 × 600 | 2 mm 通缝 |
| 彩粒水磨石 | [Terrazzo013](https://ambientcg.com/view?id=Terrazzo013) | 800 × 800 | 2 mm 通缝 |
| 细腻混凝土 | [Concrete034](https://ambientcg.com/view?id=Concrete034) | 1100 × 550 纹理覆盖 | 连续无分缝 |
| 白色灰泥 | [Plaster001](https://ambientcg.com/view?id=Plaster001) | 2000 × 2000 纹理覆盖 | 连续无分缝，墙面用 |
| 细纹涂料墙 | [PaintedPlaster017](https://ambientcg.com/view?id=PaintedPlaster017) | 2000 × 2000 纹理覆盖 | 连续无分缝，墙面用 |

铺贴规格、纹理覆盖尺寸和估价是软件中的设计预设，并非商品实测、厂商规格或报价。可按实际产品修改规格。来源 API 提供的原始尺寸（若有）单独保留在 `assets/materials/manifest.json`，不把未知尺寸当成测量结果。

所选原始素材是未带砖格的连续表面。软件从这些表面裁切铺贴，避免拉伸图案；仅绘制一套接缝，颜色、法线、粗糙度采用同一套格缝位置。通缝与半砖错缝使用两行两列的连续平铺图集，半砖位移只作用于隔行竖缝；图集边缘的半条缝与下一周期合成完整缝。分缝不是墙体分段或模型上的凹槽；当前为纹理表现，不生成逐砖实体及施工排版图。

原有 11 种程序材质及旧方案保留。用户未改铺贴设置时沿用旧效果；明确设置尺寸或分缝后，从去掉旧格缝的基础纹理生成新图集。房间的 `surfaceLayout` 与单面墙的 `wallFinishes[side].layout` 各自保存，包含 `tileW / tileH / jointMm / jointColor / pattern / rotation`。标准 3D、柔光、轴测、二维平面及图片导出共用尺寸和分缝设置；墙面沿墙起点连续铺设，门窗洞口继续留空。

下载来源、文件名、原始下载地址和 SHA-256 见 `assets/materials/manifest.json`。可运行 `node download-materials.cjs` 重新下载同一小组素材；不需要密钥，不会下载执行程序。
