# 愈见花园随附的第三方资源

以下路径以 `MindGarden/static/` 为起点。相应的许可证全文和版权声明随仓库提供。

| 随附资源 | 上游与用途 | 许可证与声明 |
| --- | --- | --- |
| `vendor/mediapipe/three.module.js`、`GLTFLoader.js`、`BufferGeometryUtils.js` | Three.js r160 与同版加载器。用于舞伴模型展示和历史三维场景。加载器通过本地路径导入依赖。[Three.js r160](https://github.com/mrdoob/three.js/tree/r160) | [MIT，Three.js Authors](licenses/threejs-LICENSE.txt) |
| `vendor/mediapipe/vision_bundle.mjs`、`vendor/mediapipe/wasm/` | Google MediaPipe Tasks Vision 0.10.14。提供本地人体和手势识别。[Tasks Vision 官方发布包](https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.14) | [Apache-2.0](licenses/Apache-2.0.txt) |
| `models/pose_landmarker_lite.task`、`models/hand_landmarker.task` | Google MediaPipe 人体姿态与手部关键点模型。用于跟跳和拍照手势。[人体模型卡](https://developers.google.com/ml-kit/images/vision/pose-detection/pose_model_card.pdf) · [手部模型卡](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf) | [Apache-2.0](licenses/Apache-2.0.txt) |
| `js/echarts.js` | Apache ECharts 6.0.0，交互图表。[上游版本](https://github.com/apache/echarts/tree/6.0.0) | [LICENSE](licenses/echarts/LICENSE) · [NOTICE](licenses/echarts/NOTICE) · [d3 子组件](licenses/echarts/licenses/LICENSE-d3) |
| `js/echarts.min.js`、`js/echarts.common.js`、`js/echarts.common.min.js` | Apache ECharts 5.6.0，图表构建文件。[上游版本](https://github.com/apache/echarts/tree/5.6.0) | [LICENSE](licenses/echarts-5.6.0/LICENSE) · [NOTICE](licenses/echarts-5.6.0/NOTICE) · [d3 子组件](licenses/echarts-5.6.0/licenses/LICENSE-d3) |
| `js/echarts-wordcloud.js`、`js/echarts-wordcloud.min.js` | ecomfe 的 echarts-wordcloud 2.1.0 及内嵌的 wordcloud2.js。用于词云。[扩展发布包](https://www.npmjs.com/package/echarts-wordcloud/v/2.1.0) | [扩展 ISC](licenses/echarts-wordcloud-ISC.txt) · [内嵌 wordcloud2.js 的 MIT 声明](licenses/wordcloud2-LICENSE.txt) |
| `garden/quarter/street-lettering.woff` | ZCOOL KuaiLe 的中文字形子集，已更名为 MindGarden Street Lettering，用于历史街景招牌。[原字体](https://github.com/googlefonts/zcool-kuaile) | [SIL Open Font License 1.1](../garden/quarter/street-lettering-OFL.txt) |

## 项目插画、角色与音乐

花园插画、迎客角色和团队使用腾讯混元生 3D 生成的舞伴「歪歪」按项目素材管理。仓库根目录的 MIT 许可证适用于团队自有程序源码。三时段原稿、团队加工与生成式工具的使用见[二维花园素材说明](../../../文档/素材来源/二维花园.md)与[小屋角色说明](../../../文档/素材来源/樱桃小屋.md)。

音乐目录支持放入使用者自行取得授权的音频，所需格式见[本地歌单说明](../music/README.md)。运行时下载的模型和接入的外部服务以各自发布方条款为准。
