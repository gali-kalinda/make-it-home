# 将 Make It Home 发布到 GitHub

## 推荐：GitHub Desktop

1. 解压交付的 ZIP，得到 `make-it-home` 文件夹。
2. 安装 GitHub Desktop 并登录自己的账号。
3. File → Add local repository，选择该文件夹。如果提示不是仓库，选择在这里创建；名称填 `make-it-home`。不要生成或覆盖现有 README、LICENSE、.gitignore。
4. 检查 Changes：必须包含 `.gitignore`、`.gitattributes`、`.github/workflows/ci.yml`、源码、`examples/`、`assets/`、`vendor/`、`licenses/` 与文档；不能包含 `.local/`、`node_modules/`、个人图片或输出。
5. 提交说明可填 `Initial release: Make It Home`，然后 Publish repository，取消 Keep this code private（若希望公开），由你确认发布。
6. 仓库 About 描述可填：`An editable 2D/3D home planner with a built-in demo and optional AI integrations.`
7. Topics 可填：`floorplan`、`interior-design`、`threejs`、`home-design`、`ai`。
8. 检查 Actions。绿色通过后，在 Releases → Draft a new release，标签填 `v1.0.0`，标题填 `Make It Home 1.0.0`，附上发布说明并发布。GitHub 会自动生成源码 ZIP；也可将交付 ZIP 附在 Release 中。

不要只把一个 ZIP 当作仓库里的唯一文件上传：GitHub 应看到解压后的源码结构。`.gitignore` 等以点开头的文件同样要上传。此发布包内单文件小于 25 MiB；浏览器上传还存在单次文件数量限制，用 Desktop 更方便。GitHub 官方限制见 [About large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。

## 命令行方式

在解压后的 `make-it-home` 目录内执行。先自己在 GitHub 创建空仓库，不自动添加 README 或 LICENSE。

```sh
git init
git add .
git status
git commit -m "Initial release: Make It Home"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/make-it-home.git
git push -u origin main
```

将 YOUR_USERNAME 换成自己的账号。不要把个人访问令牌写入文件、远程 URL 或聊天。

## 上游归属与许可

代码来自 `wy51ai/floorplan-3d`，其 MIT 许可要求保留版权声明与许可文本。已经在 README、LICENSE、THIRD_PARTY_NOTICES 和 licenses 中放好，不必另发 Issue 或 @ 作者，也不需要把原作者写成此新仓库的共同维护者。

若想让 GitHub 显示 Fork 关系，可先在 GitHub fork 上游，再在你自己的 fork 中提交完整衍生版本；普通新建仓库则在 README 如实注明来源。两种方式都必须保留原许可，不能把继承代码标注为完全原创。

AI 服务不随开源项目赠送：每位用户需要自行填写合法可用的接口密钥，费用由其账号承担。不要承诺所有对话模型都能生图、模型绝对精确或离线可执行 AI 推理。

## 可直接用于 Release 的说明

Make It Home 1.0.0：支持空白新建、户型上传与结构校对、2D/3D 家具布置、材质编辑、历史方案及 JSON 导入导出。内置 3 房间、26 件家具、约 35.42㎡ 的演示案例；查看无需 API。可选模型生成与图像生成接口分别配置，三视图确认后再建模。首次使用需 Node.js 22+，Windows 双击 start.cmd，macOS/Linux 执行 sh start.sh。感谢 floorplan-3d 与第三方开源项目，许可详见仓库。
